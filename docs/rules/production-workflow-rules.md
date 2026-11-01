# 生产工作流规则

> 本文件是生产流程的唯一所有者：官方 HF Step 0–6 的落点、harness 适配点、用户决策门、强制质量能力清单、交接与问题账本。
> 官方流程细节一律以**锁定 commit**（`v0.8.36` / `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）下的 `skills/faceless-explainer/SKILL.md` 及其引用为唯一真源——由 `scripts/bootstrap.sh` 按该 commit 取回至 `vendor/skills/`，本仓脚本与规则只读这一份。合同文件位于 `skills/hyperframes-core/references/`（brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core），采样门合同位于 `skills/hyperframes/references/pitch-round.md`。本文件只写管理层纪律，不复制官方正文。
>
> 路径经 2026-10-21 上游合同变更审计校正，详见 `docs/architecture/hf-contract-audit-2026-10-21.md`。

## 1. 运行边界

- 每支视频 = 一个项目根（`~/Documents/ZWhyperframes-products/<project_id>/`），内含多个段落子项目（每段一个 HF 项目）。生产锁定 HF `v0.8.36` / commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`；段内 `hyperframes.json` 由官方 `init --skill=faceless-explainer` 产生。
- 锁定口播稿是内容真源；段落 `user_script.txt` 是其冻结片段；MiniMax 语音、词级时间、字幕与 STORYBOARD 通过哈希绑定。已有项目的代码、字幕、视频、分镜与自评都不是输入。
- P0 允许准备：HF checkout、依赖、Chrome、字体、on-device catalog 索引、MiniMax 凭证与全部段 TTS、官方 skills 刷新。**P0 之后脚手架、字幕、装配、check 与渲染可离线完成**；TTS 与 BGM 检索需要联网窗口，或在 P0 预生成全部段语音。这是能力底线，不是网络禁令：按需能力仍可联网，但不得成为生产主链的前置条件。**强制点**：官方 `hyperframes init` 默认联网 `git clone` skills，段脚手架以官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 跳过（官方 skills 已由 `bootstrap.sh` 在 P0 刷新）；测试同理，另加 120s spawnSync 超时兜底。
- 网络策略（npm 中国大陆镜像 / GitHub 代理 `127.0.0.1:7890` 可达才启用 / MiniMax 直连豁免）由 `scripts/net-env.sh` 单点提供；代理不可达时自动直连，不得让静默挂死拖垮生产。

## 2. 流程与落点（官方 Step 0–6 + harness 适配）

| 阶段 | 官方做什么 | harness 适配 |
| --- | --- | --- |
| 开案 | `/hyperframes` 意图层：pitch-round 采样门 → BRIEF.md（每段项目内） | `new-video.mjs`：锁稿冻结、分段计划、逐段 init；`flow: automation`、`storyboard: no`（autonomous）；`gate.mjs pitch-round --segment` 优先读段内 BRIEF，回退项目根 |
| Step 0–2 | Step 0 init → Step 1 brief（faceless 无 capture）→ Step 2 官方 preset 选择 → `build-frame.mjs --preset` → frame.md + caption skin | 官方机制本身不动；**本项目默认 preset 与调色板口径见 `docs/rules/visual-baseline.md`**（默认 `capsule`，偏好非排他）。可选官方 `recipe.mjs use` 直接复用已批准项目的 frame.md（跳过 Step 2） |
| Step 3 | STORYBOARD.md / SCRIPT.md（按锁稿逐字） | 段内叙事复审（主智能体自审，从磁盘重读） |
| Step 3.1 | 音频引擎 BGM | `minimax-tts.mjs` 生成语音+词级时间 → `inject-audio-meta.mjs` 写官方 `audio_meta.json`（voices.words 帧相对） |
| Step 4 | catalog 检索 → blueprint/compose + time-coded Scenes + Video direction | 强制 `--on-device` 语义检索 |
| Step 5 | packet builder → 子智能体逐帧实现 → lint/check 复核 | 派发纪律见 §4；每个 composition 一份 animation-map（默认段内单文件） |
| Step 6 | fetch-sfx / captions / assemble / transitions / carve / check / snapshot / Studio | final look 授权（用户；`state approve` 内部先跑 `gate preflight`）→ **停掉 Studio preview 并重跑字幕/装配/转场/preflight** → 官方 render → `gate.mjs render-ready` 复核 → `set-mp4`（内部再复核）→ `gate.mjs mp4` 校验 |
| 段间 | — | 下一段开始授权同时确认上一段（MP4 SHA-256 绑定） |
| master | — | `finalize-master.mjs`（thin ffmpeg concat，仅用已确认段 MP4）→ master final look（用户）→ `state master --kind close` 生成 `99-最终合成/renders/final.mp4` + `final-render.json` → `gate.mjs final-delivery` → 收尾审批 |
| 交付 | publish / recipe | 交付说明 + recipe freeze 提议 |

