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

## 工作纪律

- 只从依赖已完成、状态允许的节点开始；先只读核验，不凭交接文字猜测。
- 生产期零外部请求；MiniMax 直连；GitHub/npm 走代理。
- 用户决策门四个（每段开始授权 / 每段 final look / master final look / 收尾审批），白名单之外不停顿。
