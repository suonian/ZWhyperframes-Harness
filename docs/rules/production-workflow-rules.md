# 生产工作流规则

> 本文件是生产流程的唯一所有者：官方 HF Step 0–6 的落点、harness 适配点、用户决策门、强制质量能力清单、交接与问题账本。
> 官方流程细节一律以 `$HYPERFRAMES_REPO/skills/faceless-explainer/SKILL.md` 及其引用（`skills/hyperframes/references/` 下的 brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core）为唯一真源；本文件只写管理层纪律，不复制官方正文。

## 1. 运行边界

- 每支视频 = 一个项目根（`~/Documents/ZWhyperframes-products/<project_id>/`），内含多个段落子项目（每段一个 HF 项目）。
- 生产锁定 HF `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`；段内 `hyperframes.json` 由官方 `init --skill=faceless-explainer` 产生。
- 锁定口播稿是内容真源；段落 `user_script.txt` 是其冻结片段；MiniMax 语音、词级时间、字幕与 STORYBOARD 通过哈希绑定。已有项目的代码、字幕、视频、分镜与自评都不是输入。
- P0 允许准备：HF checkout、依赖、Chrome、字体、on-device catalog 索引、MiniMax、官方 skills 刷新。**P0 之后生产中途不联网也必须能跑完全片**——这是能力底线，不是网络禁令：按需能力仍可联网，但不得成为生产主链的前置条件。
- **离线底线的唯一强制点**：官方 `hyperframes init` 默认联网 `git clone` skills，这是段脚手架里唯一的隐藏联网依赖。段脚手架（`new-video.mjs segment`）以官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 跳过（官方 skills 已由 `bootstrap.sh` 在 P0 刷新）。测试同理（`tests/pipeline-e2e.test.mjs`），另加 120s spawnSync 超时兜底，确保 `npm test` 永不挂死。
- 网络策略（npm 中国大陆镜像 / GitHub 代理 `127.0.0.1:7890` 可达才启用 / MiniMax 直连豁免）由 `scripts/net-env.sh` 单点提供；代理不可达时自动直连，不得让静默挂死拖垮生产。

## 2. 流程与落点（官方 Step 0–6 + harness 适配）

| 阶段 | 官方做什么 | harness 适配 |
| --- | --- | --- |
| 开案 | `/hyperframes` 意图层：pitch-round 采样门 → BRIEF.md | `new-video.mjs`：锁稿冻结、分段计划、逐段 init；`flow: automation`、`storyboard: no`（autonomous） |
| Step 0–2 | init、capture、官方 preset 选择 → `build-frame.mjs` → frame.md + caption skin | 无（官方机制） |
| Step 3 | STORYBOARD.md / SCRIPT.md（按锁稿逐字） | 段内叙事复审（主智能体自审，从磁盘重读） |
| Step 3.1 | 音频引擎 BGM | `minimax-tts.mjs` 生成语音+词级时间 → `inject-audio-meta.mjs` 写官方 `audio_meta.json`（voices.words 帧相对）；官方引擎 `--only bgm` |
| Step 4 | catalog 检索 → blueprint/compose + time-coded Scenes + Video direction | 强制 `--on-device` 语义检索；高风险页双机制 compare |
| Step 5 | packet builder → 子智能体逐帧实现 → lint/check 复核 | 派发纪律见 §4；每页 animation-map 供主审 |
| Step 6 | fetch-sfx / captions / assemble / transitions / carve / check / snapshot / Studio | final look 授权（用户）→ 官方 render → `gate.mjs` 段 MP4 校验 |
| 段间 | — | 下一段开始授权同时确认上一段（MP4 SHA-256 绑定） |
| master | — | `finalize-master.mjs`（thin ffmpeg concat，仅用已确认段 MP4）→ master final look（用户）→ 收尾审批 |
| 交付 | publish / recipe | 交付说明 + recipe freeze 提议 |

## 3. 强制质量能力清单

**强制分三层，不可混为一谈。** 本仓的机器门禁只能覆盖第一层——除非某项官方能力留下可校验的产物，否则门禁无法证明智能体「真的执行过」它。把「写在规则里」当成「已经强制」，正是本项目要消灭的病。

### 3.1 本仓机器门禁（缺一项即 fail-closed）

