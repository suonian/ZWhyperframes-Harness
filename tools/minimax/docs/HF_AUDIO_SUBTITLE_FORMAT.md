# HF 语音与字幕格式调研结论

调研日期：2026-07-09

## 结论

> 现行生产决策更新（2026-07-16）：每个不超过 120 秒的语义大段落生成一条连续 MiniMax 主语音，再由项目适配器按 `SCRIPT.md` 的 Frame 边界切成本地音频片段，并生成 HF 官方 `audio_meta.json`。详细规则以项目根目录 `docs/rules/hf-official-workflow-execution-rules.md` 为准。

MiniMax 当前返回的 `.titles` 字幕文件不能原样直接作为 HF 字幕输入，但它包含 HF 需要的核心信息：词语、词级开始时间、词级结束时间。正式生产统一转换为 HF `audio_meta.json`；字幕分组和字幕 composition 随后由官方 `captions.mjs` 生成，不再建立项目自定义的平行字幕合同。

本项目应采用：

```text
MiniMax 音频 = 主时间轴
MiniMax 词级字幕 = 原始时间戳来源
HyperFrames = 字幕表现、元素动画、镜头编排和最终渲染
```

不要让 HF 重新生成语音，也不要在 MiniMax 已返回词级时间戳时再用 HF 自己转写。只有在 MiniMax 字幕缺失或异常时，才考虑用 HF `transcribe` 作为兜底。

## HF 如何定义音频

HF 的音频是 HTML timeline clip，不是单独的“旁白对象”。典型形式：

```html
<audio
  id="voiceover"
  src="assets/minimax/voice/narration.mp3"
  data-start="0"
  data-duration="12.34"
  data-track-index="10"
  data-volume="1"
></audio>
```

关键规则：

- `<audio>` 由 HF runtime 管理播放、暂停、seek 和时间同步。
- 不要在 composition 脚本中手动调用 `audio.play()`、`audio.pause()` 或设置 `audio.currentTime`。
- `data-start` 使用秒。
- `data-duration` 对音频可选，但生产中建议写入 MiniMax 实际时长，便于检查和对齐。
- `data-track-index` 用于时间线轨道，多个音频可在不同轨道重叠。
- `data-volume` 控制音量，BGM 需要低于人声。

## HF 如何定义字幕

HF 字幕不是固定读取一个 `.srt` 或 `.vtt` 文件。常见流水线是：

1. 音频引擎生成 `audio_meta.json`。
2. `captions.mjs` 读取 `STORYBOARD.md` 和 `audio_meta.json`。
3. 脚本根据词级时间戳生成：
   - `caption_groups.json`
   - `caption-overrides.json`
   - `compositions/captions.html`
4. `index.html` 将 `compositions/captions.html` 作为 captions 子 composition 挂载到主视频。

HF 关键字幕数据结构是 `audio_meta.json` 中的 `voices[].words[]`：

```json
{
  "voices": [
    {
      "frame": 1,
      "path": "assets/minimax/voice/narration-01.mp3",
      "duration_s": 3.24,
      "words": [
        {
          "id": "w0",
          "text": "这是",
          "start": 0.034,
          "end": 0.171
        }
      ]
    }
  ]
}
```

字段含义：

- `frame`：该段语音归属的 storyboard frame 编号。
- `path`：音频文件路径。
- `duration_s`：该段音频时长，单位秒。
- `words[].text`：字幕词。
- `words[].start`：词开始时间，单位秒。
- `words[].end`：词结束时间，单位秒。

HF `captions.mjs` 会把 frame 内相对时间转换成全片绝对时间：

```text
绝对词时间 = frame 在 STORYBOARD 中的累计起点 + words[].start
```

因此，如果使用 HF 官方 `captions.mjs`，`audio_meta.json` 里的每个 `voices[].words[]` 应是“该 frame 内相对时间”，不是全片绝对时间。

## MiniMax 当前字幕格式

MiniMax 同步语音返回的字幕文件是 JSON，典型结构如下：

```json
[
  {
    "text": "这是 MiniMax 语音接口测试。",
    "pronounce_text": "这是MiniMax语音接口测试。",
    "time_begin": 0.0,
    "time_end": 1804.0362811791383,
    "text_begin": 0,
    "text_end": 18,
    "timestamped_words": [
      {
        "word": "这",
        "word_begin": 0,
        "word_end": 1,
        "pronounce_word": "这",
        "time_begin": 34.13333333333333,
        "time_end": 170.66666666666666
      }
    ]
  }
]
```

MiniMax 与 HF 的主要差异：

| 项目 | MiniMax | HF |
| --- | --- | --- |
| 词文本字段 | `word` | `text` |
| 开始时间字段 | `time_begin` | `start` |
| 结束时间字段 | `time_end` | `end` |
| 时间单位 | 毫秒 | 秒 |
| frame 归属 | 无 | 需要 `frame` |
| 音频路径 | manifest 记录 | `voices[].path` |

