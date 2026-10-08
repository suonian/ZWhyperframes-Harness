---
name: Bug 报告
about: 报告一个可复现的缺陷
title: "[Bug] "
labels: bug
assignees: ''
---

## 环境

```bash
node --version      # 期望 >= 22
hyperframes --version   # 期望 0.8.36（版本锁定，漂移即拒绝运行）
ffmpeg -version
python3 --version
```

- 操作系统：
- Node.js 版本：
- 安装方式：`npm run bootstrap` 后 `source ./hf-env.sh`

## 问题描述

<!-- 简述发生了什么 -->

## 复现步骤

1.
2.
3.

## 期望行为

<!-- 你认为应该发生什么 -->

## 实际行为

<!-- 实际发生了什么；若有报错请粘贴完整输出 -->

## 相关日志

<!-- 若问题涉及门禁，请附上 scripts/gate.mjs 的输出。注意：贴日志前请确认其中不含 API Key。 -->

## 检查清单

- [ ] 我已确认 HyperFrames 版本为锁定的 `0.8.36`
- [ ] 我已运行 `npm test` 并确认基线状态
- [ ] 我粘贴的内容中不含 API Key、token 或其他凭证