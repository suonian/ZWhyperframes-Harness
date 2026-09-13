# MiniMax 专属媒体工具

本目录用于沉淀项目内可复用的 MiniMax API 调用资料、配置模板和脚本。它不是 MiniMax 调试网页的替代入口，后续生产必须直接调用 MiniMax API。

跨项目复用、原始 HTTP 请求结构和参数速查统一查看：

```text
tools/minimax/docs/STANDALONE_API_GUIDE.md
```

## 当前用途

- 口播稿转语音，并生成 HF 可引用的音频文件。
- 语音合成时请求词语级字幕，作为 HF 字幕和节奏对齐输入。
- 后续扩展音乐、图片、视频、视频 Agent 生成能力。

## 固定语音档案

用户定制音色和语速为固定生产参数，不得随意修改：

```json
{
  "voice_id": "ttv-voice-2026040916452526-mc0nlrpN",
  "model": "speech-2.8-hd",
  "language": "zh",
  "speed": 1.27,
  "pitch": 1,
  "vol": 1.16,
  "sample_rate": 44100,
  "bitrate": 256000
}
```

注意：MiniMax API 字段名是 `vol`，不是 `volume`。

## 密钥规则

不得把 API Key 写入任何仓库文件。脚本读取顺序：

1. 优先读取环境变量 `MINIMAX_API_KEY`。
2. 如果环境变量不存在，读取本机 macOS Keychain 条目：
   - account: `minimax`
   - service: `MINIMAX_API_KEY`

临时环境变量示例：

```bash
export MINIMAX_API_KEY="你的 API Key"
```

生产脚本默认调用国内接口：

```text
https://api.minimaxi.com
```

如需备用北京接口，可通过参数切换到：

```text
https://api-bj.minimaxi.com
```

## 语音脚本

脚本位置：

```bash
tools/minimax/scripts/minimax_tts.py
```

示例：

```bash
source ./hf-env.sh
"$MINIMAX_PYTHON" tools/minimax/scripts/minimax_tts.py \
  --text "今天是不是很开心呀，当然了！" \
  --out-dir tools/minimax/outputs/demo \
  --name demo
```

语音生产固定使用 `MINIMAX_PYTHON`，不得改用只服务 HF 媒体能力的
`HYPERFRAMES_PYTHON`。成功 manifest 会记录实际解释器、Python/SSL 版本和网络尝试次数。

输出包括：

- `demo.mp3`
- `demo.response.json`
- `demo.manifest.json`
- 若 API 返回字幕文件地址，会额外下载字幕文件。

注意：MiniMax 下载到本地的字幕是原始 `.titles` JSON，不能原样作为 HF 字幕输入。后续视频项目需要把它转换成 HF `audio_meta.json` / transcript 结构，详见：

```text
tools/minimax/docs/HF_AUDIO_SUBTITLE_FORMAT.md
```

## 图片脚本

脚本位置：

```bash
tools/minimax/scripts/minimax_image.py
```

默认使用 `image-01`、`16:9` 和 Base64 返回，直接将图片保存到本地，避免依赖 24 小时失效的临时 URL。示例：

```bash
python3 tools/minimax/scripts/minimax_image.py \
  --prompt-file /path/to/prompt.txt \
  --out-dir /path/to/assets/minimax/images \
  --name storyboard-01 \
  --seed 7011201
```

输出包括图片、脱敏响应记录和 manifest。manifest 会保存模型、提示词、画幅、seed 和任务 ID，不保存 API Key、Base64 原文或临时签名 URL。

需要局部尺寸时，`image-01` 支持同时传入 `--width` 和 `--height`（512–2048，且为 8 的倍数）；此时不传 `--aspect-ratio`，让页面按实际显示角色生成合适尺寸。透明背景仍需通过 HF `remove-background` 处理并检查后再冻结。

## 图生视频脚本

脚本位置：

```bash
tools/minimax/scripts/minimax_video.py
```

该脚本将本地首帧以内存 Data URL 直接提交到 MiniMax，自动轮询任务、下载 MP4，并省略临时下载地址和首帧 Base64。示例：

```bash
python3 tools/minimax/scripts/minimax_video.py \
  --prompt-file /path/to/video-prompt.txt \
  --first-frame /path/to/first-frame.jpg \
  --out-dir /path/to/assets/minimax/videos \
  --name cinematic-previz
```

MiniMax 视频只能作为 HF 镜头素材或设计预演，不得绕开 HF 直接成为最终成片。

## 与 HyperFrames 的关系

MiniMax 在现行流水线中只替代 TTS，并可按需生成图片或视频候选；BGM 与 SFX 使用锁定 HF 的原生音频引擎。所有选中的媒体都回到 HF 素材与装配链路，不绕开 HF 渲染最终视频。
