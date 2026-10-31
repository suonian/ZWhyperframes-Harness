# 视觉基线规则（默认偏好 · 非排他）

> 本文件是**项目级视觉默认基线**的唯一所有者：官方自带资产清单、默认模板与调色板、固定音色、字号下限口径、无意义元素禁令。
>
> **定位（重要）**：本仓**不重造**官方已有的模板/色板/音色能力。本文件只做三件事：
> 1. **指明官方资产在哪**（避免重复造轮子、避免版本漂移）；
> 2. **声明本项目的默认偏好**（生产时默认用哪一套）——**偏好，不是排他**；
> 3. **指出官方未覆盖处的项目级补件**（含门禁归属）。
>
> 冲突裁决顺序：用户当前指令 > `AGENTS.md` > `docs/rules/` > 官方 HF 合同（锁定 commit 下 `vendor/skills/` 原文为准）。

## 1. 官方自带资产清单（不要重造）

锁定 commit `v0.8.36` / `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`，由 `scripts/bootstrap.sh` 按 SHA 取回至 `vendor/skills/`。

**官方已有的，本仓一律不重造**：

| 官方能力 | 位置 |
| --- | --- |
| **13 套 frame preset**（模板 + 调色板 + typography + components + caption skin） | `vendor/skills/hyperframes-creative/frame-presets/<name>/`（每个含 `FRAME.md` / `frame-showcase.html` / `caption-skin.html`） |
| **preset → frame.md 落地 + 品牌 remix** | `vendor/skills/faceless-explainer/scripts/build-frame.mjs`（`--preset` / `--tokens`；品牌色按角色映射、品牌字体换入；键名/几何/components 不动） |
| **颜色解析与语义角色映射** | `vendor/skills/faceless-explainer/scripts/lib/tokens.mjs`（`parseColors` / `semanticColors` / `lum` / `chroma`；`UA_DEFAULT_COLORS`、`STATUS_ROLE_KEY` 排除浏览器默认色与状态色）——门禁直接 import 官方实现 |
| **项目配方（个人模板）冻结与复用** | `vendor/skills/media-use/scripts/recipe.mjs`（`freeze` → `~/.media/recipes/`；`use` 覆盖项目 frame.md）——本项目默认走它 |
| **记忆默认值（音色/preset 偏好）** | `vendor/skills/media-use/scripts/prefs.mjs`（`record --key style_preset\|voice`） |
| **设计选型器**（色板/字体配对） | `vendor/skills/hyperframes-creative/references/design-picker.md`（产出 google-labs `design.md`） |
| **官方可读性下限** | 各 preset `FRAME.md`：一律 `≥ 1.4cqw`；px 令牌是 chrome，**不在** legibility floor 内（见 §4） |
| **官方静音/克制条款** | 各 preset `FRAME.md` 的 `Silence` / `Restraint` / `Approved Entities`（见 §5） |

**preset 清单（13 套）**：`biennale-yellow`、`blockframe`、`blue-professional`、`bold-poster`、`broadside`、`capsule`、`cartesian`、`cobalt-grid`、`code-editorial`、`coral`、`creative-mode`、`daisy-days`、`editorial-forest`。

**本仓自带的可选 preset（第 14 套，非官方）**：`presets/creative-mode-zh/`——官方 `creative-mode` 的中文适配版（无字幕背景、Noto Sans SC 字形、五强调色）。**显式指名才用**（`--preset creative-mode-zh --preset-dir <harness>/presets`），**不是默认**；默认仍是官方 `capsule`（见 §2）。它与官方 13 套同属「合法可用」，本仓不做 allow-list 阻断。

> **官方无强制点**：官方 `build-frame.mjs` 只校验 `--preset` 非空且 `FRAME.md` 存在（`:55-72`），**无 allow-list、无默认值、无按项目强制映射**。所以「本项目默认用哪一套」只能由本仓声明——这正是本文件存在的理由。


## 2. 本项目默认基线（偏好，非排他）

