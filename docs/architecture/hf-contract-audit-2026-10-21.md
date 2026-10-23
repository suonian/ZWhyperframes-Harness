# 上游合同审计：2026-10-21 workflow skills 退役

> 本文件是一次**合同审计**的记录。AGENTS.md 规定：HyperFrames 的升级不是版本号的改动，而是合同审计任务——官方 skill 内容随上游 commit 一并变动，而本仓规则直接引用其原文。本次审计的触发事件正是这条规则所预期的情形。

## 1. 触发

2026-10-23 的 CI 变红（4 个作业中 3 个在 Bootstrap 步骤失败），失败信息：

```
■  Update failed: Unknown skill(s): faceless-explainer.
  Available: figma, hyperframes, hyperframes-cli, hyperframes-registry,
             media-use, remotion-to-hyperframes, slideshow
```

根因是上游提交：

```
2026-10-21T19:19:31Z  688229314
feat(skills)!: publish seven knowledge skills aligned with Studio and retire the workflow skills (#5651)
```

标题中的 `!` 是破坏性变更标记。该提交删除了 167 个文件，其中两个整目录被撤下：

- `skills/faceless-explainer/`——本仓生产流程的官方合同来源
- `skills/embedded-captions/`

`faceless-explainer` 并未消失，而是被折叠为 `hyperframes` 核心 skill 下的一个 **route**（`skills/hyperframes/references/routes/faceless-explainer.md`）。

## 2. 事实核验

| 事项 | 结论 | 核验方式 |
| --- | --- | --- |
| 上游 `skills/` 目录 | main 上剩 7 个；锁定 commit `f86aae6` 上有 20 个 | `git ls-tree` 对两个 commit 取证 |
| `f86aae6` 的身份 | 就是上游 tag `v0.8.36` 的发布 commit（`chore: release v0.8.36 (#3911)`，2026-09-12） | `git ls-remote --tags` + `git show` |
| 合同文件位置 | 锁定 commit 下在 `skills/hyperframes-core/references/`（brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core） | `git ls-tree -r` |
| `pitch-round.md` | 锁定 commit 下在 `skills/hyperframes/references/pitch-round.md`（与 `scripts/gate.mjs` 的引用一致，无需改） | `git ls-tree -r` |
| 字幕运行时 | `captions.mjs` / `lib/tokens.mjs` / `lib/dimensions.mjs` 在 main 上**已彻底删除**，无替代物；合同改为散文式的 `references/captions.md` | 全树搜索 |
| 音频引擎 | 迁至 `skills/media-use/audio/scripts/audio.mjs` | `find` |
| CLI 的 skills 解析 | `hyperframes skills update` 固定走上游 main 的**实时 HEAD**（源码 `resolveLatestManifest` 的 canonical 分支 + `SOURCES` 的固定 url），且会「移除任何不再发布的 skill」 | 读 `node_modules/hyperframes/dist/cli.js` |
| `npx skills add owner/repo@<sha>` | **不可用**：它在发现阶段认了 sha（提示 Found 13 skills），但装出来的内容逐字节等于 main HEAD | 实测安装后对三个 skill 的 SKILL.md 做 SHA-256 比对 |

## 3. 影响面

三条承重代码路径依赖已退役的 skill：

| 位置 | 依赖 | 状态 |
| --- | --- | --- |
| `scripts/bootstrap.sh` | `hyperframes skills update faceless-explainer` | **硬失败**——这就是 CI 变红的直接原因 |
| `scripts/captions-zh.mjs` | 导入官方 `faceless-explainer/scripts/captions.mjs` + `lib/tokens.mjs` + `lib/dimensions.mjs` | 运行时缺失即抛错 |
| `scripts/inject-audio-meta.mjs` | 官方 `faceless-explainer/scripts/audio.mjs` | 已有 `media-use` 新路径兜底 |
| `scripts/new-video.mjs` | `hyperframes init --skill=faceless-explainer` | `--skill` 只用于遥测归因，且「Ignored unless it is a slug」；不影响段脚手架本身 |
| `tests/captions-zh.test.mjs` | 官方 skill 存在则不跳过 | 找不到即 skip |

