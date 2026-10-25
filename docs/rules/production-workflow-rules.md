# 生产工作流规则

> 本文件是生产流程的唯一所有者：官方 HF Step 0–6 的落点、harness 适配点、用户决策门、强制质量能力清单、交接与问题账本。
> 官方流程细节一律以**锁定 commit**（`v0.8.36` / `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）下的 `skills/faceless-explainer/SKILL.md` 及其引用为唯一真源——由 `scripts/bootstrap.sh` 按该 commit 取回至 `vendor/skills/`，本仓脚本与规则只读这一份。合同文件位于 `skills/hyperframes-core/references/`（brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core），采样门合同位于 `skills/hyperframes/references/pitch-round.md`。本文件只写管理层纪律，不复制官方正文。
>
> 路径经 2026-10-21 上游合同变更审计校正，详见 `docs/architecture/hf-contract-audit-2026-10-21.md`。

## 1. 运行边界

- 每支视频 = 一个项目根（`~/Documents/ZWhyperframes-products/<project_id>/`），内含多个段落子项目（每段一个 HF 项目）。
- 生产锁定 HF `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`；段内 `hyperframes.json` 由官方 `init --skill=faceless-explainer` 产生。
- 锁定口播稿是内容真源；段落 `user_script.txt` 是其冻结片段；MiniMax 语音、词级时间、字幕与 STORYBOARD 通过哈希绑定。已有项目的代码、字幕、视频、分镜与自评都不是输入。
- P0 允许准备：HF checkout、依赖、Chrome、字体、on-device catalog 索引、MiniMax 凭证与全部段 TTS、官方 skills 刷新。**P0 之后脚手架、字幕、装配、check 与渲染可离线完成**；TTS 与 BGM 检索需要联网窗口，或在 P0 预生成全部段语音。这是能力底线，不是网络禁令：按需能力仍可联网，但不得成为生产主链的前置条件。
- **离线底线的强制点**：官方 `hyperframes init` 默认联网 `git clone` skills；段脚手架（`new-video.mjs segment`）以官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 跳过（官方 skills 已由 `bootstrap.sh` 在 P0 刷新）。测试同理（`tests/pipeline-e2e.test.mjs`），另加 120s spawnSync 超时兜底。TTS/BGM 的联网依赖见上一行的适用范围。
- 网络策略（npm 中国大陆镜像 / GitHub 代理 `127.0.0.1:7890` 可达才启用 / MiniMax 直连豁免）由 `scripts/net-env.sh` 单点提供；代理不可达时自动直连，不得让静默挂死拖垮生产。

## 2. 流程与落点（官方 Step 0–6 + harness 适配）

| 阶段 | 官方做什么 | harness 适配 |
| --- | --- | --- |
| 开案 | `/hyperframes` 意图层：pitch-round 采样门 → BRIEF.md（每段项目内） | `new-video.mjs`：锁稿冻结、分段计划、逐段 init；`flow: automation`、`storyboard: no`（autonomous）；`gate.mjs pitch-round --segment` 优先读段内 BRIEF，回退项目根 |
| Step 0–2 | Step 0 init → Step 1 brief（faceless 无 capture）→ Step 2 官方 preset 选择 → `build-frame.mjs --preset` → frame.md + caption skin | 无（官方机制）；BRIEF.md 在 init 之后写入 |
| Step 3 | STORYBOARD.md / SCRIPT.md（按锁稿逐字） | 段内叙事复审（主智能体自审，从磁盘重读） |
| Step 3.1 | 音频引擎 BGM | `minimax-tts.mjs` 生成语音+词级时间 → `inject-audio-meta.mjs` 写官方 `audio_meta.json`（voices.words 帧相对）；官方引擎 `--only bgm` |
| Step 4 | catalog 检索 → blueprint/compose + time-coded Scenes + Video direction | 强制 `--on-device` 语义检索；高风险页双机制 compare |
| Step 5 | packet builder → 子智能体逐帧实现 → lint/check 复核 | 派发纪律见 §4；每个 composition 一份 animation-map（默认段内单文件；逐页需 `--out` 并在 state/receipt 登记） |
| Step 6 | fetch-sfx / captions / assemble / transitions / carve / check / snapshot / Studio | final look 授权（用户；`state approve` 内部先跑 `gate preflight`）→ **停掉 Studio preview 并重跑字幕/装配/转场/preflight** → 官方 render → `gate.mjs render-ready` 复核渲染输入 → `set-mp4`（内部再复核一次）→ `gate.mjs mp4` 校验 |
| 段间 | — | 下一段开始授权同时确认上一段（MP4 SHA-256 绑定） |
| master | — | `finalize-master.mjs`（thin ffmpeg concat，仅用已确认段 MP4）→ master final look（用户）→ `state master --kind close` 生成 `99-最终合成/renders/final.mp4` + `final-render.json` → `gate.mjs final-delivery` → 收尾审批 |
| 交付 | publish / recipe | 交付说明 + recipe freeze 提议 |

## 3. 强制质量能力清单

**强制分三层，不可混为一谈。** 本仓的机器门禁只能覆盖第一层——除非某项官方能力留下可校验的产物，否则门禁无法证明智能体「真的执行过」它。把「写在规则里」当成「已经强制」，正是本项目要消灭的病。

### 3.1 本仓机器门禁（缺一项即 fail-closed）

| # | 能力 | 门禁命令 | 校验的产物 |
| --- | --- | --- | --- |
| 1 | pitch-round 创意采样门 | `gate.mjs pitch-round` | 项目根或段内 `BRIEF.md` 的 `## Intent` 非空（`--segment` 优先段内） |
| 5 | animation-map | `gate.mjs animation-map` | 段内 `.hyperframes/anim-map/animation-map.json` 存在且为非空 JSON |
| 6 | check --strict | 内建于 `gate.mjs final-look` / `gate preflight` | `state approve final-look` 先跑 preflight（verify/captions/animation-map/layout/check/frame-check），授权记录绑定 receipt；**不可先授权后补 check** |
| 7 | final delivery | `gate.mjs final-delivery` | close 后 `renders/final.mp4` 存在，且 SHA-256 与 candidate 完全相同 |