| # | 能力 | 门禁命令 | 校验的产物 |
| --- | --- | --- | --- |
| 1 | pitch-round 创意采样门 | `gate.mjs pitch-round` | 项目根 `BRIEF.md` 的 `## Intent` 非空 |
| 5 | animation-map | `gate.mjs animation-map` | 段内 `.hyperframes/anim-map/animation-map.json` 存在 |
| 6 | check --strict | 内建于 `gate.mjs final-look` | 官方 `check --strict` 退出码；**渲染授权不可绕过** |

### 3.2 官方 CLI 命令（须真实执行；退出码即证据）

官方 CLI 有对应命令，本仓不重复实现，只保证其退出码被真实读取。**执行与否依赖流程与复审证据，本仓无机器门禁。**

| # | 能力 | 官方命令 / 产物 |
| --- | --- | --- |
| 2 | 官方 frame preset | `hyperframes init` 落地的 `frame.md`（命中命名 preset） |
| 3 | catalog --on-device 语义检索 | `hyperframes catalog` |
| 4 | voiceover carve（BGM 存在时） | 官方 `skills/hyperframes-audio/scripts/carve.mjs` |
| 7 | keyframes 诊断（有 camera/mask/zoom/转场风险时） | `hyperframes keyframes` |
| 8 | compare 双机制对比（高风险页） | `hyperframes compare` |
| 10 | publish 链接 | `hyperframes publish` |

### 3.3 流程 / 复审证据（本仓不设机器门禁）

| # | 能力 | 证据形式 |
| --- | --- | --- |
| 9 | preview --context + frame-comments | 复审处置记录；处置后删除评论文件（官方纪律） |
| 11 | recipe freeze | 交付后一次性提议（官方 review-loop §4） |
| 12 | media-treatment | 按需命中才执行；素材冻结仍走 media-use |

> **诚实声明**：3.2 与 3.3 合计 9 项，本仓**没有**机器门禁，它们靠流程与复审约束，不满足「不跑就卡住」。任何声称本仓对全部 12 项 fail-closed 的表述都是错的。新增能力时，必须先确定它属于哪一层——落不进 3.1 的，就别在别处宣称它被强制了。

## 4. Step 5 子智能体派发纪律（官方 subagent-dispatch + harness 纪律）

- **DISPATCH** = 官方 `_role.md` 全文 + Dispatch context 原文粘贴（不消化、不改写）；每帧恰好一个子智能体，prompt 与磁盘文件是其全部世界。
- **并行**：互不依赖的帧并行派发；并发上限只减并行不减工作——按波次消化全量帧，禁止并帧、漏帧。
- **WAIT** = 产物文件在盘（`compositions/frames/<id>.html`）；缺产物重派一次（同 prompt + 失败信息）再报错。
- **Re-dispatch**：带着 lint/check finding 重派同一帧（worker 自检错误码 = 硬约束）。
- 子智能体返回 ≠ 完成：机器门禁（lint/check/animation-map）+ 主智能体逐页复审通过才标记 `animated`。
- 子智能体绝不读 STORYBOARD.md 全文、不改 Storyboard、不跑 CLI、不碰兄弟页；主智能体是唯一编排者。

## 5. 用户决策门（唯一停顿白名单）

1. 每段「开始授权」（用户确认进入该段生产；**同时确认上一段**——上一段必须已有 MP4 与 final look 授权，由 `state.mjs` 机械执行）
2. 每段「final look 渲染授权」（Studio 链接 + 接触表，用户授权 render）
3. master「final look」（候选预览授权；**同时确认末段**）
4. 全项目「收尾审批」（绑定 exact 候选哈希）

授权记录：轻量文件（actor=user、时间戳、产物 SHA-256），无密码学签名。用户说「继续」= 完成当前授权。文字分镜不送审。

段状态机（`state.json`，唯一真源）：`planned → authorized（开始授权）→ rendered（set-mp4 绑定）→ accepted（下一段开始授权或 master final look 机械确认）`。

## 6. 交接与问题账本

- 每次换会话：读 `docs/architecture/new-window-handoff.md` + 项目 `state.json`，从磁盘验证当前节点产物哈希后再报告下一步。
- 问题账本 `logs/production-issues.json`（轻量）：阻断/返修/用户修改才记录；同根因合并；修复标记 resolved。不建经验库。
- 段后不返工已渲染段落（除非用户明确要求）。

## 7. 待实测项（第一支视频生产中逐项验证）

MiniMax 注入与官方引擎合并、字幕原生中文效果、sync-durations 与锁稿哈希交互、Studio data-hf-id 注入、caption zone 配置点、BGM 无凭证行为。
