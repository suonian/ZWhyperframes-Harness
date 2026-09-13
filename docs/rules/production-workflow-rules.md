# 生产工作流规则

> 本文件是生产流程的唯一所有者：官方 HF Step 0–6 的落点、harness 适配点、用户决策门、强制质量能力清单、交接与问题账本。
> 官方流程细节一律以 `$HYPERFRAMES_REPO/skills/faceless-explainer/SKILL.md` 及其引用（`hyperframes-core` 的 brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core）为唯一真源；本文件只写管理层纪律，不复制官方正文。

## 1. 运行边界

- 每支视频 = 一个项目根（`~/Documents/ZWhyperframes-products/<project_id>/`），内含多个段落子项目（每段一个 HF 项目）。
- 生产锁定 HF `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`；段内 `hyperframes.json` 由官方 `init --skill=faceless-explainer` 产生。
- 锁定口播稿是内容真源；段落 `user_script.txt` 是其冻结片段；MiniMax 语音、词级时间、字幕与 STORYBOARD 通过哈希绑定。已有项目的代码、字幕、视频、分镜与自评都不是输入。
- P0 允许准备：HF checkout、依赖、Chrome、字体、on-device catalog 索引、MiniMax；之后生产期零外部请求（断网可复读）。

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

## 3. 强制质量能力清单（每支视频必须执行，缺一项即门禁失败）

| # | 能力 | 落点 | 门禁方式 |
| --- | --- | --- | --- |
| 1 | pitch-round 创意采样门 | 开案（autonomous 版内部执行） | `gate.mjs` 校验 BRIEF.md 含 `## Intent` 胜出概念 |
| 2 | 官方 frame preset | Step 2 | `frame.md` 存在且来自命名 preset（官方 build-frame 退出 0） |
| 3 | catalog --on-device 语义检索 | Step 4 每帧 | Step 4 复审证据记录查询与 tier |
| 4 | voiceover carve | Step 6（BGM 存在时） | assemble 后、check 前必跑 `carve.mjs` |
| 5 | animation-map | Step 5 每页 | 主审前每页存在 `animation-map.json` |
| 6 | check --strict | Step 6 | 渲染授权前必须带 `--strict` 通过 |
| 7 | keyframes 诊断 | Step 6（有 camera/mask/zoom/转场风险时） | 复审证据 |
| 8 | compare 双机制对比 | Step 4 高风险页 | 双案至少两项真实不同（官方 review-loop 纪律） |
| 9 | preview --context + frame-comments | final look | 用户反馈通道，处置后删除评论文件（官方纪律） |
| 10 | publish 链接 | final look 交付 | 给用户可点击链接（官方预览优先） |
| 11 | recipe freeze | 交付后 | 一次性提议（官方 review-loop §4） |
| 12 | media-treatment | 素材预处理（按需） | 素材冻结仍走 media-use |

## 4. Step 5 子智能体派发纪律（官方 subagent-dispatch + harness 纪律）

- **DISPATCH** = 官方 `_role.md` 全文 + Dispatch context 原文粘贴（不消化、不改写）；每帧恰好一个子智能体，prompt 与磁盘文件是其全部世界。
- **并行**：互不依赖的帧并行派发；并发上限只减并行不减工作——按波次消化全量帧，禁止并帧、漏帧。
- **WAIT** = 产物文件在盘（`compositions/frames/<id>.html`）；缺产物重派一次（同 prompt + 失败信息）再报错。
- **Re-dispatch**：带着 lint/check finding 重派同一帧（worker 自检错误码 = 硬约束）。
- 子智能体返回 ≠ 完成：机器门禁（lint/check/animation-map）+ 主智能体逐页复审通过才标记 `animated`。
- 子智能体绝不读 STORYBOARD.md 全文、不改 Storyboard、不跑 CLI、不碰兄弟页；主智能体是唯一编排者。

## 5. 用户决策门（唯一停顿白名单）

1. 每段「开始授权」（用户确认进入该段生产）
2. 每段「final look 渲染授权」（Studio 链接 + 接触表，用户授权 render）
3. master「final look」（候选预览授权）
4. 全项目「收尾审批」（绑定 exact 候选哈希）

授权记录：轻量文件（actor=user、时间戳、产物 SHA-256），无密码学签名。用户说「继续」= 完成当前授权。文字分镜不送审。

## 6. 交接与问题账本

- 每次换会话：读 `docs/architecture/new-window-handoff.md` + 项目 `state.json`，从磁盘验证当前节点产物哈希后再报告下一步。
- 问题账本 `logs/production-issues.json`（轻量）：阻断/返修/用户修改才记录；同根因合并；修复标记 resolved。不建经验库。
- 段后不返工已渲染段落（除非用户明确要求）。

## 7. 待实测项（第一支视频生产中逐项验证）

MiniMax 注入与官方引擎合并、字幕原生中文效果、sync-durations 与锁稿哈希交互、Studio data-hf-id 注入、caption zone 配置点、BGM 无凭证行为。
