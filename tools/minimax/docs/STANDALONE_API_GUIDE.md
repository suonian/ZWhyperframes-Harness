# MiniMax API 独立调用指南

更新日期：2026-07-22

本文是脱离本视频流水线后仍可直接使用的 MiniMax API 单文件入口。它说明鉴权、直连规则、请求结构、主要参数、本地脚本和跨项目复制方式，不包含 API Key，也不要求 HyperFrames。

参数可能随 MiniMax 平台升级而变化。生产前可用官方文档索引核对最新模型和限制：

- `https://platform.minimaxi.com/docs/llms.txt`
- `https://platform.minimaxi.com/docs`

## 1. 最小环境

项目内三个已验证脚本只依赖 Python 3 标准库：

```text
tools/minimax/scripts/minimax_tts.py
tools/minimax/scripts/minimax_image.py
tools/minimax/scripts/minimax_video.py
```

它们的共同行为：

- 默认请求 `https://api.minimaxi.com`。
- 调用前清除 `HTTP_PROXY`、`HTTPS_PROXY` 和 `ALL_PROXY`，MiniMax 国内 API 直连。
- 优先读取环境变量 `MINIMAX_API_KEY`。
- 没有环境变量时，macOS 版本会尝试读取项目专用 Keychain 条目。
- 保存本地产物、脱敏响应和 manifest，不把 API Key、Base64 原文或临时签名 URL写入记录。

跨项目使用时，推荐只配置环境变量，避免依赖本项目的 Keychain 名称：

```bash
export MINIMAX_API_KEY="你的 API Key"
```

不要把这一行及真实密钥提交到仓库。

## 2. 通用 HTTP 约定

请求头：

```http
Authorization: Bearer ${MINIMAX_API_KEY}
Content-Type: application/json
```

Python 最小调用器：

```python
import json
import os
import urllib.request

BASE_URL = "https://api.minimaxi.com"

for name in (
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    "http_proxy", "https_proxy", "all_proxy",
):
    os.environ.pop(name, None)


def minimax_post(path: str, payload: dict) -> dict:
    api_key = os.environ["MINIMAX_API_KEY"]
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.loads(response.read().decode("utf-8"))
    if result.get("base_resp", {}).get("status_code") not in (0, None):
        raise RuntimeError(json.dumps(result, ensure_ascii=False))
    return result
```

通用成功判断：

```text
base_resp.status_code = 0
```

排障时保留 `trace_id`、任务 ID 和脱敏响应，不记录鉴权头。

## 3. 图片生成

接口：

```text
POST /v1/image_generation
```

最小请求体：

```json
{
  "model": "image-01",
  "prompt": "Vertical editorial poster, no text",
  "aspect_ratio": "9:16",
  "response_format": "base64",
  "n": 1,
  "prompt_optimizer": false,
  "aigc_watermark": false,
  "seed": 20260722
}
```

主要参数：

| 参数 | 说明 |
| --- | --- |
| `model` | `image-01` 或 `image-01-live` |
| `prompt` | 提示词，当前限制最长 1500 字符 |
| `aspect_ratio` | `1:1`、`16:9`、`4:3`、`3:2`、`2:3`、`3:4`、`9:16`、`21:9` |
| `width` / `height` | 仅 `image-01`；需同时设置，512–2048 且为 8 的倍数；与比例同时出现时比例优先 |
| `response_format` | `base64` 或 `url`；长期保存推荐 `base64` 后立即写入本地 |
| `n` | 1–9 |
| `seed` | 用于复现相近结果，不保证逐像素一致 |
| `prompt_optimizer` | 是否允许服务端优化提示词；精确构图通常设为 `false` |
| `aigc_watermark` | 是否添加 AIGC 水印 |

返回图片通常位于：

```text
data.image_base64
data.image_urls
```

项目脚本调用：

```bash
python3 tools/minimax/scripts/minimax_image.py \
  --prompt-file /path/to/prompt.txt \
  --out-dir /path/to/output/images \
  --name cover \
  --model image-01 \
  --aspect-ratio 9:16 \
  --seed 20260722 \
  --count 1 \
  --response-format base64
```

本项目抖音封面背景就是通过这条调用链生成：MiniMax 只生成无文字主视觉，中文标题和品牌素材随后在本地排版。

## 4. 同步语音合成

接口：

```text
POST /v1/t2a_v2
```

通用请求体：

```json
{
  "model": "speech-2.8-hd",
  "text": "需要合成的文本",
  "stream": false,
  "voice_setting": {
    "voice_id": "YOUR_VOICE_ID",
    "speed": 1.0,
    "vol": 1.0,
    "pitch": 0
  },
  "audio_setting": {
    "sample_rate": 44100,
    "bitrate": 256000,
    "format": "mp3",
    "channel": 1
  },
  "pronunciation_dict": {
    "tone": []
  },
  "language_boost": "Chinese",
  "subtitle_enable": true,
  "subtitle_type": "word",
  "output_format": "hex",
  "aigc_watermark": false
}
```

关键点：

- 音量字段是 `vol`，不是 `volume`。
- `voice_id` 必须属于当前 API Key 对应的账号。
- `subtitle_type` 可选 `sentence`、`word`、`word_streaming`。
- `output_format=hex` 时，`data.audio` 是十六进制音频，使用 `bytes.fromhex(...)` 写入文件。
- 开启字幕后，`data.subtitle_file` 可能返回临时下载地址，应立即下载。
- 停顿标记格式为 `<#0.5#>`。
- 发音词典条目示例：`处理/(chu3)(li3)`。