因此 MiniMax 字幕“信息充分，但格式不直接符合 HF”。

## 转换规则

MiniMax `timestamped_words[]` 转 HF `words[]`：

```text
text  = word
start = time_begin / 1000
end   = time_end / 1000
id    = w{index}
```

示例：

```json
{
  "word": "这",
  "time_begin": 34.13333333333333,
  "time_end": 170.66666666666666
}
```

转换为：

```json
{
  "id": "w0",
  "text": "这",
  "start": 0.034,
  "end": 0.171
}
```

## 推荐生产策略

### 策略 A：按镜头分段生成语音（HF 默认兼容方式）

这是最直接适配 HF 官方 frame 级字幕脚本的方式，但会把连续语义段落切成多次 TTS 调用，因此不再作为本项目默认方式。

```text
SCRIPT.md 每个 frame 一段旁白
  -> MiniMax 每段单独生成音频和词级字幕
  -> 每段写入 audio_meta.voices[]
  -> words[].start/end 保持该段内相对时间
  -> STORYBOARD.md duration 使用该段 MiniMax 实际时长
  -> HF captions.mjs 自动生成 captions.html
```

优点：

- 最贴合 HF `frame` 模型。
- 镜头时长、字幕、动效更容易绑定。
- 单段失败时可单独重试。
- 长稿也更稳定。

缺点：

- 多次调用 MiniMax，可能增加接口调用次数。
- 分段之间的语气连续性需要在脚本中控制。

### 策略 B：整条旁白一次生成

适合需要完整口播连贯性的短视频。

```text
完整口播稿
  -> MiniMax 一次生成完整音频和词级字幕
  -> 根据 SCRIPT/STORYBOARD 的句段边界切分 timestamped_words
  -> 映射到 audio_meta.voices[].frame
```

优点：

- 语气和节奏最连贯。
- 只调用一次 MiniMax。

缺点：

- 需要额外做“词时间戳 -> frame”的切分。
- 镜头时长必须反向跟随语音，设计阶段需要预留弹性。

### 策略 C：按语义大段落生成语音（本项目现行标准）

```text
完整口播稿按语义拆成不超过 120 秒的大段落
  -> 每个大段落调用一次 MiniMax
  -> 保存一条连续 narration.mp3 和原始 .titles
  -> 按 SCRIPT.md 的 Frame 边界精确对齐词级时间
  -> 切出 audio/frames/NN.mp3
  -> 生成 HF audio_meta.json 的 voices[].words[]
  -> 官方 audio.mjs 根据真实语音同步 Storyboard 时长
  -> 官方 captions.mjs 生成 caption_groups.json
```

这是本项目默认方式。它在 HF 默认脚本之外增加项目级时间轴适配层，但仍遵守 HF composition、媒体播放、seek-safe timeline 和 CLI 门禁。

采用该策略的原因：

- 保持大段落内部语气和节奏连续。
- 避免多次 TTS 导致音色细微变化。
- 保留整段原始语音，同时为 HF 官方 frame audio 合同生成可追溯的本地片段。
- 字幕和必要的关键词强调使用同一份 MiniMax 词级时间戳。
- 更符合长视频按大段落逐个生产验收的项目结构。

## 三者同步原则

生产时应形成同一套时间源：

```text
MiniMax narration.mp3
  -> MiniMax timestamped_words
    -> audio_meta.json voices[].words[]
      -> 临时中文单行显示适配（不覆盖原始词级合同）
      -> HF captions.mjs -> caption_groups.json + 字幕 composition
      -> Storyboard time-coded Scenes -> 页面动画
      -> 必要关键词强调
```

动效触发不得只靠估算。优先级如下：

1. 词级触发：关键词、高亮、图标弹出、数字变化。
2. 短语级触发：一个 caption group 对应一组视觉强调。
3. 句段级触发：镜头内主要画面状态切换。
4. frame 边界触发：场景切换、转场、BGM 段落。

## 验收标准

每个使用 MiniMax 旁白的 HF 项目，至少应能核验：

- 音频文件存在，且被 HF `<audio>` 引用。
- 项目根目录存在 HF 官方 `audio_meta.json`，且 `provider=minimax`。
- 词级 `start/end` 单位为秒，并与 MiniMax 原始 `timestamped_words` 对应。
- `voices[]` 与 `SCRIPT.md` Frame 一一对应，音频片段存在。
- `caption_groups.json` 和字幕 composition 已由 HF 官方 `captions.mjs` 生成。
- 关键动效使用同一套词级或短语级时间点，不另起一套估算时间。
- 最终分别执行 `hf check`、`hf snapshot` 和 render 验收，确认语音、字幕与元素动效同步。
