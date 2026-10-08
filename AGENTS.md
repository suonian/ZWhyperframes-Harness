# AGENTS.md — 智能体入口

## 定位（唯一哲学）

本仓是 HyperFrames 视频生产流水线的**管理层定制层**。核心能力 100% 来自 HF 官方；本仓只做：

1. **保流程**——规则与门禁确保生产完整走 HF 官方 `faceless-explainer` Step 0–6 + review-loop。
2. **补缺口**——HF 没有的管理能力：锁定稿分段、MiniMax 词级时间注入（官方 `audio_meta.json` 形状）、master 拼接、状态与授权记录。
3. **优能力**——官方质量能力（pitch-round / presets / on-device catalog / carve / animation-map / check --strict 等）的强制接入。

禁止重复造轮子：不得自建 composition、装配、转场、字幕渲染、check、渲染能力；不得把脚本写成 agent 执行层（脚本零 agent 调用）。

## 规则导航

| 文件 | 职责 |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | 生产流程唯一所有者：官方 Step 0–6 落点、用户决策门、强制质量能力清单、交接与问题账本 |
| `docs/rules/visual-production-rulebook.md` | 视觉质量底线（官方 worker 合同优先 + 项目要求） |
| `docs/rules/captions-contract.md` | 字幕合同唯一所有者（要求不可变更） |
| `docs/rules/segment-production-rules.md` | 锁定稿冻结与分段规则 |

冲突裁决顺序：用户当前指令 > AGENTS.md > `docs/rules/` > 官方 HF 合同（以 `$HYPERFRAMES_REPO` 真源为准）。

## 版本与网络

- 生产锁定 HyperFrames `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`。官方 Skill、role、packet builder、Registry 的唯一真源是构建后的 `$HYPERFRAMES_REPO`。
- **网络策略唯一所有者是 `scripts/net-env.sh`**（被 `bootstrap.sh` 与 `hf-env.sh` source）：下载优先中国大陆源（npm → `registry.npmmirror.com`）；GitHub/npm 走本地代理 `127.0.0.1:7890`；MiniMax 直连 `api.minimaxi.com`（`no_proxy` 豁免 + `tools/minimax` 内主动清代理，双保险）。
  - 代理不可用时**必须显式关闭**（`HARNESS_NO_PROXY=1` 或 `HARNESS_PROXY=""`）——默认开启时代理不可达会静默挂死而无超时。
- **生产离线可跑（最低要求，非网络禁令）**：P0 一次性准备完成后，**生产中途不联网也必须能把片子做完**。这约束的是"依赖"，不是"禁止联网"——按需能力（素材检索、catalog 检索、模型下载等）仍可联网，只是不许成为生产主链的前置条件。
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
