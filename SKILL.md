---
slug: zwhyperframes-harness
version: 0.2.0
displayName: ZWhyperframes Harness
summary: HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行，不重写官方能力。
description: 驾驭 HyperFrames 的那一层工程。解决「HF 会跑但不会自守」——规则与官方质量能力名义上在用，却没有机制保证真的执行过；用规则把官方流程钉死，用门禁把「声称做过」变成「不通过就卡住」。
tags: [hyperframes, video-production, agent-harness, workflow-enforcement, guardrails]
license: Apache-2.0
homepage: https://github.com/suonian/ZWhyperframes-Harness
---

# ZWhyperframes Harness

HyperFrames 的 harness 工程，用于生产中文无真人出镜知识类视频。

**核心能力 100% 来自 HyperFrames 官方**（composition、分镜、子智能体合同、音频、字幕、转场、装配、check、渲染），本项目一行不重写。

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

冲突裁决顺序：**用户当前指令 > `AGENTS.md` > `docs/rules/` > 官方 HF 合同**（以 `$HYPERFRAMES_REPO` 真源为准）。

## 前置条件

- macOS；Node.js ≥ 22；ffmpeg
- HyperFrames 锁定 `v0.8.36`（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）
- MiniMax API Key：只从环境变量或 macOS Keychain 读取，不入仓、不入日志
- 网络策略唯一所有者是 `scripts/net-env.sh`：下载优先中国大陆源，GitHub/npm 代理探测可达才启用

## 快速开始

```bash
npm run bootstrap    # 安装锁定依赖 + 校验 HF 版本 + 刷新官方 skills
npm run doctor       # 环境体检
source ./hf-env.sh   # 生产环境入口
npm test             # 45 项测试，全部离线可跑
```

## 关于强制力的真实覆盖

**请勿夸大本项目的强制力。** 官方 12 项质量能力中，**只有 3 项有本仓的机器门禁**，其余为官方 CLI 命令（6 项）或流程/复审证据（3 项），无机器门禁。详见 `docs/rules/production-workflow-rules.md` §3 的三层标注。

规则文档中写明：**任何声称本仓对全部 12 项 fail-closed 的表述都是错的。** 门禁只能强制可校验的产物——除非某项能力留下产物，否则无法证明它真的被执行过。

## 硬边界

- 脚本单步、幂等、确定性、**零 agent 调用**；子智能体派发只发生在主智能体对话内。
- 用户决策门只有四个：每段「开始授权」、每段「final look 渲染授权」、master「final look」、全项目「收尾审批」。文字分镜不送审。
- 字幕永远走官方渲染；**不得自建** composition、装配、转场、字幕渲染、check、渲染能力。
- **不重造轮子是边界，不是目的。**
- 视频产品写入 `~/Documents/ZWhyperframes-products/`，不写入本仓。
- 修改规则、脚本或 schema 后必须运行 `npm test`。

## 许可与非官方声明

[Apache-2.0](LICENSE)，与上游一致，含显式专利授权。

**非官方项目**：与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标，本项目名称仅用于说明技术依赖关系，Apache-2.0 不授予商标使用权。详见 [DISCLAIMER.md](DISCLAIMER.md)。