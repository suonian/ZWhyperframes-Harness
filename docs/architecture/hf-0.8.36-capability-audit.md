# HyperFrames v0.8.36 能力审计（Phase 0）

> 2026-09-13，基于 v0.8.36 tag（commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）源码只读审计。
> 目的：确定前代自建系统（HF 0.7.88 时代）各依赖点在 0.8.36 的对应物、差异与风险，作为本 harness 设计的事实依据。

## 1. 核心结论

**HF 0.8.36 已原生采用「单智能体 + 每帧一个子智能体」模型**——前代自建的 Claude Code CLI Worker 层（claude-runtime、transcript 证据、三槽队列、心跳/lease、fallback 通道）存在的理由已经消失：

- `faceless-explainer` Step 5 官方合同：orchestrator 自己完成除 Step 5 外的一切；Step 5 **每帧派发一个子智能体**（"dispatch one sub-agent per frame"）
- `hyperframes-core/references/subagent-dispatch.md` 把 DISPATCH / Parallel fan-out / WAIT / Re-dispatch 映射到任意 harness 原语，**明确平台无关**
- 官方 packet builder 产出**有界 packet**（仅本帧 storyboard 块 + blueprint 正文 + 引用规则配方）+ `_role.md`（frame-worker-core + 工作流 delta），子智能体只读 packet + `frame.md`
- WAIT 判据 = 产物文件在盘存在（`compositions/frames/NN-*.html`），不是 harness 完成通知；缺产物重派一次
- Worker 自检清单内置 lint 错误码（`missing_template_wrapper`、`subcomposition_root_styled_by_class`、`clip_missing_data_attrs`、`timeline_not_paused`、`gsap_css_transform_conflict`…），由 orchestrator 在装配后跑 `hyperframes lint/check` 复核并带着 finding 重新派发

## 2. 前代系统依赖点 → 0.8.36 对应物

| 前代系统依赖（0.7.88 时代） | 0.8.36 现状 | 本 harness 处置 |
| --- | --- | --- |
| faceless-explainer Step 0–6 | 仍在，重写：Step 2 增加 frame presets（`build-frame.mjs --preset`），Step 4 增加 `hyperframes catalog --query`，Step 6 为 `transitions.mjs inject/verify` + `lint/check/snapshot` | 直接采用 |
| 自建 Claude CLI Worker + 三槽队列 + heartbeat/lease | **退役**：官方 subagent-dispatch 合同 | 采用官方合同；三槽并行退化为规则纪律（官方：并发上限只减并行不减工作，按波次派发） |
| `build-hf-frame-packets.mjs`（自建） | 官方 `frame-packets.mjs --project <dir> --storyboard <path> [--out-dir]` → `.hyperframes/frame-packets/<id>.md` + `_role.md` | 直接调用 |
| STORYBOARD.md 解析（自建 parseOfficialStoryboard） | 官方 parser `@hyperframes/core/storyboard`；frontmatter: `format/duration/message/arc/audience/mode`；帧字段：`status(src) duration transition_in scene voiceover poster` + 未知键保留进 `extra`；status: outline→built→animated；评论通道 `.hyperframes/frame-comments.json` | 读官方 parser；harness 门禁消费解析结果 |
| MiniMax TTS 注入 | 官方音频引擎 `media-use/audio/scripts/audio.mjs`（providers: auto\|heygen\|elevenlabs\|kokoro），帧键 meta 形状 `audio_meta.json: {bgm, bgm_pending, voices:[{frame,path,duration_s,words:[{id,text,start,end}]}], sfx}`；`--only tts,bgm,sfx` 支持 MERGE 进既有 `--out` | **MiniMax 适配路径不变**：harness 生成语音+词级时间，直写 `audio_meta.json`（voices.words = 帧相对词级时间）；BGM/SFX 用官方引擎 `--only bgm,sfx` 合并（需实测） |
| 官方 BGM/SFX（fetch-sfx） | `audio.mjs fetch-sfx`（engine `--only sfx`）；BGM 检索模式，无 HeyGen 凭证则跳过（不阻断） | 直接调用 |
| 字幕（自建单行适配） | `captions.mjs build` 消费 `audio_meta.json` 词级时间 → `caption_groups.json`；caption skin 由 `frame.md` token 注入（`.hyperframes/caption-skin.html`）；`caption-overrides.json` 空 shim | 直接调用；「单行 30 字」中文合同是否保留待验证官方分组行为后定 |
| transitions（前代只开放 cut/none） | `transitions.mjs inject/verify`；transition_in 词汇：`crossfade | blur-crossfade | push-slide | zoom-through | squeeze` + 可选 DIR / 秒数；`cut/none/空` = hard cut；机制 EXTEND-OUTGOING-ONLY | 直接采用（0.7.88 时代的 cut-only 限制解除） |
| `.83` 字幕安全区 | worker 合同固定 top ~83% / bottom ~17% keep-out（即使 captions disabled 也守）；精确像素（68px 中轴、y≤896）是项目适配层 | 项目适配层保留（视觉规则书） |
| `hf check --snapshots` | `npx hyperframes check --snapshots`（check 先跑 lint；`--strict` 门禁 warn）；`snapshot --at <t>` 接触表；已知误报：caption 词的 `text_box_overflow` 1–4px 不追 | 直接调用 |
| `hf add`（registry 安装） | `npx hyperframes catalog --query`（本地检索，--json）+ `hyperframes add`；Step 4 规定先搜 catalog 再手写 | 直接调用 |
| media-use resolve 素材账本 | `media-use/scripts/resolve.mjs --type --intent --project [--adopt --from]` 接口不变 | 沿用素材冻结纪律 |
| Studio final look + 重对齐（data-hf-id 注入） | review-loop.md §4 final look 合同仍在；data-hf-id 注入是否仍发生待实测 | 保留重对齐检查（实现时验证） |
| 渲染 | `render --quality high --output renders/video.mp4`（draft/high；docker/batch/cloud 可选）；`preview --background` 两种表面（storyboard board `?view=storyboard` / 最终合成预览） | 直接调用 |
| 授权签名（Ed25519） | 官方无此物（前代自建） | 保留 harness 自建（用户决策证据） |

