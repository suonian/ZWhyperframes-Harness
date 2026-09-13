# ZWhyperframes-Harness

基于 HyperFrames 的中文无真人出镜（faceless）知识类视频生产流水线的**管理层定制层**。

- **核心能力 100% 来自 HyperFrames v0.8.36**（锁定 commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）：composition、分镜、子智能体合同、音频引擎、字幕、转场、装配、check、Studio、渲染——不重写。
- **本仓只做管理层**：保流程（规则/门禁）、补缺口（锁定稿分段、MiniMax TTS 注入、master 拼接、状态与授权记录）、优能力（官方质量能力的强制接入）。

## 版本基线

| 项目 | 值 |
| --- | --- |
| harness | v0.1.0 |
| HyperFrames | v0.8.36 / `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52` |
| Node.js | 22+ |
| MiniMax | speech-2.8-hd / speed 1.27（直连，不走代理） |
| 产品输出 | `~/Documents/ZWhyperframes-products/` |

## 仓库结构

```text
docs/rules/     生产规则（视觉、字幕、分段、工作流）
docs/architecture/  能力审计与交接
scripts/        管理脚本（单步、确定性、零 agent 调用）
tools/          MiniMax 调用器
tests/          脚本测试
```

## 入口

1. 读 `AGENTS.md`。
2. 读 `docs/rules/` 四份规则。
3. 接续生产读 `docs/architecture/new-window-handoff.md`。
4. HF 官方能力真源：`$HYPERFRAMES_REPO/skills`（`faceless-explainer` 与 `hyperframes-core` 等）。
