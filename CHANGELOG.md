[English](CHANGELOG.en.md) | **中文**

# 更新日志

本项目的版本记录 notable changes。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> ⚠️ **HyperFrames 版本锁定**：`0.8.36`。升级不是版本号的改动，而是**合同审计**任务——官方 skill 内容随 `skills update` 一并变动，而本仓规则直接引用其原文。

## [未发布]

### 文档
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