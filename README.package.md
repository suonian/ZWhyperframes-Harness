# HyperFrames Harness

用 HyperFrames 生产**中文、无真人出镜、知识类视频**的规则与门禁层；官方能力一行不重写。

## 加载后先跑这一条

```bash
node scripts/skill-ready.mjs   # 自动定位 Git Bash → 按锁定版本自举 → READY / NOT_READY
```

`READY` 之后才进入生产（`--check-only` 只检查，`--doctor` 连体检一起跑）。之后 `source ./hf-env.sh` 才能用 `hf`（锁定 0.8.36）。

## 前置条件

- macOS / Linux；**Windows 仅 WSL2 或 Git Bash**（原生 cmd/PowerShell 不在支持范围）
- Node.js ≥ 22；ffmpeg / ffprobe；Python 3
- MiniMax API Key：环境变量 `MINIMAX_API_KEY`（macOS 亦可用 Keychain）

## 包内有什么、没有什么

**有**：`SKILL.md`、`AGENTS.md`、`docs/rules/`、`references/commands.md`、`scripts/`、`tools/minimax/`、`package.json` + **`package-lock.json`**（依赖可复现，勿删）、本 README。

**没有（到 GitHub 仓库查）**：`references/faq.md`、`references/walkthrough.md`、`presets/`（可选 preset）、`tests/`、`vendor/`（由 `skill-ready` 按锁定 commit 取回）、`docs/architecture/`。

生产默认视觉基线：官方 `capsule` + `Noto Sans SC`，口径见 `docs/rules/visual-baseline.md`。

## 仓库与许可

- 仓库：<https://github.com/suonian/ZWhyperframes-Harness>
- 变更历史 / 排障 / 走查 / 许可证：仓库内 `CHANGELOG.md`、`references/faq.md`、`references/walkthrough.md`、`LICENSE`

Apache-2.0。与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标。