另有两处**陈旧路径**：规则与架构文档把合同文件写在 `skills/hyperframes/references/` 下，而锁定 commit 里它们在 `skills/hyperframes-core/references/`。该错误在本次变更前就已存在——因为 bootstrap 一直拉 main 的实时产物，而 main 上那些文件早已不在。

## 4. 决策

**按锁定 commit 取回官方 skills，不迁移到上游新结构。**

理由：

1. **本仓的合同本来就是锁定的。** AGENTS.md 声明「生产锁定 HyperFrames `v0.8.36` / commit `f86aae6`」，而该 commit 正是上游 tag `v0.8.36`。上游 main 的 skills 是为比 0.8.36 更新的 CLI 准备的，装到锁定 CLI 上属版本错配。
2. **本仓规则逐字引用锁定 commit 的合同原文**（`docs/rules/` 四份文件）。迁移到新结构等于重写整套规则语料，而新结构下字幕运行时已被删除——那会逼迫本仓自建官方已删的运行时，违反「不重造轮子」。
3. **上游变更暴露的是本仓的一个真实缺陷**：bootstrap 声称锁定，实际却拉实时 main。本次修复让声明与实现一致。

## 5. 实施

- `scripts/bootstrap.sh` 改为用 git 按 SHA 取回官方 `skills/` 到 `vendor/skills/`：
  - 外层换传输通路、内层换 ref 形态，四种组合逐一尝试：HTTPS / SSH × 按 SHA / 按 tag。CI runner 无 SSH 密钥但 HTTPS 可用；部分本机环境的 git HTTPS 传输不稳，SSH 更可靠；按 SHA 取回被服务端拒绝时退回按 tag 取回（tag 指向同一 commit）。
  - `--filter=blob:none`：只取 commit 与 tree，blob 在 checkout 时按需拉取。否则一次 fetch 会把整仓该 commit 的全部 blob 传下来，与只取 `skills/` 的需求无关。
  - **每次 fetch 成功后都立刻用 `git rev-parse FETCH_HEAD` 校验**取回的确实是锁定 commit——「fetch 返回 0」不等于「取回了锁定的那一个」。
  - 逐项 fail-closed 校验本仓实际引用的 10 个官方产物；缺失即报错，并指向本文档——**不静默跳过**。
  - 把锁定版本软链到各智能体发现目录（`~/.agents/skills`、`~/.claude/skills`、`~/.config/opencode/skills`），使 agent 读到的合同与本仓规则引用的版本一致；替换既有非软链目录时打印该路径（版本漂移的可追溯痕迹）。
  - **幂等**：vendor 里已锁定在同一 commit 时跳过取回（实测重复运行 17 秒 → 1.0 秒）。发现目录的替换一律用 `ln -sfn` 原地改指向，而非「删除后再建」——软链替换是 O(1)，删除的代价随目录内容量级变化（在带可恢复删除 shim 的环境里，逐项 `rm -rf` 实测达分钟级）；只有目标确实是真实目录时才挪到暂存区、末尾一次性清理。
- `vendor/` 已在 `.gitignore` 中——取回的是上游产物，不入本仓；`vendor/skills/` 恰是 `scripts/captions-zh.mjs` 与 `scripts/inject-audio-meta.mjs` 的**首选**解析路径，无需改动这两个脚本。
- 陈旧路径校正为锁定 commit 下的真实路径：`skills/hyperframes-core/references/{brief-contract,review-loop,storyboard-format,subagent-dispatch,frame-worker-core}.md`。

## 6. 遗留

- 上游 main 仍在演进。若将来决定迁移到「七个知识 skill + Studio」的新结构，那是一次独立的合同审计与规则语料重写，不在本次范围内。
- `hyperframes init --skill=faceless-explainer` 的遥测归因：官方 help 写明该参数「Ignored unless it is a slug」，而 `faceless-explainer` 已不在上游 manifest 中，实际是否仍写入 `hyperframes.json` 需在下一支视频生产时实测。本仓不依赖该字段做任何门禁。
- `sprintf-js` 的 advisory 已于 2026-10-22 被**撤回**，此前记入 CHANGELOG 的「残留告警」表述据此更正。