## 3. 强制质量能力清单

**强制分三层，不可混为一谈。** 本仓的机器门禁只能覆盖第一层——除非某项官方能力留下可校验的产物，否则门禁无法证明智能体「真的执行过」它。把「写在规则里」当成「已经强制」，正是本项目要消灭的病。

### 3.1 本仓机器门禁（缺一项即 fail-closed）

| # | 能力 | 门禁命令 | 校验的产物 |
| --- | --- | --- | --- |
| 1 | pitch-round 创意采样门 | `gate.mjs pitch-round` | 项目根或段内 `BRIEF.md` 的 `## Intent` 非空（`--segment` 优先段内） |
| 2 | animation-map | `gate.mjs animation-map` | 段内 `.hyperframes/anim-map/animation-map.json` 存在，且**内容**通过断言（死区 / 退化补间阻断，offscreen / 节奏类 flag 告警）——只验「存在且非空」等于把官方算出的结论全丢掉 |
| 3 | check --strict | 内建于 `gate.mjs final-look` / `gate preflight` | `state approve final-look` 先跑 preflight（verify/captions/animation-map/layout/motion-spec/check/frame-check），授权记录绑定 receipt；**不可先授权后补 check**。check 走 `--json` 信封并**逐条归因**（元素 / 时间点 / 源文件 / 修法），不只看退出码 |
| 4 | final delivery | `gate.mjs final-delivery` | close 后 `renders/final.mp4` 存在，且 SHA-256 与 candidate 完全相同 |
| 5 | 视觉基线（色板 / 字号 / 音色）**〔非官方 13 项之一〕** | `gate.mjs baseline` | 帧内颜色不越出 `frame.md` 的 `colors:` 声明（按 RGB 比）；帧内字号达标（官方 chrome 令牌豁免）；`frame.md` 承载性 px 令牌 ≥28px；段内 TTS manifest 的 `voice_profile` 与真源一致。官方 `check` 只做 WCAG 对比度、**不查色板归属也不查字号下限**——这是官方不覆盖处 |

### 3.2 官方 CLI 命令（须真实执行；退出码即证据）

官方 CLI 有对应命令，本仓不重复实现，只保证其退出码被真实读取。**执行与否依赖流程与复审证据，本仓无机器门禁。**

| # | 能力 | 官方命令 / 产物 |
| --- | --- | --- |
| 5 | 官方 frame preset | `build-frame.mjs --preset` 生成的 `frame.md`（Step 2） |
| 6 | catalog --on-device 语义检索 | `hyperframes catalog` |
| 7 | voiceover carve（BGM 存在时） | 官方 `skills/hyperframes-audio/scripts/carve.mjs` |
| 8 | keyframes 诊断（有 camera/mask/zoom/转场风险时） | `hyperframes keyframes` |
| 9 | compare 双机制对比（高风险页） | `hyperframes compare` |
| 10 | publish 链接 | `hyperframes publish` |

### 3.3 流程 / 复审证据（本仓不设机器门禁）

| # | 能力 | 证据形式 |
| --- | --- | --- |
| 11 | preview --context + frame-comments | 复审处置记录；处置后删除评论文件（官方纪律） |
| 12 | recipe freeze | 交付后一次性提议（官方 review-loop §4） |
| 13 | media-treatment | 按需命中才执行；素材冻结仍走 media-use |

> **诚实声明**：3.1 与 3.2/3.3 的归属——3.1 现为 **5 项**有机器门禁，3.2 与 3.3 合计 9 项**没有**机器门禁（它们靠流程与复审约束），不满足「不跑就卡住」。任何声称本仓对全部 13 项 fail-closed 的表述都是错的。新增能力时，必须先确定它属于哪一层——落不进 3.1 的，就别在别处宣称它被强制了。
>
> 编号说明：本表曾经出现两个 `#7`（`final delivery` 与 `keyframes 诊断`），且三张表合计 13 行却称 12 项。现已按阅读顺序重编为 **1–13**，每项唯一。
>
> 3.1 的第 5 项「视觉基线」是**后加**的：它不属官方 13 项能力清单，而是官方不覆盖处的项目级门禁（官方 `check` 不查色板归属、不查字号下限、不查音色一致性）。它的规则口径由 `docs/rules/visual-baseline.md` 单独所有。

