# HyperFrames Harness

用 HyperFrames 生产**中文、无真人出镜、知识类视频**的规则与门禁层。

HyperFrames 官方能力很全——composition、分镜、子智能体、音频、字幕、转场、装配、check、渲染。问题不在缺功能，而在**生产由智能体临场驱动**：同一套流程跑十次有十种结果，规则写了却没人保证执行。本技能把官方流程钉死，把「声称做过」变成「不通过就卡住」，核心能力一行不重写。

## 何时使用

- 你有一份**锁定口播稿**，要做成中文无真人出镜知识视频；
- 你要求同一套流程**可复现**，而不是每次让智能体自由发挥；
- 你需要对锁稿、TTS、字幕、MP4、master 做哈希绑定与 fail-closed 检查；
- 你要排查 HyperFrames 生产中的门禁、TTS、字幕、分段或 master 拼接问题。

**不适合**：真人出镜/实拍剪辑、纯通用视频剪辑、只需要一句提示词出一段素材的场景。

## 输入与输出约束

| | 约束 |
| --- | --- |
| 输入 | 中文 UTF-8 锁定口播稿（`script:start/end` 唯一标记块）、资料包、项目路径；Node ≥22、ffmpeg/ffprobe、Python 3；MiniMax Key |
| 输出 | 段 MP4、master candidate、`state.json` 与绑定/收据 JSON、字幕分组与 official captions HTML |
| 不可变 | 授权后不改锁稿/段稿/TTS/字幕/master；变化必须重新派生并重新授权 |
| 不负责 | 官方 composition/字幕渲染/check/render 实现、视觉素材生成、`vendor/` 修改 |

**给智能体的最短触发提示**：

```text
使用 zwhyperframes-harness 技能，把 <资料包/锁稿> 按锁定稿生产中文无真人出镜知识视频。
先读 SKILL.md，再按 docs/rules/production-workflow-rules.md 的 Step 0–6 执行；
每个用户决策门停下来等我确认；不要重写官方 composition/字幕/check/render。
```

普通用户不需要背脚本：安装后直接说“用 zwhyperframes-harness 技能做这支视频”。

## 30 秒判断

| 你的情况 | 建议 |
| --- | --- |
| 有中文口播稿，要标准化生产 | 用本技能 |
| 想先看完整流程 | 读 `references/walkthrough.md` |
| 安装/门禁报错 | 查 `references/faq.md` |
| 只想要通用 HyperFrames 用法 | 直接用官方 HyperFrames |
| 要改官方渲染/字幕/装配器 | 不要；本仓只加约束 |

## 前置条件

- macOS 或 Linux（Keychain 仅 macOS）；Windows 原生未验证
- Node.js ≥ 22；ffmpeg / ffprobe；Python 3
- HyperFrames 锁定 `0.8.36`（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）
- MiniMax API Key：只从环境变量或 macOS Keychain 读取

macOS 可用 Homebrew 准备：

```bash
brew install node ffmpeg python
```

Debian/Ubuntu 可用：

```bash
sudo apt-get update && sudo apt-get install -y nodejs npm ffmpeg python3
```

## 安装

技能包安装到客户端发现目录。不要装到默认临时目录：

```bash
# 通用 agents 目录（推荐）
skillhub install zwhyperframes-harness --dir ~/.agents/skills

# Claude Code 全局目录
skillhub install zwhyperframes-harness --dir ~/.claude/skills

# DeepSeek Harness 用户目录
skillhub install zwhyperframes-harness --dir ~/.dsh/skills
```

项目级安装使用 `./.agents/skills` 或 `./.claude/skills`。安装后的目录名是 `zwhyperframes-harness`，不是显示名。

## 第一次运行

技能包不含 `node_modules`，先自举：

```bash
cd ~/.agents/skills/zwhyperframes-harness
npm run bootstrap     # 安装锁定依赖 + 取回官方 skills（需要网络）
npm run doctor        # 环境体检
source ./hf-env.sh    # 生产入口；必须在 bootstrap 之后
```

`hf()` 会拒绝版本不符的 HyperFrames。分发包不含 `tests/`，测试只在 GitHub 仓库运行；包内执行 `npm test` 会明确失败，这是预期行为。

## 命令地图

| 目标 | 命令 |
| --- | --- |
| 开案、锁稿冻结 | `node scripts/new-video.mjs init --project <dir> --source <file-or-dir>` |
| 段脚手架 | `node scripts/new-video.mjs segment --project <dir> --plan <plan.json> --id <NN>` |
| 锁稿/TTS/注入校验 | `node scripts/gate.mjs verify --project <root> --segment <NN>` |
| final look 前置检查 | `node scripts/gate.mjs preflight --project <root> --segment <NN>` |
| 段授权/MP4 绑定 | `node scripts/state.mjs approve/set-mp4 ...` |
| 字幕分组 | `node scripts/captions-zh.mjs build|verify --segment <段目录>` |
| TTS 注入 | `node scripts/minimax-tts.mjs` + `node scripts/inject-audio-meta.mjs --segment <段目录>` |
| master 拼接 | `node scripts/finalize-master.mjs --project <root>` |
| 环境体检 | `npm run doctor` |
| 发布预检 | `npm run publish-skill -- --dry-run`（维护者） |