### 3.2 官方 CLI 命令（须真实执行；退出码即证据）

官方 CLI 有对应命令，本仓不重复实现，只保证其退出码被真实读取。**执行与否依赖流程与复审证据，本仓无机器门禁。**

| # | 能力 | 官方命令 / 产物 |
| --- | --- | --- |
| 2 | 官方 frame preset | `build-frame.mjs --preset` 生成的 `frame.md`（Step 2） |
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

### 3.4 渲染输入完整性（不是 12 项能力之一，但同属本仓机器门禁）

`preflight` 只在**授权那一刻**跑一次，而渲染发生在授权**之后**。中间任何一次改写——官方 Studio preview 会在运行时重写 `compositions/captions.html` 与 `index.html`——都会让渲染用的字节 ≠ 验证过的字节，而当时没有任何机器检查会拦。

因此 `gate.mjs render-ready` 存在：拿 final-look receipt 重算盘上产物，逐项比对**渲染真正读取的每一个字节**——帧集合、`index.html`、字幕、音频元数据，以及逐帧读取的 `assets/voice/*.wav` 与 `assets/fonts/*.woff2`（这两类文件不进任何单文件绑定，此前完全在门禁视野之外）。任何一项漂移即 fail-closed。

`state.mjs set-mp4` 内部调用它：绑定是渲染后的第一道机器检查，**漂移的渲染进不了 master 链条**。receipt v3 起才有完整的资产目录绑定（语音/字体/BGM/音效）；v1/v2 receipt 会被明确拒绝并要求重跑 preflight（这是实话，不是故障）。

目录型绑定（`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/`）记的是**目录内全部文件的聚合摘要**（除 OS 噪音文件）。某段本来就没有本地字体时，receipt 把该目录记为 `null`——这不是缺陷，复核也不因此判漂移：**preflight 当时不存在 ⇒ 现在也不该存在**，只有凭空多出目录/文件才算漂移（那意味着渲染会多读一批没被验证过的字节）。

存量项目不受影响：`render-ready` 只在 `set-mp4` 触发，已绑定 MP4 的段落与已收尾的项目无需回补 receipt；只有**重新绑定**（返工重渲）时才需要重跑 preflight 并重新取得授权。

对应纪律：**渲染前必须停掉 Studio preview**，停了之后重跑字幕 → 装配 → 转场 → preflight → 重新授权 → 渲染 → `set-mp4`。官方 Studio 预览链接给用户看时，要么在停掉 preview 之后给，要么明确告知「预览会改写产物，渲染前会重跑一遍」。

