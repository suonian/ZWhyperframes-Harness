[English](README.en.md) | **中文**

# ZWhyperframes-Harness

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E.svg)](https://nodejs.org/)
[![HyperFrames](https://img.shields.io/badge/hyperframes-0.8.36%20locked-8A2BE2.svg)](https://github.com/heygen-com/hyperframes)
[![CI](https://img.shields.io/badge/CI-4%20jobs-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-45%20total-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)

HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行。不重写官方能力。

> ⚠️ **非官方项目。** 与 HeyGen 无隶属、赞助或背书关系。「HyperFrames」是 HeyGen, Inc. 的商标，本项目名称仅用于说明技术依赖关系。Apache-2.0 不授予商标使用权。详见 [DISCLAIMER.md](DISCLAIMER.md)。

## 目录

- [为什么需要这一层](#为什么需要这一层)
- [是什么，不是什么](#是什么不是什么)
- [如何解决](#如何解决)
- [凭什么可信](#凭什么可信)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [仓库结构](#仓库结构)
- [规则文档](#规则文档)
- [获取帮助](#获取帮助)
- [参与贡献](#参与贡献)
- [文档索引](#文档索引)
- [隐私与遥测](#隐私与遥测)
- [许可](#许可)

## 为什么需要这一层

直接用 HyperFrames 生产视频，会**稳定地**出三类问题——不是偶发，是每次都这样：

1. **生产不稳定，产出漂移**——同一套流程跑十次就有十种结果。
2. **规则和能力「名义上在用」，实际没被真正执行**——官方能力是齐的，但没有东西保证智能体真的去跑；文档里写了，不等于发生过。
3. **流程混乱**——跳步、降级、各段各自发挥，事后无从判断哪一步真的走过。

根因不是缺功能，而是**生产由智能体临场驱动**：能力在，纪律不在。规则是给模型读的，不是给机器执行的。

## 是什么，不是什么

HyperFrames 的能力是齐的——composition、分镜、子智能体合同、音频引擎、字幕、转场、装配、check、渲染。本仓**一行不重写**，只在它外面加一层约束。

| 是 | 不是 |
| --- | --- |
| 规则：把官方流程写成可判定的条件 | 提示词：靠模型自觉遵守 |
| 门禁：条件不满足就 fail-closed，产物留下证据 | 事后检查：发现问题再补救 |
| 对**可校验产物**的强制 | 对智能体行为的强制——那做不到，不假装做得到 |

**非目标（明确不做）：**

- 不自建 composition、装配、转场、字幕渲染、check、渲染——这些官方已有一律不重写
- 不把脚本写成 agent 执行层——脚本零 agent 调用，子智能体派发只发生在主智能体对话内
- 不维护 HF 未发布的新版本——升级是**合同审计**任务，不是版本号改动

## 如何解决

| | 性质 | 做什么 |
| --- | --- | --- |
| **保流程** | 强制 | 把「应该按官方 `faceless-explainer` Step 0–6 + review-loop」变成「不按就过不去」 |
| **强制能力** | 强制 | 把「规则里写了要用 pitch-round」变成「没跑就门禁红」 |
| **补缺口** | 补件 | 官方确实没有的少数管理件：锁定稿分段、MiniMax 词级时间注入、master 拼接、状态与授权记录 |

**补缺口是副产品，不是主命题。** 核心能力 100% 来自官方，一律不重写——不重造轮子是边界，不是目的。

## 凭什么可信

这一节写的是**可被检验的事实**，不是形容词。

- **fail-closed 而非尽量而为**——锁稿 → TTS → 注入绑定 → MP4 之间用 SHA-256 链式绑定；帧口播必须与锁稿**归一化后全等**才放行（不是相似度）。
- **证据不可伪造**——缺失的历史绑定只能重新派生，**禁止事后补哈希**把门禁「修绿」。事后补的哈希等于伪造一个从未被验证过的绑定。
- **离线是能力底线**——P0 准备完成后，生产中途不联网也必须能把片子做完（这是最低要求，不是网络禁令：按需能力仍可联网，只是不许成为主链前置条件）。
- **决策门收敛到四个**——每段「开始授权」、每段「final look 渲染授权」、master「final look」、全项目「收尾审批」，其余不打断。

### 强制分三层，我们不把第二三层说成第一层

「写在规则里」不等于「已经强制」。本仓对这个区别做诚实披露：

| 层 | 含义 | 覆盖 |
| --- | --- | --- |
| **3.1 本仓机器门禁** | 缺一项即 fail-closed | `verify` / `final-look` / `pitch-round` / `animation-map` / `check` / `mp4` / `next-segment` / `master-inputs` / `layout-guard` / `authorized` |
| **3.2 官方 CLI 命令** | 须真实执行，退出码即证据；**本仓无机器门禁** | 官方 `catalog` / `keyframes` / `compare` / `publish` / carve |
| **3.3 流程 / 复审证据** | **本仓无机器门禁** | frame-comments 处置、recipe freeze、media-treatment |

官方 12 项质量能力中，**只有 3 项落在 3.1 有机器门禁**。其余 9 项靠流程与复审约束，不满足「不跑就卡住」——这一点写在 [规则文档 §3](docs/rules/production-workflow-rules.md)，而不是藏起来。

> 门禁无法证明智能体「真的执行过」某项能力，除非那项能力留下可校验的产物。这是 harness 的能力边界，承认它比夸大它更有用。

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
npm test             # 45 项测试
```

> 字幕用例会真正导入官方 `faceless-explainer` 的 `captions.mjs`（验证「渲染走官方」这条路径）。它依赖 `npm run bootstrap` 安装的官方 skill；未 bootstrap 时该用例会**明确标记为 skip** 而非失败。CI 会先跑 bootstrap，因此这条路径在 CI 上是**被真实执行**的。

### 关于网络

`scripts/net-env.sh` 是网络策略的唯一所有者：

- npm 默认走中国大陆镜像 `registry.npmmirror.com`
- GitHub/npm 代理**默认探测 `http://127.0.0.1:7890`，可达才启用**
- MiniMax 直连 `api.minimaxi.com`（`no_proxy` 豁免 + `tools/minimax` 内主动清代理，双保险）

为什么要探测：把代理指向一个不存在的本地端口会让 `git`/`npm` **静默挂死**（无超时），这对没开代理的开发者是致命的。探测用带 1s 超时的 Python socket 连接，绝不用 `nc` 或 bash `/dev/tcp`——那两者在「静默丢包」时自身会挂死，正好是要避免的故障。

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
  gate.mjs             门禁（10 个命令，见「凭什么可信」）
  state.mjs            状态与授权记录的唯一写入入口
  finalize-master.mjs  master 拼接（thin ffmpeg concat）
tools/minimax/         MiniMax API 调用器（TTS / 图片 / 视频）
tests/                 测试（单元 + e2e，全部离线可跑）
```

视频产品**不进入本仓**，默认写入 `~/Documents/ZWhyperframes-products/`。

## 规则文档

| 文件 | 职责 |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | 生产流程唯一所有者：官方 Step 0–6 落点、用户决策门、强制质量能力三层清单、交接与问题账本 |
| `docs/rules/visual-production-rulebook.md` | 视觉质量底线（官方 worker 合同优先 + 项目要求） |
| `docs/rules/captions-contract.md` | 字幕合同唯一所有者（要求不可变更） |
| `docs/rules/segment-production-rules.md` | 锁定稿冻结与分段规则 |

冲突裁决顺序：**用户当前指令 > AGENTS.md > `docs/rules/` > 官方 HF 合同**（以构建后的 `$HYPERFRAMES_REPO` 为真源）。

> **语言政策**：`docs/rules/` 下四份文件**仅维护中文版**，规范性要求以中文为准。这是刻意的——它们是单一所有者的规范合同，做英文孪生版本会给规范性要求造出两个 source of truth，而本仓的裁决顺序没有语言维度可以仲裁漂移。`AGENTS.md`、`docs/architecture/`、`docs/plans/` 同理。社区与治理文档则是双语的，入口见下方文档索引的「英文版」列。

## 获取帮助

| 场景 | 渠道 |
| --- | --- |
| 使用问题、Bug | [提交 issue](https://github.com/suonian/ZWhyperframes-Harness/issues)（含 3 个模板：Bug / 功能提议 / 提问） |
| 功能提议 | [功能提议模板](.github/ISSUE_TEMPLATE/feature_request.md)，需先通过架构不变量自查 |
| 安全漏洞 | **不要**开公开 issue，见 [SECURITY.md](SECURITY.md) 的私下报告流程 |
| 贡献代码 | 见下方「参与贡献」 |

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。修改规则、脚本或 schema 后**必须**运行 `npm test`。

## 文档索引

| 文档 | 内容 | 英文版 |
| --- | --- | --- |
| [AGENTS.md](AGENTS.md) | 智能体入口：定位、规则导航、硬边界 | 仅中文 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南与设计纪律 | [English](CONTRIBUTING.en.md) |
| [CHANGELOG.md](CHANGELOG.md) | 更新日志 | [English](CHANGELOG.en.md) |
| [SECURITY.md](SECURITY.md) | 安全策略、凭证处理、**第三方遥测说明** | [English](SECURITY.en.md) |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | 行为准则 | [English](CODE_OF_CONDUCT.en.md) |
| [DISCLAIMER.md](DISCLAIMER.md) | 商标与内容版权免责声明 | [English](DISCLAIMER.en.md) |
| [NOTICE](NOTICE) | 第三方归属 | 法律文本，中英通用 |
| [CITATION.cff](CITATION.cff) | 引用信息（GitHub 由此生成 Cite this repository） | [English](CITATION.cff) |

## 隐私与遥测

本项目**自身不上报任何遥测**。但它调用的 HyperFrames CLI **会上报匿名使用遥测**，且 `--skill=faceless-explainer` 会被写入每个项目的 `hyperframes.json` 用于渲染归因。

如需完全关闭：`export HYPERFRAMES_NO_TELEMETRY=1`。详见 [SECURITY.md](SECURITY.md)。

## 许可

本项目建立在 HyperFrames 之上，作者为 [HeyGen, Inc.](https://github.com/heygen-com)，采用 [Apache License 2.0](LICENSE)。本项目**不包含** HyperFrames 源码，仅将其作为外部依赖调用。归属细节见 [NOTICE](NOTICE)。