## 它强制什么、不强制什么

- **有机器门禁**：final-look preflight（锁稿/TTS/注入/字幕/animation-map/28px 布局/官方 check）、`verify`、`mp4`、`master-inputs`、段/ master 授权状态。
- **没有机器门禁**：官方 frame preset 的审美选择、catalog 语义检索、carve、keyframes、compare、publish、preview 评论、recipe freeze、media-treatment。它们由流程与复审保证执行，规则文档明确披露，不假装 fail-closed。
- **责任边界**：官方能力由 HyperFrames 提供；本仓只读退出码/保留产物，不重写官方 composition、字幕渲染、check 或 render；管理件（锁稿/TTS/字幕/master/state）由本仓确定性脚本负责。
- 详见 `docs/rules/production-workflow-rules.md` §3 的三层清单。

## 稳定性与错误处理

| 机制 | 实现 |
| --- | --- |
| 网络/取回 | bootstrap 的 git fetch 硬超时、LFS 指针检测、旧 vendor 回滚；失败不写 commit stamp |
| 外部命令 | `runHf` 15 分钟；gate preflight 30 分钟；captions verify 10 分钟 |
| 状态写入 | `writeJson` 临时文件 + rename；授权/绑定不会写半截 |
| 证据链 | 锁稿/TTS/注入/字幕/MP4 的 SHA-256 绑定；漂移即拒绝 |
| TOCTOU | finalize 后重新哈希；master 批准前校验 candidate |
| 恢复 | 新建项目/段失败清理；旧 vendor 回滚；错误带 `[gate]`/`[state]` 前缀 |

## 证据链

```text
锁定口播稿
  └─ user_script.txt（段级冻结）
      └─ tts-binding.json（mp3/titles/manifest）
          └─ injection-binding.json（audio_meta/STORYBOARD/帧时长）
              └─ final-look-receipt.json（preflight 产物）
                  └─ state.json 的 MP4 SHA-256 / master candidate
```

缺失的绑定只能重新派生；禁止事后补哈希。

## 设计取舍

- **不重写官方能力**：composition、字幕渲染、check、render 仍走 HyperFrames；本仓只加约束和证据链，避免 fork 上游。
- **证据优先于声明**：每个关键产物都有 SHA-256 绑定；不能靠“我已经检查过”通过。
- **fail-closed 而非自动修复**：证据漂移时拒绝继续，要求重新派生；不把未知状态猜成通过。
- **锁定 commit 而不是 latest**：官方 skills 按 `v0.8.36` 取回，避免上游 main 漂移改变生产结果。
- **单步确定性脚本**：脚本不做 agent 调用、不自动改规范；方便审计与重跑。

## 安全与隐私

- API Key 只从 `MINIMAX_API_KEY` 环境变量或 macOS Keychain 读取，不写入 state、绑定、manifest 或日志；
- 脚本不发起遥测；网络访问仅限官方依赖、官方 skills 取回、MiniMax API 与（可选的）BGM 检索；
- 发布包通过白名单生成，排除 `vendor/`、`tests/`、`docs/architecture/` 与本机文件；
- 安全策略与漏洞报告：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/SECURITY.md>。

## 中国大陆网络

```bash
# npm 默认走 npmmirror；需要覆盖时
HARNESS_NPM_REGISTRY=https://registry.npmjs.org npm run bootstrap

# GitHub 代理（默认探测 127.0.0.1:7890，可达才启用）
HARNESS_PROXY=http://127.0.0.1:7890 npm run bootstrap

# 强制直连
HARNESS_NO_PROXY=1 npm run bootstrap
```

官方 skills 只能按锁定 commit 从 GitHub 取回；如果网络完全不可达，这是 P0 环境准备问题。生产中途的离线范围：脚手架、字幕、装配、check、render 可离线；TTS/BGM 检索需要联网窗口或 P0 预生成全部段语音。

## 文档

包内：

- `SKILL.md`：技能入口
- `AGENTS.md`：智能体入口
- `docs/rules/`：四份规范合同
- `references/faq.md`：常见问题、错误索引、反模式
- `references/walkthrough.md`：从资料包到 master 的端到端走查
- `references/commands.md`：命令参数、成功输出与失败含义
- `references/example-source.md` / `example-segment-plan.json`：可直接复制的示例输入
- `scripts/`：管理脚本
- `tools/minimax/`：MiniMax API 调用器

GitHub 仓库（完整文档、审计、变更历史、测试）：

- 仓库：<https://github.com/suonian/ZWhyperframes-Harness>
- 变更历史：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/CHANGELOG.md>
- 安全策略：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/SECURITY.md>
- 许可证：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/LICENSE>
- 第三方归属：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/NOTICE>

## 许可与非官方声明

Apache-2.0，与上游一致。本项目与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标。完整免责声明见 <https://github.com/suonian/ZWhyperframes-Harness/blob/main/DISCLAIMER.md>。
