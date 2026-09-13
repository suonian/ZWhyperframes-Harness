# MiniMax 固定语音档案

本文件记录用户已调试确认的专属音色参数。口播语音生产必须以此为基准。

## 固定参数

```json
{
  "voice_id": "ttv-voice-2026040916452526-mc0nlrpN",
  "model": "speech-2.8-hd",
  "language": "zh",
  "speed": 1.27,
  "pitch": 1,
  "vol": 1.16,
  "sample_rate": 44100,
  "bitrate": 256000,
  "format": "mp3",
  "channel": 1
}
```

## 不得更改

- `voice_id`
- `speed`
- `subtitle_type`：固定为 `word`，作为 HF 字幕和动画主时间轴。

## 原则上保持

- `model`: `speech-2.8-hd`
- `language`: `zh`
- `pitch`: `1`
- `vol`: `1.16`
- `sample_rate`: `44100`
- `bitrate`: `256000`

## 可按项目需要调整

- `language_boost`：中文口播默认 `Chinese`，混合中英文时可改为 `auto`。
- `pronunciation_dict.tone`：正常原文默认留空；只有生成音频实际出现读音问题时，才针对问题词补充。
- `aigc_watermark`：默认 `false`。

## 口播文本标记

停顿：

```text
这里停顿半秒 <#0.5#> 然后继续。
```

语气标签：

```text
(laughs) (chuckle) (breath) (sighs) (emm)
```

发音词典：

```json
{
  "pronunciation_dict": {
    "tone": [
      "处理/(chu3)(li3)",
      "Claude/克劳德"
    ]
  }
}
```

## HF 对接要求

每次语音生成后必须保留：

- 音频文件路径。
- 字幕文件路径或字幕 URL 下载结果。
- `trace_id`。
- `extra_info`。
- 完整请求参数的脱敏版。
- `base_resp`。

## 本机密钥保存方式

MiniMax API Key 已保存到本机 macOS Keychain，不写入仓库：

- account: `minimax`
- service: `MINIMAX_API_KEY`

脚本应优先读取环境变量 `MINIMAX_API_KEY`，没有环境变量时再读取该 Keychain 条目。