## 4. Step 5 子智能体派发纪律（官方 subagent-dispatch + harness 纪律）

- **DISPATCH** = 官方 `_role.md` 全文 + Dispatch context 原文粘贴（不消化、不改写）；每帧恰好一个子智能体，prompt 与磁盘文件是其全部世界。
- **并行**：互不依赖的帧并行派发；并发上限只减并行不减工作——按波次消化全量帧，禁止并帧、漏帧。
- **WAIT** = 产物文件在盘（`compositions/frames/<id>.html`）；缺产物重派一次（同 prompt + 失败信息）再报错。
- **Re-dispatch**：带着 lint/check finding 重派同一帧（worker 自检错误码 = 硬约束）。
- 子智能体返回 ≠ 完成：机器门禁（lint/check/animation-map）+ 主智能体逐页复审通过才标记 `animated`。
- **编排者必须按跨段连续性规格复核 worker 的实现，不只信它的回报**。lint 与 check 只能证明「这一帧自洽」，证明不了「这一帧与上一段/下一帧说的是同一件事」——量表口径、角度基准、读数链条、同名母题的规格一致性，机器门禁看不见，而它们恰恰是**把论点讲反**的入口。派发上下文里必须写死这些跨帧规格（口径值、方向、读数链条、禁写实清单），编排者逐帧对照复核；发现不一致就地修正再进渲染。**先落盘、再推演**：worker 的推演若崩在一次长回合里就没了，关键决策必须写进文件而不是留在 thinking 里。
- **跨帧共享的规格必须写成单一权威数值，且带单位换算，不得同时出现两种表述**。实测事故：STORYBOARD 写「`border: 0.4cqw solid {colors.ink}`（**4px** 墨黑描边）」——`0.4cqw` 在 1920px 画布上是 **7.68px**，不是 4px。两种表述并存时，实现者必然二选一：同一台表于是出现了 4px 与 7.68px 两种描边。**规格自相矛盾 = 把选择丢给实现者 = 跨帧不一致的根因**。写法：给一个权威值（`border: 4px solid`）＋换算依据（画布宽度 1920px 时 `0.4cqw = 7.68px`），让派发上下文里的每个 worker 都读到同一个数。
- **缩放版不等于同款**：把一件道具缩小放到画面另一处时，**几何必须按同一比例缩放**（描边、指针、轴帽、附属读数窗一起缩），否则观众认不出是同一件道具——这会直接掏空「同一台表 → 同一读数」的论证。缩小版的差异只能是**设计允许的差异**（如减少刻度、去掉装饰），且必须写进规格让观众能接受；未写进规格的走样就是缺陷。
- 子智能体绝不读 STORYBOARD.md 全文、不改 Storyboard、不跑 CLI、不碰兄弟页；主智能体是唯一编排者。

## 5. 用户决策门（唯一停顿白名单）

1. 每段「开始授权」（用户确认进入该段生产；**同时确认上一段**——上一段必须已有 MP4 与 final look 授权，由 `state.mjs` 机械执行）
2. 每段「final look 渲染授权」（Studio 链接 + 接触表，用户授权 render）
3. master「final look」（候选预览授权；**同时确认末段**）
4. 全项目「收尾审批」（绑定 exact 候选哈希）

授权记录：轻量文件（actor=user、时间戳、evidence）；段 final-look 另绑 `gate receipt` 的 SHA-256，master final-look/close 另绑 candidate 的 SHA-256；无密码学签名。用户说「继续」= 完成当前授权。文字分镜不送审。

段状态机（`state.json`，唯一真源）：`planned → authorized（开始授权）→ rendered（set-mp4 绑定）→ accepted（下一段开始授权或 master final look 机械确认）`。

## 6. 交接与问题账本

- 每次换会话：读 `docs/architecture/new-window-handoff.md` + 项目 `state.json`，从磁盘验证当前节点产物哈希后再报告下一步。
- 问题账本 `logs/production-issues.json`（轻量）：阻断/返修/用户修改才记录；同根因合并；修复标记 resolved。不建经验库。
- 段后不返工已渲染段落（除非用户明确要求）。

## 7. 待实测项（第一支视频生产中逐项验证）

MiniMax 注入与官方引擎合并、字幕原生中文效果、sync-durations 与锁稿哈希交互、Studio data-hf-id 注入、caption zone 配置点、BGM 无凭证行为。
