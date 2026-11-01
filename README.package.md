# HyperFrames Harness

用 HyperFrames 生产**中文、无真人出镜、知识类视频**的规则与门禁层。

HyperFrames 官方能力很全（composition、分镜、子智能体、音频、字幕、转场、装配、check、渲染）。问题不在缺功能，而在**生产由智能体临场驱动**：同一套流程跑十次有十种结果。本技能把官方流程钉死，把「声称做过」变成「不通过就卡住」，官方能力一行不重写。

## 何时使用

- 有**锁定口播稿**，要做中文无真人出镜知识视频；
- 要求生产**可复现**，而不是每次由智能体自由发挥；
- 需要对锁稿、TTS、字幕、MP4、master 做哈希绑定与 fail-closed 检查；
- 排查 HyperFrames 生产中的门禁、TTS、字幕、分段或 master 拼接问题。

**不适合**：真人出镜/实拍剪辑、纯通用视频剪辑、只要一段素材的场景。

## 前置条件

- macOS 或 Linux；**Windows 仅在 WSL2 或 Git Bash 中支持**（原生 cmd/PowerShell 不在支持范围，所有 shell 入口依赖 bash）
- Node.js ≥ 22；ffmpeg / ffprobe；Python 3
- HyperFrames 锁定 `0.8.36`（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）
- MiniMax API Key：只从环境变量或 macOS Keychain 读取（Windows / Linux 只有环境变量一条路）

依赖可复现性由**包内的 `package-lock.json`** 保证：不要删它，也不要单独替换 `package.json`——两者必须成对。

## 安装与首次运行

```bash
skillhub install zwhyperframes-harness --dir ~/.agents/skills   # 或 ~/.claude/skills
cd ~/.agents/skills/zwhyperframes-harness
npm run bootstrap     # 安装锁定依赖 + 校验 HF 版本 + 按锁定 commit 取回官方 skills（需联网）
npm run doctor        # 环境体检
source ./hf-env.sh    # 生产入口；必须在 bootstrap 之后
```

`hf()` 会拒绝版本不符的 HyperFrames。包内不含 `tests/`，`npm test` 只在 GitHub 仓库运行。

## 命令地图

| 目标 | 命令 |
| --- | --- |
| 开案、锁稿冻结 | `node scripts/new-video.mjs init --project <dir> --source <file-or-dir>` |
| 段脚手架 | `node scripts/new-video.mjs segment --project <dir> --plan <plan.json> --id <NN>` |
| 锁稿/TTS/注入校验 | `node scripts/gate.mjs verify --project <root> --segment <NN>` |
| final look 前置检查 | `node scripts/gate.mjs preflight --project <root> --segment <NN>` |
| 段授权 / MP4 绑定 | `node scripts/state.mjs approve|set-mp4 ...` |
| 字幕分组 | `node scripts/captions-zh.mjs build|verify --segment <段目录>` |
| TTS + 注入 | `node scripts/minimax-tts.mjs` + `node scripts/inject-audio-meta.mjs --segment <段目录>` |
| master 拼接与交付 | `node scripts/finalize-master.mjs --project <root>` → `node scripts/state.mjs master --kind close ...` → `node scripts/gate.mjs final-delivery --project <root>` |

完整参数、成功输出与失败含义见 `references/commands.md`。

## 它强制什么、不强制什么

- **有机器门禁**：final-look preflight（锁稿/TTS/注入/字幕/animation-map/28px 布局/**视觉基线**/官方 check）、渲染前复核 `render-ready`、`mp4` 成片内容门禁（有画面/有声音/非全黑）、`master-inputs`、`final-delivery`、段与 master 的授权状态。
- **没有机器门禁**：preset 的审美选择、catalog 语义检索、carve、keyframes、compare、publish、preview 评论、recipe freeze、media-treatment——由流程与复审保证，规则明确披露，不假装 fail-closed。
- **默认视觉基线**：官方 `capsule` + `Noto Sans SC`（偏好不是排他）。详见 `docs/rules/visual-baseline.md`。
- **责任边界**：官方能力由 HyperFrames 提供，本仓只读退出码/保留产物，不重写官方 composition、字幕渲染、check 或 render。

## 包内有什么、没有什么

**有**：`SKILL.md`、`AGENTS.md`、`docs/rules/`（四份规范合同）、`references/commands.md`（命令契约）、`scripts/`、`tools/minimax/`、`package.json` + **`package-lock.json`**、本 README。

**没有（请到 GitHub 仓库看）**：`references/faq.md`、`references/walkthrough.md`、`presets/creative-mode-zh/`（仓库内的**可选**中文 preset）、`tests/`、`vendor/`、`docs/architecture/`。理由：为在 460KB 硬性发布上限内保住 `package-lock.json` 与全部基线规则，长文档与 preset 留在仓库。

网络：npm 默认走大陆镜像；`HARNESS_NPM_REGISTRY` / `HARNESS_PROXY` / `HARNESS_NO_PROXY=1` 可覆盖（详见 `AGENTS.md`「版本与网络」）。

## 仓库与许可

- 仓库：<https://github.com/suonian/ZWhyperframes-Harness>
- 排障速查：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/references/faq.md>
- 变更历史：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/CHANGELOG.md>
- 安全策略：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/SECURITY.md>
- 许可证：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/LICENSE>（Apache-2.0，与上游一致）

本项目与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标。