项目脚本调用：

```bash
python3 tools/minimax/scripts/minimax_tts.py \
  --text-file /path/to/script.txt \
  --out-dir /path/to/output/audio \
  --name narration \
  --subtitle-type word \
  --output-format hex
```

注意：当前 `minimax_tts.py` 内置的是本项目固定音色和语速。其他账号或其他音色项目应修改脚本顶部的 `VOICE_PROFILE`，或直接使用上面的通用 HTTP 请求体。项目固定档案见 `VOICE_PROFILE.md`。

长文本异步接口：

```text
POST /v1/t2a_async_v2
GET  /v1/query/t2a_async_query_v2?task_id=...
GET  /v1/files/retrieve?file_id=...
```

## 5. 图生视频

创建、查询和下载：

```text
POST /v1/video_generation
GET  /v1/query/video_generation?task_id=...
GET  /v1/files/retrieve?file_id=...
```

图生视频请求体：

```json
{
  "model": "MiniMax-Hailuo-2.3",
  "prompt": "主体保持一致，镜头缓慢推进",
  "first_frame_image": "data:image/png;base64,...",
  "prompt_optimizer": false,
  "duration": 6,
  "resolution": "768P",
  "aigc_watermark": false
}
```

主要参数和限制：

| 参数 | 说明 |
| --- | --- |
| `prompt` | 最长 2000 字符 |
| `first_frame_image` | 公网 URL 或 Base64 Data URL；JPG、PNG、WebP，小于 20MB |
| `duration` | 常用 6 或 10 秒，具体受模型和分辨率限制 |
| `resolution` | `512P`、`720P`、`768P`、`1080P`，不是所有模型都支持全部组合 |
| `prompt_optimizer` | 精确控制时设为 `false` |
| `aigc_watermark` | 是否添加水印 |

项目脚本支持的模型：

```text
MiniMax-Hailuo-2.3
MiniMax-Hailuo-2.3-Fast
MiniMax-Hailuo-02
I2V-01-Director
I2V-01-live
I2V-01
```

项目脚本调用：

```bash
python3 tools/minimax/scripts/minimax_video.py \
  --prompt-file /path/to/video-prompt.txt \
  --first-frame /path/to/first-frame.png \
  --out-dir /path/to/output/videos \
  --name shot-01 \
  --model MiniMax-Hailuo-2.3 \
  --duration 6 \
  --resolution 768P \
  --poll-interval 10 \
  --timeout 1800
```

脚本会：

1. 将本地首帧转为内存 Data URL。
2. 创建视频任务并取得 `task_id`。
3. 定时查询状态，直到 `Success` 或 `Fail`。
4. 使用 `file_id` 获取临时下载地址。
5. 立即保存 MP4、脱敏响应和 manifest。

10 秒视频及高分辨率组合受模型限制；提交前先查看脚本 `--help` 或最新官方文档。

## 6. 其他接口索引

| 能力 | 接口 |
| --- | --- |
| 音乐生成 | `POST /v1/music_generation` |
| 文本生成 | `POST /v1/text/chatcompletion_v2` |
| 音色查询 | `POST /v1/get_voice` |
| 视频模板 Agent | `POST /v1/video_template_generation` |
| 视频模板查询 | `GET /v1/query/video_template_generation?task_id=...` |
| 文件下载 | `GET /v1/files/retrieve?file_id=...` |

这些接口的完整参数记录见同目录 `API_SURVEY.md`。

## 7. 跨项目复制

完整复制工具目录：

```bash
mkdir -p /path/to/other-project/tools
cp -R tools/minimax \
  /path/to/other-project/tools/minimax
```

然后在目标项目中：

```bash
cd /path/to/other-project
export MINIMAX_API_KEY="你的 API Key"
python3 tools/minimax/scripts/minimax_image.py --help
```

建议目标项目只保留自己的输出目录，并在 `.gitignore` 中忽略：

```gitignore
tools/minimax/outputs/
*.response.json
```

manifest 可以按项目审计要求决定是否纳入版本控制，但必须确认其中不含敏感输入。

## 8. 当前脚本的可移植性边界

- `minimax_image.py`：通用，可直接复制。
- `minimax_video.py`：通用图生视频脚本，可直接复制；目前不封装纯文生视频、首尾帧和主体参考视频。
- `minimax_tts.py`：调用方式通用，但默认音色、速度和音频参数属于本项目；其他项目应替换 `VOICE_PROFILE`。
- 三个脚本的 Keychain fallback 名称属于本项目；其他项目优先设置 `MINIMAX_API_KEY`，或者自行修改 Keychain 常量。
- MiniMax 临时 URL 会过期，任何项目都应立即下载，不应把 URL 当作长期产物地址。

## 9. 相关文件

- `../README.md`：本项目快速入口。
- `API_SURVEY.md`：较完整的接口调研记录。
- `VOICE_PROFILE.md`：本项目固定语音档案。
- `HF_AUDIO_SUBTITLE_FORMAT.md`：MiniMax 字幕转换为 HF 时间轴的项目专用说明。
