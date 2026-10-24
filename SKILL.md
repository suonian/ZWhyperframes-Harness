---
name: zwhyperframes-harness
slug: zwhyperframes-harness
version: 0.2.5
displayName: HyperFrames Harness — 中文知识视频生产门禁
summary: 用 HyperFrames 生产中文无真人出镜知识视频的规则与门禁层：锁定稿、TTS/字幕哈希绑定、final-look 前置检查、master 审批；不重写官方能力。
description: 当用户要用 HyperFrames 制作中文无真人出镜知识视频、要求锁定口播稿/字幕逐字一致/生产可复现，或需要排查 HyperFrames 生产门禁时使用；它把官方 Step 0–6 与质量能力变成 fail-closed 规则，不重写官方能力。
tags: [hyperframes, video-production, faceless-video, chinese-video, tts, captions, agent-harness, workflow-enforcement, guardrails, minimax]
license: Apache-2.0
homepage: https://github.com/suonian/ZWhyperframes-Harness
metadata:
  display-name: "HyperFrames Harness — 中文知识视频生产门禁"
---

# HyperFrames Harness

HyperFrames 的 harness 工程，用于生产中文无真人出镜知识类视频。

**核心能力 100% 来自 HyperFrames 官方**（composition、分镜、子智能体合同、音频、字幕、转场、装配、check、渲染），本项目一行不重写。

## 何时使用

- 用户有一份**锁定口播稿**，要做成中文、无真人出镜的知识视频；
- 用户要求**可复现的生产流程**，而不是每次让智能体自由发挥；
- 用户需要对锁稿、TTS、字幕、MP4、master 做哈希绑定与 fail-closed 检查；
- 用户遇到 HyperFrames 生产中的门禁、TTS、字幕、分段或 master 拼接问题。

**不要用于**：真人出镜/实拍剪辑、纯通用视频剪辑、只需要一句提示词生成一段素材的场景；也不要用来重写官方 composition、字幕渲染、check 或 render。

## 典型触发

- “把这份锁定口播稿做成 3 分钟中文知识视频，要求每次结果一致。”
- “检查这个 HyperFrames 项目为什么 final-look 过不了。”
- “TTS 重跑后字幕对不上 / 注入绑定漂移怎么办？”
- “master 拼接后为什么不能换片？”

**给智能体的最短触发提示**：

```text
使用 zwhyperframes-harness 技能，把 <资料包/锁稿> 按锁定稿生产中文无真人出镜知识视频。
先读 SKILL.md，再按 docs/rules/production-workflow-rules.md 的 Step 0–6 执行；
每个用户决策门停下来等我确认；不要重写官方 composition/字幕/check/render。
```

普通用户不需要记脚本：安装后直接说“用 zwhyperframes-harness 技能做这支视频”，或在项目 `AGENTS.md` 引用 `SKILL.md`。

## 它解决什么

HyperFrames 的能力是齐的。问题不在缺功能，而在**生产由智能体临场驱动**：同一套流程跑十次就有十种结果；规则写进了文档，官方质量能力「名义上在用」，却没有任何机制保证真的被执行过。

本仓用两件事应对：**规则把官方流程钉死，门禁把「声称做过」变成「不通过就卡住」**。

| | 性质 | 做什么 |
| --- | --- | --- |
| **保流程** | 强制 | 把「应该按官方 `faceless-explainer` Step 0–6 + review-loop」变成「不按就过不去」 |
| **强制能力** | 强制 | 把「规则里写了要用 pitch-round」变成「没跑就门禁红」 |
| **补缺口** | 补件 | 锁定稿分段、MiniMax 词级时间注入、master 拼接、状态与授权记录——这是副产品，不是主命题 |

## 从哪里开始读

**本文件只负责路由，不复制规范。** 规范各有唯一所有者，请直接读取，不要以本文件的转述为准：

