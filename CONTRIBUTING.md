# 贡献指南

感谢参与。这个项目的核心主张是**管理层定制层**：核心能力来自 HyperFrames 官方，本仓只补官方没有的管理能力。任何偏离这个边界的贡献都会被拒绝。

## 开发环境

```bash
npm run bootstrap    # 安装锁定依赖 + 刷新官方 skills
npm run doctor       # 环境体检
source ./hf-env.sh   # 生产入口
```

## 提交前必做

**修改规则、脚本或 schema 后必须运行 `npm test`。** 测试全程离线可跑，不应因网络问题失败或挂起。

同时确保：

- 脚本保持**单步、幂等、确定性、零 agent 调用**——子智能体派发只发生在主智能体对话内
- shell 脚本通过 `bash -n`；Python 脚本通过 `python3 -m py_compile`
- 新的门禁在 `scripts/gate.mjs` 里注册，并写进 `docs/rules/production-workflow-rules.md` §3 强制质量能力清单
- 不引入新的密钥形态：API Key 只来自环境变量或 macOS Keychain，**不入仓、不入日志**

## 设计纪律（不可妥协）

1. **fail-closed 而非尽量而为。** 段稿、TTS 产物、注入绑定、MP4 之间用 SHA-256 链式绑定；帧口播必须与锁稿归一化后全等才放行。
2. **证据不可伪造。** 缺失的历史绑定只能重新派生，**禁止事后补哈希**把门禁"修绿"。事后补的哈希等于伪造一个从未被验证过的绑定。
3. **离线是能力底线。** 生产主链不得依赖网络。探测连通性时必须带硬超时——`nc` 和 bash `/dev/tcp` 在静默丢包时会自身挂死。
4. **不重复造轮子。** 不得自建 composition、装配、转场、字幕渲染、check、渲染能力；门禁一律是官方命令的薄包装。
5. **测试必须非空转。** 新增断言要能真正区分对错——写完请验证：撤掉被测逻辑后，该用例必须失败。

## 规则文档

`docs/rules/` 下四份文件各为**单一所有者**，互不重叠：

| 文件 | 职责 |
| --- | --- |
| `production-workflow-rules.md` | 生产流程、决策门、质量能力清单 |
| `visual-production-rulebook.md` | 视觉质量底线 |
| `captions-contract.md` | 字幕合同（要求不可变更） |
| `segment-production-rules.md` | 锁定稿冻结与分段 |

冲突裁决顺序：**用户当前指令 > AGENTS.md > `docs/rules/` > 官方 HF 合同**。

## 已交付产品

已交付的视频**不再负责、不再兼容**。不要为历史项目做迁移或修复；它们中出现的历史格式产物属既成事实。

## 版本锁定

HyperFrames 锁 `0.8.36`。升级不是版本号的改动，而是**合同审计**任务：官方 skill 内容随 `skills update` 一并变动，规则直接引用其原文。请先做合同差异审计，再单独验证风险点，最后才改锁定版本。

## 许可

提交贡献即表示同意以 Apache-2.0 授权你的修改。本项目基于 HyperFrames（Apache-2.0, HeyGen, Inc.），不包含其源码，详见 [NOTICE](NOTICE)。