| 项 | 默认值 | 性质 | 官方落地路径 |
| --- | --- | --- | --- |
| **模板与调色板** | preset `capsule`（cream/ink/outline/white + 8 色 candy） | **默认偏好**，指名其它 preset 时照用 | `build-frame.mjs --preset capsule --hyperframes .` |
| **中文字体** | `Noto Sans SC`（body 400 / pill-text 700 / display 700–900） | 默认偏好 | 写入 `capture/extracted/tokens.json` 的 `fonts`，官方 remix 自动换入 |
| **配色映射** | 官方 remix **按角色**映射（暗↔暗、亮↔亮、accent→accent），**不逐键硬改** | 官方机制 | 官方 `build-frame.mjs` |
| **音色** | MiniMax `speech-2.8-hd` / `voice_id ttv-voice-2026040916452526-mc0nlrpN` / speed 1.27 / pitch 1 / vol 1.16 | **默认偏好**，换音色需用户明确指示 | `tools/minimax/scripts/minimax_tts.py` 的 `VOICE_PROFILE` |
| **字幕字体** | 跟随 frame.md（官方 captions 注入 brand tokens） | 官方机制 | 官方 `captions.mjs` |

**「偏好」而非「排他」**：官方 13 套 preset **全部合法可用**，用户指名哪一套就用哪一套，本仓不做 allow-list 阻断；用户给出自己的品牌色/字体 → 写进 `capture/extracted/tokens.json`，由官方 remix 自动映射；换音色必须由用户明确指示，本仓**不会**因为「有默认值」而静默替用户改音色。

**为什么默认 `capsule` + `Noto Sans SC`**：本项目已验证的成片风格即「官方 `capsule` preset 的色板 + 键名 + components」原样保留，仅把 `Bodoni Moda`/`Space Grotesk` 换为 `Noto Sans SC`（中文可渲染）——这**正是官方 remix 的输出形态**，不是另造一套体系。

**用户自建模板的正式落点**：官方 `recipe.mjs freeze` 把已批准运行冻结为命名配方（frame.md + 分镜骨架 + brief 答案）存 `~/.media/recipes/`，`recipe.mjs use` 覆盖项目 frame.md。**本项目的「我的模板与调色板」以官方 recipe 形式存在，不在本仓另建 `brand/` 副本**——仓库里存一份色板副本就等于两个真源（仓库副本 vs 段内 frame.md），换项目必漂；官方 recipe 已提供「冻结→复用」，且与 `build-frame.mjs` 的输入输出完全对齐。

**落地的官方命令**（不是本仓新脚本，`<MEDIA_DIR>` = 已安装的 `media-use` skill 目录）：

```bash
node <MEDIA_DIR>/scripts/recipe.mjs freeze --hyperframes . --name <name>   # 冻结已批准运行 → ~/.media/recipes/
node <MEDIA_DIR>/scripts/recipe.mjs use   --hyperframes . --name <name>   # 复用（覆盖 frame.md，Step 2 随即跳过）
node <MEDIA_DIR>/scripts/prefs.mjs record --hyperframes . --key style_preset --value capsule
```

**音色记忆**：官方 `prefs.mjs --key voice` 记录的是 HeyGen/Kokoro 的 voice id；本项目用 MiniMax TTS，音色由 `VOICE_PROFILE` 固定（见 §3）——两者不冲突：官方 prefs 管「选哪个 voice id」，本仓管「MiniMax 的哪种音色」。

## 3. 固定音色（默认值 + 可核验）

音色参数**唯一真源**：`tools/minimax/scripts/minimax_tts.py` 的 `VOICE_PROFILE`。每次 TTS 产物的 `*.manifest.json` 内嵌 `voice_profile`，因此**音色可核验**：`gate.mjs baseline` 校验段内 manifest 与真源一致，不一致即阻断（音色漂移是用户可感知的质量事故）。换音色 = 用户明确指示 → 改 `VOICE_PROFILE` → 重新生成全部段语音，**不接受段级各自为政**。

## 4. 字号下限口径裁决（官方 1.4cqw vs 本仓 28px）

**冲突事实**：官方 13 preset 一律写 `≥ 1.4cqw`（≈26.9px@1920，`creative-mode/FRAME.md:185` 自己标注「≈27px@1920」），且官方**自身**大量使用 10–16px 的 px 令牌（最低 `bold-poster` label=10）并声明「px labels are chrome only」。本仓 `layout-guard` 是 28px 一刀切。二者口径不同，且官方 preset 若直接使用会被本仓门禁判红。

**裁决（用户「禁过小标签」要求优先，且官方条款本身把 px 排除在 floor 外）**：

| 类别 | 下限 | 依据 |
| --- | --- | --- |
| **承载性文字**（正文/标签/数据/标题） | **≥ 28px @1920**（≥ 1.458cqw） | 用户确认的项目级底线，严于官方 1.4cqw；`gate.mjs layout-guard` 静态判定 |
| **官方 chrome 令牌**（页码/计数器/colophon） | 官方 px 值豁免 | 官方 13/13 preset 明写「px labels are chrome only」，本仓不与官方对撞 |