## 3. 0.8.36 新能力（旧项目没有）

- **frame presets + recipe**：`build-frame.mjs --preset` 生成 `frame.md`+caption skin；`recipe.mjs freeze/use` 把通过的项目冻结为可复用配方——前代品牌 v3 主题可做成一个 preset/recipe
- **catalog 语义检索**：`--on-device`（33MB 本地向量索引，需用户同意）；`--json` 信封带 tier/dropped/unindexed
- **review-loop**：plan/sketch/final 三通过程 + 评论通道 + 自动模式单问保留（preview or render）
- **brief-contract**：flow/storyboard/mode 推导与 gate 行为矩阵
- **worker 合同细化**：class="clip" 全出血背景、`#root` 样式纪律、字体必须有本地文件（禁系统 CJK 字体名）、`pretext` 文字测量 API、determinism 规则（floor 重复次数等）
- **CLI 扩展**：preview --context（Studio 选中元素查询）、keyframes、beats、present、media-treatment、feedback --search-miss 等
- **hyperframes-audio skill**（音频剪辑/ducking 的 creator 编辑合同）

## 4. 待实测验证项（实现阶段完成）

1. MiniMax 注入：预写 `audio_engine_meta.json`（neutral）+ 官方引擎 `--only bgm,sfx` 合并是否保留自定义 voices（前代 0.7.88 的「neutral sidecar」路径在 0.8.36 的对应验证）
2. `audio.mjs sync-durations` 改写 STORYBOARD.md 时与 harness 锁稿哈希的交互（时长同步是机械改写，需纳入 harness 门禁口径）
3. 字幕分组行为：中文词级时间下 captions.mjs 的分组/密度逻辑；「单行 30 字」是否作为项目 caption skin/合同保留
4. `hyperframes init --non-interactive --example=blank --skill=faceless-explainer` 的非交互行为与产物形状（hyperframes.json）
5. Studio preview 是否仍注入 `data-hf-id`（决定 resync 脚本需求）
6. `check` 的 caption zone 参数（前代曾传 `.83`）在 0.8.36 的对应配置点
7. BGM 检索在无 HeyGen 凭证时的行为（确认不阻断 + 可跳过）
8. 前代品牌 v3 主题 → frame preset / frame.md 的迁移形态（tokens 注入 `tokens.json` 的 remix 机制）

## 5. 对项目设计的影响（相对 launch-design.md）

1. **隔离机制重议**：官方隔离 = 有界 packet + 「prompt 与磁盘文件是子智能体的整个世界」纪律，不做物理最小镜像。原设计「保留物理最小镜像」是在自建 Worker 层前提下定的；官方路径下物理镜像会与「产物直接落在项目 compositions/frames/」的 WAIT 判据冲突。**建议改为官方有界 packet 隔离 + 机器校验（装配后 lint/check/snapshot）**——需用户确认。
2. **harness 职责进一步收缩**：不再需要 worker 执行层/队列/心跳/lease/晋级事务（官方无镜像→无晋级）；保留：锁定稿/分段/脚手架、MiniMax 注入、任务图与证据、授权签名、视觉/字幕/命名规则、门禁（项目级）、每段复审纪律、master 拼接与收尾。
3. **子智能体派发纪律**（写入 harness 规则）：DISPATCH = 完整 `_role.md` 内容 + Dispatch context 原文粘贴（不消化不改写）；WAIT = 产物文件在盘；缺产物重派一次；并发上限按波次消化全量帧；子智能体返回不等于完成，机器门禁+主审才完成。
4. **worker 自检清单**成为 harness 机器门禁的输入：装配后 `lint/check` 的 finding 按官方错误码处置（`subagent-dispatch` 的 Re-dispatch 语义 = 带着 finding 重派同一帧）。
5. **帧状态机**：官方 `outline → built → animated` 取代前代的自定义状态；harness 任务图映射官方状态。
6. **视觉规则书**：前代流水线的视觉规则（白底/品牌黑/五语义色/禁飞线/字号红线/每页一焦点）与 0.8.36 官方 worker 合同（83% keep-out、短文案、不front-load、字体本地化）高度一致，可合并为一份「项目视觉合同」，官方合同优先。