| 文件 | 职责 |
| --- | --- |
| `AGENTS.md` | 智能体入口：定位、规则导航、版本与网络策略、硬边界 |
| `docs/rules/production-workflow-rules.md` | 生产流程唯一所有者：官方 Step 0–6 落点、用户决策门、强制质量能力清单、交接与问题账本 |
| `docs/rules/visual-production-rulebook.md` | 视觉质量底线（官方 worker 合同优先 + 项目要求） |
| `docs/rules/captions-contract.md` | 字幕合同唯一所有者（要求不可变更） |
| `docs/rules/segment-production-rules.md` | 锁定稿冻结与分段规则 |
| `references/faq.md` | 常见问题、错误索引、反模式清单（排障先看这里） |
| `references/walkthrough.md` | 从资料包到 master 的端到端最小走查 |

冲突裁决顺序：**用户当前指令 > `AGENTS.md` > `docs/rules/` > 官方 HF 合同**（以锁定 commit 下 `vendor/skills/` 的官方原文为准）。

协议 §8.3 约定技能包目录为 `SKILL.md + references/ + scripts/ + assets/`。本包把规范合同放在 `docs/rules/`、厂商工具放在 `tools/`，二者均为协议中的可选目录，规则不受影响。`references/` 提供排障与走查，不承载规范。架构审计与交接记录只在 GitHub 仓库的 `docs/architecture/` 中提供（不在分发包内）。

### 按角色阅读

| 你是 | 先读 |
| --- | --- |
| 第一次安装/运行 | 本文件「快速开始」→ `references/faq.md` §1 |
| 要完整生产一支视频 | `references/walkthrough.md` → `docs/rules/production-workflow-rules.md` |
| 排查某个门禁/报错 | `references/faq.md` 的 30 秒索引 |
| 维护规则或脚本 | `AGENTS.md` → `docs/rules/` → `scripts/` |
| 只想看能力边界 | 本文件「关于强制力的真实覆盖」 |

## 如何被新智能体加载

**装到发现目录，否则新智能体看不到。** SkillHub CLI 的默认安装路径不是任何客户端的技能发现路径，必须显式指定：

```bash
skillhub install zwhyperframes-harness --dir ~/.agents/skills
```

发现目录优先级：`./.agents/skills/` → `~/.agents/skills/` → `./.claude/skills/` → `~/.claude/skills/`。装完的目录名等于 `skill.slug`，即 `zwhyperframes-harness`。

**当前 CLI 不会写 `AGENTS.md` 的 `<skill>` 索引块**，因此安装后不会自动出现在项目的智能体索引里——需要在会话中显式点名本技能，或在项目 `AGENTS.md` 中手工引用 `SKILL.md`。

若需把本包重建为可上传的技能包：

```bash
node scripts/build-skill-package.mjs --root . --out <产物目录>
```

该脚本按平台准入规则过滤并逐项 fail-closed 校验（文件数 ≤100、总包 ≤460KB（服务端实测上限）、单文件 ≤1MB、必须含 `SKILL.md`），产出含每个文件 SHA-256 的清单 `<out>.manifest.json`（写在包目录同级，不放进包内）。

## 前置条件

- macOS / Linux（Keychain 仅 macOS）；Node.js ≥ 22；ffmpeg
- HyperFrames 锁定 `v0.8.36`（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）
- MiniMax API Key：只从环境变量或 macOS Keychain 读取，不入仓、不入日志
- 网络策略唯一所有者是 `scripts/net-env.sh`：下载优先中国大陆源，GitHub/npm 代理探测可达才启用

## 快速开始

技能包**不含 `node_modules`**（平台打包排除），故须先自举：

```bash
npm run bootstrap    # 安装锁定依赖 + 校验 HF 版本 + 按锁定 commit 取回官方 skills（需联网）
npm run doctor       # 环境体检
source ./hf-env.sh   # 生产环境入口——必须在 bootstrap 之后，否则报「HF CLI 缺失或版本不符」
npm test             # 68 项测试，全部离线可跑（仅仓库；分发包不含 tests/）
```

