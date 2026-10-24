# ZWhyperframes-Harness

HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行。核心能力 100% 来自 HyperFrames 官方，本仓不重写。

这是 **SkillHub 分发包内的 README**。完整仓库文档、变更历史、安全策略、贡献指南与测试只在 GitHub 仓库中提供：

- 仓库：<https://github.com/suonian/ZWhyperframes-Harness>
- 规则：`docs/rules/`（本包内已包含四份规范）
- 智能体入口：`AGENTS.md`（本包内）
- 技能入口：`SKILL.md`（本包内）
- 变更历史：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/CHANGELOG.md>
- 安全策略：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/SECURITY.md>
- 贡献指南：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/CONTRIBUTING.md>
- 许可证：Apache-2.0，完整文本见 <https://github.com/suonian/ZWhyperframes-Harness/blob/main/LICENSE>
- 第三方归属：<https://github.com/suonian/ZWhyperframes-Harness/blob/main/NOTICE>

## 前置条件

- macOS 或 Linux；Node.js ≥ 22；ffmpeg / ffprobe；Python 3
- HyperFrames 锁定 `0.8.36`（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）
- MiniMax API Key：只从环境变量或 macOS Keychain 读取

## 快速开始

```bash
# 技能包不含 node_modules；先在包目录内自举（需要网络）
npm run bootstrap

# 环境体检
npm run doctor

# 生产环境入口（必须在 bootstrap 之后）
source ./hf-env.sh
```

分发包**不包含 `tests/`**：测试依赖完整仓库与 `vendor/`，只在 GitHub 仓库中运行 `npm test`。

## 目录

```text
AGENTS.md              智能体入口
SKILL.md               SkillHub 技能入口（只做路由）
docs/rules/            四份规范合同
scripts/               管理脚本（单步、确定性、零 agent 调用）
tools/minimax/         MiniMax API 调用器
hf-env.sh              生产环境入口
```

## 许可与非官方声明

Apache-2.0，与上游一致。本项目与 HeyGen 无隶属、赞助或背书关系；「HyperFrames」是 HeyGen, Inc. 的商标。完整免责声明见 <https://github.com/suonian/ZWhyperframes-Harness/blob/main/DISCLAIMER.md>。