### 3.4 渲染输入完整性（不是 13 项能力之一，但同属本仓机器门禁）

`preflight` 只在**授权那一刻**跑一次，而渲染发生在授权**之后**。中间任何一次改写——官方 Studio preview 会在运行时重写 `compositions/captions.html` 与 `index.html`——都会让渲染用的字节 ≠ 验证过的字节，而当时没有任何机器检查会拦。

因此 `gate.mjs render-ready` 存在：拿 final-look receipt 重算盘上产物，逐项比对**渲染真正读取的每一个字节**——帧集合、`index.html`、字幕、音频元数据，以及逐帧读取的 `assets/voice/*.wav` 与 `assets/fonts/*.woff2`（这两类文件不进任何单文件绑定，此前完全在门禁视野之外）。任何一项漂移即 fail-closed。

`state.mjs set-mp4` 内部调用它：绑定是渲染后的第一道机器检查，**漂移的渲染进不了 master 链条**。receipt v3 起才有完整的资产目录绑定（语音/字体/BGM/音效）；v1/v2 receipt 会被明确拒绝并要求重跑 preflight（这是实话，不是故障）。

目录型绑定（`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/`）记的是**目录内全部文件的聚合摘要**（除 OS 噪音文件）。某段本来就没有本地字体时 receipt 记为 `null`——这不是缺陷，复核也不因此判漂移：**preflight 当时不存在 ⇒ 现在也不该存在**，只有凭空多出才算漂移（那意味着渲染会多读一批没被验证过的字节）。存量项目不受影响：`render-ready` 只在 `set-mp4` 触发，只有**重新绑定**（返工重渲）时才需重跑 preflight 并重新授权。

对应纪律：**渲染前必须停掉 Studio preview**，停了之后重跑字幕 → 装配 → 转场 → preflight → 重新授权 → 渲染 → `set-mp4`。官方 Studio 预览链接给用户看时，要么在停掉 preview 之后给，要么明确告知「预览会改写产物，渲染前会重跑一遍」。

### 3.5 成片内容门禁（不是 13 项能力之一，但同属本仓机器门禁）

§3.4 管的是「渲染**输入**没被偷换」。这一节管的是「渲染**输出**是不是一部片」。

**实测事故（2026-10-31）**：交付片黑屏无声——MP4 只有视频轨、`index.html` 的 clip 数为 **0**、语音文件在但无人引用。根因是跳过 Step 2–5 直接渲染官方 `init` 的空壳；而当时 §3.1 的门禁**一条都拦不住**（存在、非空、哈希正常、时长也对得上）。

因此新增 `scripts/lib/media-probe.mjs`，把成片的三件事读成机器可判定的事实（**只读数，不做判断**）：

| 事实 | 探针 | 判据 |
| --- | --- | --- |
| 轨道结构 | `ffprobe -show_streams -of json` | 视频轨 ≥ 1 **且** 音频轨 ≥ 1 |
| 音频响度 | `ffmpeg -af volumedetect` | `mean_volume > -60 dB`（数字静音实测 −91.0 dB；正常口播 −30 ~ −20 dB） |
| 黑帧区间 | `ffmpeg -vf blackdetect=d=1.0:pix_th=0.10` | 无持续 ≥1.0s 的整片全黑区间 |

三条都是 **fail-closed**：任一不满足即拒绝。

- `gate.mjs mp4` —— 复核段 MP4 时追加这三项。
- `state.mjs set-mp4` —— **绑定时**就查。黑屏片进不了 master 链条，这是第一道拦。

阈值取「宁可放过、绝不放过空壳」的一侧：−60 dB 留了 30 dB 余量，不会误伤正常段；黑帧按**持续时长**而不是「有没有」判，短促的一帧黑场不算故障。

**诚实声明**：这条门禁只证明「成片有画面、不是全黑、有声音、不是静音」，**不证明**画面内容对不对、字幕对不对、语音与画面是否对得上——那些属于 §3.3 的复审证据，机器看不见。

### 3.6 成片视觉质量门禁（不是 13 项能力之一，但同属本仓机器门禁）

