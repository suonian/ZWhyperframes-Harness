# AGENTS.md — 智能体入口

## 定位（唯一哲学）

**HyperFrames 会跑，但不会自守。**

它的能力是齐的——composition、分镜、子智能体、音频、字幕、check、渲染一应俱全。问题不在缺功能，而在**生产由智能体临场驱动**：同一套流程跑十次就有十种结果；规则写进了文档，却没有任何东西保证它真的被执行。

本仓是**驾驭 HF 的那一层工程**。用规则把官方流程钉死，用门禁把「声称做过」变成「不通过就卡住」，让官方能力每次都被真正用上，稳定、持续、标准化地产出符合要求的视频。

| | 性质 | 做什么 |
| --- | --- | --- |
| **保流程** | 强制 | 把「应该按官方 `faceless-explainer` Step 0–6 + review-loop」变成「不按就过不去」 |
| **强制能力** | 强制 | pitch-round / animation-map / check --strict 有本仓机器门禁（final-look 前置）；官方 CLI 能力（presets / on-device catalog / carve / keyframes / compare / publish）由流程保证真实执行，本仓只读取退出码，不假装有门禁 |
| **补缺口** | 补件 | 少数官方确实没有的管理件：锁定稿分段、MiniMax 词级时间注入（官方 `audio_meta.json` 形状）、master 拼接、状态与授权记录。**这是副产品，不是主命题** |

**不重造轮子是边界，不是目的**：核心能力 100% 来自官方，一律不重写。不得自建 composition、装配、转场、字幕渲染、check、渲染能力；不得把脚本写成 agent 执行层（脚本零 agent 调用）。

## 规则导航

| 文件 | 职责 |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | 生产流程唯一所有者：官方 Step 0–6 落点、用户决策门、强制质量能力清单、交接与问题账本 |
| `docs/rules/visual-production-rulebook.md` | 视觉质量底线（官方 worker 合同优先 + 项目要求） |
| `docs/rules/captions-contract.md` | 字幕合同唯一所有者（要求不可变更） |
| `docs/rules/segment-production-rules.md` | 锁定稿冻结与分段规则 |

冲突裁决顺序：用户当前指令 > AGENTS.md > `docs/rules/` > 官方 HF 合同（以锁定 commit 下 `vendor/skills/` 的官方原文为准）。

> `SKILL.md` 是本仓在 SkillHub 上的分发封装，**只做路由、不承载规范**。若与本文件或 `docs/rules/` 冲突，一律以后两者为准。

## 版本与网络

- 生产锁定 HyperFrames `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`（= 上游 tag `v0.8.36`）。官方 Skill、role、packet builder、Registry 的唯一真源是**按该 commit 取回**的 `vendor/skills/`——由 `scripts/bootstrap.sh` 用 git 按 SHA 取回并逐项 fail-closed 校验，**不是上游 main 的实时产物**（上游 main 已于 2026-10-21 退役 workflow 类 skills，见 `docs/architecture/hf-contract-audit-2026-10-21.md`）。
- **官方 skills 只能来自锁定 commit。** `hyperframes skills update` 把「latest」硬编码为上游 main 的实时 HEAD，无法固定，且会「移除任何不再发布的 skill」——本仓依赖的 `faceless-explainer` 已被上游撤下，跑它会直接失败。`npx skills add owner/repo@<sha>` 同样不可靠：实测它只在发现阶段认 sha，实际装出来的内容逐字节等于 main HEAD。因此取回一律走 `bootstrap.sh` 的 git 按 SHA 路径。
- **网络策略唯一所有者是 `scripts/net-env.sh`**（被 `bootstrap.sh` 与 `hf-env.sh` source）：下载优先中国大陆源（npm → `registry.npmmirror.com`）；GitHub/npm 代理**默认探测 `127.0.0.1:7890`，可达才启用**（不可达则直连，避免把流量指向不存在的本地端口导致静默挂死）；MiniMax 直连 `api.minimaxi.com`（`no_proxy` 豁免 + `tools/minimax` 内主动清代理，双保险）。
  - 覆盖：`HARNESS_NO_PROXY=1` 强制关闭；`HARNESS_PROXY=<地址>` 显式指定（跳过探测）；`HARNESS_NPM_REGISTRY=<地址>` 覆盖默认 npm 镜像。探测必须带硬超时，不得用 `nc` 或 bash `/dev/tcp`（静默丢包时二者自身会挂死）。
- **生产离线可跑（最低要求，非网络禁令）**：P0 一次性准备完成后，**脚手架、字幕、装配、check 与渲染可离线完成**；TTS 与 BGM 检索仍需联网窗口（或在 P0 预生成全部段语音）。这约束的是"依赖"，不是"禁止联网"——按需能力（素材检索、catalog 检索、模型下载等）仍可联网，只是不许成为生产主链的前置条件。
  - 唯一强制点：官方 `hyperframes init` 默认联网 `git clone` skills。段脚手架（`new-video.mjs segment`）以官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 跳过——官方 skills 已由 `bootstrap.sh` 在 P0 刷新。`hf-env.sh` 亦导出该变量，可覆盖。
  - 该底线由 `tests/pipeline-e2e.test.mjs` 的离线用例机器验证（黑洞代理下跑通 init+segment）。
- 视频产品一律写入 `~/Documents/ZWhyperframes-products/`，不进入本仓。

## 硬边界

- 脚本全部单步、幂等、确定性、零 agent 调用；子智能体派发只发生在主智能体对话内（DISPATCH = 官方 `_role.md` 全文 + dispatch context 原文）。
- 生产模式 autonomous（`flow: automation`、`storyboard: no`）；用户决策门只有四个：每段「开始授权」、每段「final look 渲染授权」、master「final look」、全项目「收尾审批」。文字分镜不送审。
- 字幕要求不变：锁定稿逐字一致、标点语块切分、单行显示、无动效、仅当前行高亮；渲染永远走官方 captions。
- 官方质量能力清单（`production-workflow-rules.md` §3）每支视频必须执行，机器命令可门禁。
- API Key 只来自环境变量或 macOS Keychain，不入仓、不入日志。
- 修改规则/脚本/schema 后必须运行 `npm test`。
