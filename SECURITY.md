# 安全策略

## 支持范围

| 版本 | 状态 |
| --- | --- |
| `main` 分支 | ✅ 接受安全修复 |
| 已发布版本 | ✅ 接受安全修复 |
| 历史提交 | ❌ 不再回补 |

## 报告漏洞

**请不要用公开 issue 报告安全漏洞。** 通过 GitHub 的 [private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) 私下报告，或在该功能不可用时联系维护者。

请尽量提供：受影响文件/行、复现步骤、影响范围、以及你建议的修复方向。确认修复后我们会公开致谢（除非你希望匿名）。

---

## 本项目的安全设计

### 凭证

**API Key 只来自环境变量或 macOS Keychain，绝不入仓、不入日志。**

```bash
export MINIMAX_API_KEY="..."        # 优先
# 或
security add-generic-password -a minimax -s MINIMAX_API_KEY -w '...'
```

Keychain 服务名可用 `MINIMAX_KEYCHAIN_SERVICE` 覆盖。

仓库中的 `tools/minimax/minimax.config.example.json` 等文件**只有占位符**，请勿提交真实密钥。`.gitignore` 已排除 `.env*` 与 `*.local`。

### 证据完整性（fail-closed）

本项目用 SHA-256 链式绑定生产产物——锁稿 → TTS 产物 → 注入绑定 → MP4。

**严禁事后补哈希把门禁"修绿"。** 事后计算的哈希等于伪造一个从未被验证过的绑定，会让整条证据链失去意义。缺失的绑定只能通过重跑对应生成步骤重新派生。

> 已交付的历史产品不做迁移——它们中的历史格式产物属既成事实，门禁失败是**正确行为**。

### 命令执行

脚本通过 `spawnSync` 调用外部命令（`node`、`ffmpeg`、`ffprobe`、`python3`、`git`），**不使用 shell 字符串拼接**，参数以数组传递，避免命令注入。段目录与产品根的路径边界在脚手架与门禁中均有显式校验，拒绝越出项目根的路径。

### 网络

- 生产主链**不依赖网络**（离线可跑是能力底线）
- 代理探测使用带 1s 超时的 socket 连接，绝不用 `nc` 或 bash `/dev/tcp`（两者在静默丢包时自身会挂死）
- MiniMax 走国内直连，脚本内主动清除代理变量

---

## 第三方组件与遥测（重要）

本项目**自身不上报任何遥测**。但它依赖并调用以下第三方：

### HyperFrames（Apache-2.0, HeyGen, Inc.）

HyperFrames CLI **会上报匿名使用遥测**。本项目在段脚手架中使用 `--skill=faceless-explainer`，该 slug 会被写入每个项目的 `hyperframes.json`，用于在匿名遥测中归因所使用的创作工作流。

**如需完全关闭遥测：**

```bash
export HYPERFRAMES_NO_TELEMETRY=1
```

请把它加进你的生产环境入口脚本。我们不对第三方遥测的具体内容作保证，详见 [HyperFrames 官方文档](https://github.com/heygen-com/hyperframes)。

### MiniMax

仅在你主动调用 `tools/minimax/` 下的脚本时才会请求 MiniMax API。凭证只从环境变量或 Keychain 读取，不写入任何产物文件。

---

## 商标与非官方声明

「HyperFrames」是 HeyGen, Inc. 的商标。本项目为**非官方独立项目**，与 HeyGen 无隶属、赞助或背书关系；名称中包含该词仅为说明技术依赖关系。Apache-2.0 不授予商标使用权。详见 [DISCLAIMER.md](DISCLAIMER.md)。