§3.5 管「有声有色」，这一节管「画面好不好看」：规则书 19 条视觉要求中，决定观感的那几条此前一条门禁都没有——实测已交付成片首帧近乎纯色（非背景像素 0.000%）而门禁全绿。门禁只验形式、不验内容。

本节补三道门，全部复用官方能力 + 补件，不自造渲染器：

| 门禁 | 命令 | 判据 | 依据 |
| --- | --- | --- | --- |
| **官方运动校验**（启用） | `gate.mjs motion-spec` → `gate.mjs check` | 生成官方 `*.motion.json` sidecar，让官方 motion 阶段**真的跑起来**（此前恒为 `enabled:false`，零覆盖）；断言 hero 早可见（t≤0.5s）、跨帧顺序、主体不出画 | 规则书 §1 官方合同摘要 |
| **animation-map 内容断言** | `gate.mjs animation-map` | 死区（≥1s 无补间）、退化补间（`degenerate`）、不可见补间（`invisible`）→ **阻断**；`offscreen` / 节奏类 flag / stagger 不一致 → **告警** | 规则书 §1 全时长揭示 |
| **成片像素级质检** | `gate.mjs quality` | 首帧可辨认度（非背景像素 ≥0.5%、唯一色 ≥3）、每个 Scene 区间内必须有画面变化（末帧末段除外） | 规则书 §2 首帧规则、§1 禁 front-load |

配套纪律：

- **hero 声明是硬要求**：帧 HTML 里主体元素必须带 `data-motion-role="hero"`。没有它，「hero 早可见」就无法机器校验——`gate.mjs motion-spec` **fail-closed**（不猜、不跳过）。猜错等于把这条检查变成恒绿。
- **check 走 `--json` 并逐条归因**：官方信封里每条 finding 都带 selector / 时间点 / 源文件 / fixHint。只看退出码等于把官方最值钱的部分扔掉。
- **覆盖率必须透明**：若 `motion.enabled=false`（motion 阶段没跑），`gate.mjs check` **直接判失败**——不能让「全绿」看起来像「运动也验过了」。
- **新门禁必须做判别力双对照**：「空壳片必 FAIL」＋「已知合格片必 PASS」双对照，缺一不合并。否则它可能恒绿，而恒绿比没有门禁更坏。

**诚实声明**：「帧级静止占比 / 末尾死区 / front-load」三条依赖主观基线，当前只**告警并打印数值**；首帧可辨认度与 Scene 变化有规则书明文依据，**阻断**。升级告警项须同步本节与 CHANGELOG。

## 4. Step 5 子智能体派发纪律（官方 subagent-dispatch + harness 纪律）

- **DISPATCH** = 官方 `_role.md` 全文 + Dispatch context 原文粘贴（不消化、不改写）；每帧恰好一个子智能体，prompt 与磁盘文件是其全部世界。
- **并行**：互不依赖的帧并行派发；并发上限只减并行不减工作——按波次消化全量帧，禁止并帧、漏帧。
- **WAIT** = 产物文件在盘（`compositions/frames/<id>.html`）；缺产物重派一次（同 prompt + 失败信息）再报错。
- **Re-dispatch**：带着 lint/check finding 重派同一帧（worker 自检错误码 = 硬约束）。
- 子智能体返回 ≠ 完成：机器门禁（lint/check/animation-map）+ 主智能体逐页复审通过才标记 `animated`。
- **编排者必须按跨段连续性规格复核 worker 的实现，不只信它的回报**。lint 与 check 只能证明「这一帧自洽」，证明不了「这一帧与上一段/下一帧说的是同一件事」——量表口径、角度基准、读数链条、同名母题的规格一致性，机器门禁看不见，而它们恰恰是**把论点讲反**的入口。派发上下文里必须写死这些跨帧规格，编排者逐帧对照复核；发现不一致就地修正再进渲染。**先落盘、再推演**：worker 的推演若崩在一次长回合里就没了，关键决策必须写进文件而不是留在 thinking 里。
- **跨帧共享的规格必须写成单一权威数值，且带单位换算，不得同时出现两种表述**。实测事故：STORYBOARD 写「`border: 0.4cqw solid {colors.ink}`（**4px** 墨黑描边）」，而 `0.4cqw` 在 1920px 画布上是 **7.68px**——两种表述并存时实现者必然二选一，同一台表于是出现了 4px 与 7.68px 两种描边。**规格自相矛盾 = 把选择丢给实现者 = 跨帧不一致的根因**。写法：给一个权威值（`border: 4px solid`）＋换算依据，让每个 worker 都读到同一个数。
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
