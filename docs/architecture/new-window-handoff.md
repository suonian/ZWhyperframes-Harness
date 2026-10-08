# 新窗口交接

新任务只依赖磁盘，不依赖对话记忆。

## 必读顺序

1. `AGENTS.md` + `README.md`
2. `docs/rules/` 四份规则
3. 官方真源：`$HYPERFRAMES_REPO/skills` 下 `hyperframes/SKILL.md`、`faceless-explainer/SKILL.md` 及入口要求的引用（brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core）
4. 接续具体产品：读该产品 `00-项目总控/state.json`，从磁盘验证当前节点产物哈希后再报告下一步

## 启动检查

```bash
source ./hf-env.sh            # 生产只用本环境提供的 hf/npx hyperframes
git status --short --branch
hf --version                  # 必须为 v0.8.36
npm test
```

## 产品状态读取

- 产品根：`~/Documents/ZWhyperframes-products/<project_id>/`
- 总控：`00-项目总控/state.json`（段计划、每段状态、授权记录、哈希绑定）
- 每段：`NN-段落名/`（HF 项目；STORYBOARD.md 的帧状态 = 官方真源）

## 适用边界（重要）

- **已交付视频不再负责、不再兼容**。本仓只对**后续生产**负责。已交付产品（如某历史交付项目）中出现的历史格式产物属既成事实，**不要**为它们做迁移或修复。
  - 具体已知项：这些项目的 `audio/injection-binding.json` 为 v1（缺 `storyboard_sha256` / `frame_durations`），因此 `gate verify` 会报「注入绑定为历史 schema」。**这是正确的失败，不是待修缺陷**——严禁回填哈希伪造绑定。
- 新生产的段落一律由 `inject-audio-meta.mjs` 写出 `schema_version: 2`，不受影响。

## 工作纪律

- 只从依赖已完成、状态允许的节点开始；先只读核验，不凭交接文字猜测。
- **生产中途不联网也必须能跑完**（能力底线，非网络禁令）；联网按需可用，但不得成为主链前置。`hf-env.sh` 已导出 `HYPERFRAMES_SKIP_SKILLS=1`。
- 用户决策门四个（每段开始授权 / 每段 final look / master final look / 收尾审批），白名单之外不停顿。