**官方 skills 按锁定 commit 取回，不拉上游实时产物。** `bootstrap.sh` 用 git 按 `v0.8.36` 的 commit `f86aae6` 取回官方 `skills/` 到 `vendor/skills/`，对本仓实际引用的 13 个官方产物逐项 fail-closed 校验（缺失即报错），再软链到 `~/.agents/skills`、`~/.claude/skills`、`~/.config/opencode/skills`。

上游的 `hyperframes skills update` 不可用：它把「latest」硬编码为上游 main 的实时 HEAD，无法固定到本仓锁定的 commit，且在上游 2026-10-21 退役 workflow 类 skills 后会直接报「Unknown skill(s): faceless-explainer」。`npx skills add owner/repo@<sha>` 也不可用：实测它只在发现阶段认 sha，装出的内容逐字节等于 main HEAD。依据与完整证据见 <https://github.com/suonian/ZWhyperframes-Harness/blob/main/docs/architecture/hf-contract-audit-2026-10-21.md>。

## 如何开工生产

```bash
# 开案：资料归档 + 锁定稿提取冻结 + 项目状态初始化
node scripts/new-video.mjs init --project <产品项目目录> --source <资料包文件或目录>

# 逐段：按分段计划执行官方 hyperframes init + 段骨架
node scripts/new-video.mjs segment --project <产品项目目录> --plan <segment-plan.json> --id <NN>
```

分段计划（语义切分）由主智能体判断后写入 `segment-plan.json`；脚本只校验与执行。产品默认写入 `~/Documents/ZWhyperframes-products/`，不进入本包。

**完整生产顺序以 `docs/rules/production-workflow-rules.md` §2 为准**（官方 Step 0–6 + harness 落点）。本文件不复制该顺序。

## 关于强制力的真实覆盖

**请勿夸大本项目的强制力。** 官方 12 项质量能力中，**只有 3 项有本仓的机器门禁**，其余为官方 CLI 命令（6 项）或流程/复审证据（3 项），无机器门禁。详见 `docs/rules/production-workflow-rules.md` §3 的三层标注。

| 层 | 谁负责 | 本仓做什么 | 没做会怎样 |
| --- | --- | --- | --- |
| 官方生产动作（presets/catalog/carve/keyframes/compare/publish 等） | HyperFrames CLI | 读取退出码、保留产物，不重写 | 流程/复审发现，门禁不一定红 |
| 官方质量能力（pitch-round/animation-map/check） | 官方产物 + 本仓门禁 | preflight 机械校验产物 | final-look 被拒绝 |
| harness 管理件（锁稿/TTS/字幕/master/state） | 本仓脚本 | 单步、确定性、哈希绑定 | 对应 gate/state 命令失败 |

规则文档中写明：**任何声称本仓对全部 12 项 fail-closed 的表述都是错的。** 门禁只能强制可校验的产物——除非某项能力留下产物，否则无法证明它真的被执行过。

## 常见问题与排障

先查 `references/faq.md` 的 30 秒索引；端到端命令与产物见 `references/walkthrough.md`。安装、TTS、字幕、门禁、master、中国大陆网络和反模式都在那里按症状分组。若仍无法解决，附上 `hf --version`、`npm test`、`gate verify`/`preflight` 输出（不要粘贴 API Key）。

## 硬边界（指向唯一所有者）

脚本纪律、四个用户决策门、字幕要求、官方质量能力清单、API Key 规则与测试要求，均以 `AGENTS.md` 与 `docs/rules/` 为唯一所有者；本文件不复述，避免形成第二信源。

## 许可与非官方声明

[Apache-2.0](https://github.com/suonian/ZWhyperframes-Harness/blob/main/LICENSE)，与上游一致，含显式专利授权。本仓库的 `LICENSE` 与 `NOTICE` 不随技能包分发——平台的技能包上传不接受无扩展名文件；完整许可证文本以上述链接为准。

**非官方项目**：与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标，本项目名称仅用于说明技术依赖关系，Apache-2.0 不授予商标使用权。详见 [DISCLAIMER.md](DISCLAIMER.md)。
