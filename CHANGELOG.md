[English](CHANGELOG.en.md) | **中文**

# 更新日志

本项目的版本记录 notable changes。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> ⚠️ **HyperFrames 版本锁定**：`0.8.36`。升级不是版本号的改动，而是**合同审计**任务——官方 skill 内容随 `skills update` 一并变动，而本仓规则直接引用其原文。

## [未发布]

### 门禁
- **修正一处不实断言**：§3 原写「12 项强制质量能力，缺一项即门禁失败」，并声称第 1 项由 `gate.mjs` 校验 `BRIEF.md` 的 `## Intent`——但该门禁**从未实现**，全仓零 BRIEF 校验代码。把「写在规则里」当成「已经强制」，正是本项目要消灭的病，且它自己先犯了。
- 新增 `gate.mjs pitch-round`：校验项目根 `BRIEF.md` 的 `## Intent` 非空（官方 `pitch-round.md` 规定的胜出概念落点）。
- 新增 `gate.mjs animation-map`：校验段内 `.hyperframes/anim-map/animation-map.json` 存在（官方 `animation-map.mjs` 的默认产物路径）。
- **`gate.mjs final-look` 内含官方 `check --strict`**：此前 `check` 与 `final-look` 互不调用，可先拿渲染授权再补跑甚至不跑；现在渲染授权不可绕过检查。
- 两项新门禁均配 e2e 用例，已用变异测试（把门禁改成永远放行）确认用例会转红。
- §3 拆为三层并如实标注覆盖范围：3.1 本仓机器门禁（3 项）、3.2 官方 CLI 命令（6 项，无机器门禁）、3.3 流程/复审证据（3 项，无机器门禁），并写明「任何声称本仓对全部 12 项 fail-closed 的表述都是错的」。

### 文档
- README 首屏改为「解决什么 · 提供什么 · 特点」：价值陈述置于一句话描述之后，免责声明与目录下沉；原「为什么需要这一层」章节内容上移并删除，避免重复。「凭什么可信」中与首屏重复的四条特点删除，仅保留机制说明与三层强制披露。
- 新增 `assets/wechat-qr.jpg` 与 README「联系作者」段（中英双份），置于许可节之前。
- 仓库描述改为「HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行。不重写官方能力。」（53 字符 / 117 字节）。
- 新增 `CITATION.cff`，GitHub 据此生成 Cite this repository。
- README 新增「获取帮助」段，列出 issue / 功能提议 / 安全漏洞 / 贡献代码四条渠道。
- topics 增补 `agent-harness`、`guardrails`、`llm` 三个领域检索词（共 15 个）。

### 安全
- 开启 GitHub secret scanning（含 push protection）与 dependabot security updates。
- 开启 private vulnerability reporting——`SECURITY.md` 指示的私下报告通道此前处于关闭状态。
- **README 重构为六段结构**（中英双语）：一句话是什么 / 为什么需要 / 是什么·不是什么 / 如何解决 / 凭什么可信 / 使用与治理。「凭什么可信」段只写可被检验的事实，并公开三层强制力的真实覆盖——官方 12 项能力中只有 3 项有机器门禁。
- 新增**非目标**段落：把「不重造官方能力」「脚本零 agent 调用」「不追未发布版本」从角落提到正文，它们是「是什么」的一部分。
- **对齐 standard-readme 规范**：简短描述压到 112 字符并与 GitHub 仓库描述保持一致；补目录（README 已超 100 行门槛）；许可改为末节。
- **纠正 GitHub 仓库描述**：此前仍是 292 字符的旧定位（"管理层定制层…优能力（强制接入）"），与已改写的文档自相矛盾，本次同步为新定位。
- **纠正项目定位**：原先把本仓描述为「管理层定制层」「只补官方没有的管理能力」，因果是反的——真正的主因是 **HF 会跑但不会自守**：规则和官方能力「名义上在用」实际没被执行。定位改述为**驾驭 HF 的那一层工程**，三件事重新定性为「保流程（强制）/ 强制能力（强制）/ 补缺口（补件）」，并明确「不重造轮子是边界，不是目的」。
- 中文 README 补上此前缺失的问题陈述段落（英文版原本有），中英结构对齐。
- **社区治理文档双语化**：新增 `CONTRIBUTING` / `CHANGELOG` / `CODE_OF_CONDUCT` / `SECURITY` / `DISCLAIMER` 五份英文版，中英版本互指语言切换行。
- **修复 README 语言切换**：`README.md` 原写作 `**English** | [中文](#...)`，"English" 被加粗却没有链接，导致仓库首页看起来「只有中文版」。已改为 `[English](README.en.md) | **中文**`。
- **确立语言政策**：社区与治理文档双语；`docs/rules/`、`AGENTS.md`、`docs/architecture/`、`docs/plans/` 维持中文单源——它们是单一所有者的规范合同，英文孪生版本会给规范性要求造出两个 source of truth，而本仓裁决顺序没有语言维度可仲裁漂移。

### 变更
- 官方合同引用路径纠错：5 份合同实际位于 `skills/hyperframes/references/`，原文档指向的 `skills/hyperframes-core/references/` 是死链（已逐个实证）。

## [0.1.0] — 2026-10-08

首个公开版本。

### 新增
- **管理层定制层定位**：保流程（规则与门禁）、补缺口（锁定稿分段 / MiniMax 词级时间注入 / master 拼接 / 状态与授权）、优能力（强制接入官方质量能力）。
- **官方能力审计**（`docs/architecture/hf-0.8.36-capability-audit.md`）：确认 HF 0.8.36 已原生采用「单智能体 + 每帧一个子智能体」，前代自建的 Worker 执行层、传输证据、三槽队列、心跳/lease 全部退役。
- **生产脚本**（单步、幂等、确定性、零 agent 调用）：项目脚手架、MiniMax TTS 注入、中文字幕分组、门禁、状态与授权、master 拼接。
- **规则文档**（各为单一所有者）：生产工作流、视觉规则书、字幕合同、锁定稿与分段。
- **离线可跑底线**：官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 阻断段脚手架的隐藏联网依赖；`npm test` 全程离线，含黑洞代理下的离线底线用例。
- **网络策略单点化**（`scripts/net-env.sh`）：npm 中国大陆镜像；GitHub/npm 代理**默认探测 `127.0.0.1:7890`，可达才启用**；MiniMax 直连豁免。
- **证据完整性**：锁稿 → TTS → 注入绑定 → MP4 的 SHA-256 链式绑定；帧口播必须与锁稿归一化后全等。
- **门禁**：`verify` / `authorized` / `final-look` / `check`（官方 `--strict` 包装）/ `mp4` / `next-segment` / `master-inputs` / `layout-guard`。
- **锁定稿标记泛化**：`<任意命名空间>:script:start|end`，向后兼容既有资料包。
- **CI**：ubuntu + macos × Node 22/24。

### 安全
- API Key 只来自环境变量或 macOS Keychain，不入仓、不入日志。
- 注入绑定 schema 版本化；历史格式**拒绝补哈希伪造证据**，只能重新派生。
- 密钥与个人标识扫描：全量历史无密钥、无个人绝对路径。

### 许可
- Apache-2.0（与上游 HyperFrames 一致）。本项目不含 HF 源码，仅作外部依赖调用。

[未发布]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/suonian/ZWhyperframes-Harness/releases/tag/v0.1.0