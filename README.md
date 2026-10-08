# ZWhyperframes-Harness

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E.svg)](https://nodejs.org/)
[![HyperFrames](https://img.shields.io/badge/hyperframes-0.8.36%20locked-8A2BE2.svg)](https://github.com/heygen-com/hyperframes)
[![CI](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml/badge.svg)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-31%20total-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)

基于 [HyperFrames](https://github.com/heygen-com/hyperframes) 的中文无真人出镜（faceless）知识类视频生产流水线的**管理层定制层**。

> ⚠️ **非官方项目。** 与 HeyGen 无隶属、赞助或背书关系。「HyperFrames」是 HeyGen, Inc. 的商标，本项目名称仅用于说明技术依赖关系。Apache-2.0 不授予商标使用权。详见 [DISCLAIMER.md](DISCLAIMER.md)。

**English** | [中文](#zwhyperframes-harness)

---

## 定位：只做管理层，不重造轮子

核心能力 **100% 来自 HyperFrames 官方**——composition、分镜、子智能体合同、音频引擎、字幕、转场、装配、check、渲染，**一律不重写**。

本仓只做官方没有的三件事：

| | 职责 |
| --- | --- |
| **保流程** | 规则与门禁，确保生产完整走通官方 `faceless-explainer` Step 0–6 + review-loop |
| **补缺口** | 官方没有的管理能力：锁定稿分段、MiniMax 词级时间注入、master 拼接、状态与授权记录 |
| **优能力** | 强制接入官方质量能力（pitch-round / frame presets / on-device catalog / carve / animation-map / `check --strict`） |

**禁止重复造轮子**：不得自建 composition、装配、转场、字幕渲染、check、渲染能力；脚本保持单步、幂等、确定性、零 agent 调用。

## 设计上的几个硬取舍

- **fail-closed 而非尽量而为**——段稿、TTS 产物、注入绑定、MP4 之间用 SHA-256 链式绑定；帧口播必须与锁稿**归一化后全等**才放行（不是相似度）。
- **证据不可伪造**——缺失的历史绑定只能重新派生，**禁止事后补哈希**把门禁"修绿"。事后补的哈希等于伪造一个从未被验证过的绑定。
- **离线是能力底线**——P0 准备完成后，生产中途不联网也必须能把片子做完（这是最低要求，不是网络禁令：按需能力仍可联网，只是不许成为主链前置条件）。
- **决策门收敛到四个**——每段「开始授权」、每段「final look 渲染授权」、master「final look」、全项目「收尾审批」，其余不打断。

## 环境要求

| 项目 | 值 |
| --- | --- |
| Node.js | ≥ 22 |
| HyperFrames | `0.8.36`（版本锁定，CLI 缺失或漂移即拒绝运行） |
| ffmpeg / ffprobe | 必需（帧音频切分与时长探测） |
| Python 3 | 必需（MiniMax 调用器与代理探测） |
| 平台 | macOS / Linux（`net-env.sh` 探测依赖 bash + python3） |

## 快速开始

```bash
git clone https://github.com/suonian/ZWhyperframes-Harness.git
cd ZWhyperframes-Harness

npm run bootstrap    # 安装锁定依赖 + 校验 HF 版本 + 刷新官方 skills
npm run doctor       # 环境体检：CLI 版本 / skills / 浏览器 / ffmpeg / MiniMax 凭证
source ./hf-env.sh   # 生产环境入口（提供 hf 函数、网络策略、跳过 init 的联网检查）
npm test             # 31 项测试
```

> 字幕用例会真正导入官方 `faceless-explainer` 的 `captions.mjs`（验证"渲染走官方"这条路径）。它依赖 `npm run bootstrap` 安装的官方 skill；未 bootstrap 时该用例会**明确标记为 skip** 而非失败。CI 会先跑 bootstrap，因此这条路径在 CI 上是**被真实执行**的。

### 关于网络

`scripts/net-env.sh` 是网络策略的唯一所有者：

- npm 默认走中国大陆镜像 `registry.npmmirror.com`
- GitHub/npm 代理**默认探测 `http://127.0.0.1:7890`，可达才启用**
- MiniMax 直连 `api.minimaxi.com`（`no_proxy` 豁免 + `tools/minimax` 内主动清代理，双保险）

为什么要探测：把代理指向一个不存在的本地端口会让 `git`/`npm` **静默挂死**（无超时），这对没开代理的开发者是致命的。探测用带 1s 超时的 Python socket 连接，绝不用 `nc` 或 bash `/dev/tcp`——那两者在"静默丢包"时自身会挂死，正好是要避免的故障。

覆盖方式：

```bash
HARNESS_NO_PROXY=1 bash scripts/bootstrap.sh          # 强制关闭代理
HARNESS_PROXY=http://127.0.0.1:1080 bash scripts/bootstrap.sh   # 显式指定（不探测）
```

### MiniMax 凭证

```bash
export MINIMAX_API_KEY="你的 API Key"        # 优先
```

或存入 macOS Keychain（服务名默认 `MINIMAX_API_KEY`，可用 `MINIMAX_KEYCHAIN_SERVICE` 覆盖）：

```bash
security add-generic-password -a minimax -s MINIMAX_API_KEY -w '你的 API Key'
```

## 仓库结构

```text
AGENTS.md              智能体入口：定位、规则导航、硬边界
docs/rules/            生产规则（视觉 / 字幕 / 分段 / 工作流，各为单一所有者）
docs/architecture/     官方能力审计与跨会话交接
docs/plans/            启动设计
scripts/               管理脚本（单步、确定性、零 agent 调用）
  net-env.sh           网络策略唯一所有者
  new-video.mjs        项目脚手架（锁稿冻结 + 分段 + 逐段 init）
  minimax-tts.mjs      MiniMax 语音 + 词级时间
  inject-audio-meta.mjs  词级时间 → 官方 audio_meta.json
  captions-zh.mjs      中文字幕分组数据（渲染仍走官方）
  gate.mjs             轻量门禁（锁稿/TTS/注入/MP4 哈希、授权、字号底线）
  state.mjs            状态与授权记录的唯一写入入口
  finalize-master.mjs  master 拼接（thin ffmpeg concat）
tools/minimax/         MiniMax API 调用器（TTS / 图片 / 视频）
tests/                 测试（单元 + e2e，全部离线可跑）
```

视频产品**不进入本仓**，默认写入 `~/Documents/ZWhyperframes-products/`。

## 规则文档

| 文件 | 职责 |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | 生产流程唯一所有者：官方 Step 0–6 落点、用户决策门、强制质量能力清单、交接与问题账本 |
| `docs/rules/visual-production-rulebook.md` | 视觉质量底线（官方 worker 合同优先 + 项目要求） |
| `docs/rules/captions-contract.md` | 字幕合同唯一所有者（要求不可变更） |
| `docs/rules/segment-production-rules.md` | 锁定稿冻结与分段规则 |

冲突裁决顺序：**用户当前指令 > AGENTS.md > `docs/rules/` > 官方 HF 合同**（以构建后的 `$HYPERFRAMES_REPO` 为真源）。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。修改规则、脚本或 schema 后**必须**运行 `npm test`。

## 致谢与许可

本项目建立在 HyperFrames 之上，作者为 [HeyGen, Inc.](https://github.com/heygen-com)，采用 Apache-2.0 许可。本项目不包含 HyperFrames 源码，仅将其作为外部依赖调用。归属细节见 [NOTICE](NOTICE)。

本项目采用 [Apache License 2.0](LICENSE)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | 智能体入口：定位、规则导航、硬边界 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南与设计纪律 |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 |
| [SECURITY.md](SECURITY.md) | 安全策略、凭证处理、**第三方遥测说明** |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则 |
| [DISCLAIMER.md](DISCLAIMER.md) | 商标与内容版权免责声明 |
| [NOTICE](NOTICE) | 第三方归属 |

## 隐私与遥测

本项目**自身不上报任何遥测**。但它调用的 HyperFrames CLI **会上报匿名使用遥测**，且 `--skill=faceless-explainer` 会被写入每个项目的 `hyperframes.json` 用于渲染归因。

如需完全关闭：`export HYPERFRAMES_NO_TELEMETRY=1`。详见 [SECURITY.md](SECURITY.md)。