**执行方式（两道）**：

1. **帧层**：`font-size` 低于 28px 的声明，若等于**当前 frame.md typography 里声明的 chrome px 令牌值** → 豁免（记为 chrome），否则或无法判定 → 阻断。官方 preset 的 chrome 令牌不再误杀；worker 随手写的 14px 仍被拦。
2. **基线层**：frame.md typography 里**承载性** px 令牌低于 28px → 阻断。理由：`label`/`tag`/`kicker` 在语义上是**承载性文字**，官方「px labels are chrome only」的豁免不适用于它们——放任就等于开了一个「用 14px 写正文标签」的合法通道。

**chrome 豁免的双重条件**：令牌名须**命中 chrome 语义**（counter / pagenum / rail / colophon / credit / footnote / meta / chrome）**且不命中承载性语义**（label / tag / kicker / caption / badge / overline / attribution / body / title / headline）。只按「px 值是否出现在 frame.md 里」豁免是不够的——那会让 `capsule` 的 `label: px 14` 变成「14px 正文标签」的合法通道（变异验证实测发现）。

**`capsule` 的 `label: px 14` 冲突**：官方 preset 自带的承载性令牌，14px < 本仓 28px 下限。
- **裁决：阻断 + 要求上调**。官方 1.4cqw≈26.9px 只是**下界**不是上限，上调到 28px 不违反官方任何条款。
- **落地**：采用官方 preset 后把承载性 px 令牌上调至 ≥28px（`label: px 14` → `px: 28`）或改用 cqw。
- **不是"改官方 preset"**：改的是**本项目 `frame.md` 这份产物**（官方 remix 机制本就允许品牌侧调 typography），`vendor/skills/` 里的官方文件保持原样。

## 5. 无意义元素禁令（官方条款 → 机器可判）

官方已覆盖的**规则文本**（不重写，直接引用）：各 preset `FRAME.md` 的 `Silence`（留白/密度）、`Restraint`（克制/单一色源/无第十色）、`Approved Entities`（不虚构客户/Logo/数字）、`Fabrication`（数字必须来自脚本）；官方 `faceless-explainer/references/visual-design.md` 的密度规则（primary visual ≥40% 画布、≥3 深度层、不许孤立小元素）。

官方**没有**的是机器判定。本仓的门禁分工：

| 禁令 | 判定手段 | 门禁 | 强度 |
| --- | --- | --- | --- |
| 文本类元素必须是可读真字，禁色条/横线/占位块冒充正文 | 官方 `check` 能抓到**没画出来的**占位，**画出来的**色条它不管 | 人工复审（官方 `Approved Entities` 同属此类） | **复审**（本仓**未**机器化——不要当它有门禁） |
| 禁孤立小元素 | 官方 `check` layout 阶段（越界/遮挡/溢出） | 官方 `check --strict` | 阻断（官方） |
| 禁无叙事 idle 摇晃 | `gate.mjs quality` 像素静止比 + `gate.mjs animation-map` 死区 | 本仓 | 告警（无合格片基线） |
| 禁虚构数字 | 官方 FRAME.md `Fabrication` + 人工复审 | 复审 | 复审 |
| 色板不得越出 frame.md 声明 | 静态扫帧 HTML 的 hex/rgb，与 frame.md `colors:` 键值比对 | `gate.mjs baseline` | 阻断（可机器判） |
| 字号不得低于下限 | 见 §4 | `gate.mjs baseline` + `layout-guard` | 阻断 |

**明确不做的事**：不在本仓另写一套「无意义元素」规则文本去覆盖官方 `Silence`/`Restraint`/`Approved Entities`；本仓只补**机器可判的那部分**。

## 6. 本仓新增产物清单（与「不重造官方能力」对照）

| 产物 | 类型 | 为什么官方没有 |
| --- | --- | --- |
| 本文件 | 规则 | 官方有资产，但无「本项目默认用哪一套」的项目级声明 |
| `visual-baseline.mjs` + `gate.mjs baseline` | 库 + 门禁 | 官方 `tokens.mjs` 只解析不判定；官方 `check` 不看 frame.md 一致性、不看色板越界、不看音色 |

**不做**：另建 `brand/` 目录存放色板副本、另写 preset 映射逻辑、另做字体下载/本地化（官方 `hyperframes-localize-fonts` 已提供）、另做配方存储（官方 `recipe.mjs` 已提供）。
