# 零信任独立复盘报告（2026-10-25）

**对象**：《为什么大模型越来越贵？被吃垮的无限量包月神话》——4 段 + master 合成，237.588s / 7127 帧 / 30.1MB
**项目**：`~/Documents/ZWhyperframes-products/llm-unlimited-subscription-myth/`（`master.closed=true`，2026-10-25T01:14:42.702Z）
**复盘人**：主控智能体（零信任视角，不采信上一轮任何「已通过」叙述）
**harness 状态**：本轮改动未提交，17 文件 +662/−46；`npm test` = **75 pass / 0 fail**

---

## 0. 结论摘要

| 维度 | 结论 | 证据强度 |
| --- | --- | --- |
| 锁稿 → 字幕 → 语音 → 注入 → 渲染 的同源链 | **完整闭合**，无一处断裂 | 独立重算 9 类哈希 |
| 字幕合同（逐字/切分/单行/无动效/字幕带） | **全部满足** | 独立重算 + skin 源码审计 |
| 视觉底线（字号/禁元素/动效/渐变/缓动） | **0 违规** | 49 帧全量重扫 |
| 门禁真实性 | **不是假绿** | 副本重跑官方 `check --strict` |
| 音轨 | **存在、对齐、无静音、无截断** | ffprobe + silencedetect + 哈希链 |
| 跨段连续性（计量表同构） | **有真实不一致**（3 处） | 渲染像素级实测 |
| 本轮 harness 改动 | **发现 3 个洞，已全部修复并补回归** | 变异验证 |

**总体判断：交付物合规、可发布。** 视频本身没有发现内容错误、字幕错误、音画不同步或门禁造假。

**但有 4 处真实瑕疵**，其中 1 处是**根因级**的（规格自相矛盾，会在下一段生产复现），3 处是已交付段落上的规格违背。**另在本轮 harness 改动里查出 3 个门禁漏洞，全部已修**——其中一个是「换掉配乐/音效完全无声通过」。

---

## 1. 取证方法与边界

- **零信任**：上一轮的「已通过 / 已修复 / 已闭环」一律降级为**待验命题**，每条都重新取证。
- **只读为主**：项目已 `master.closed=true` 冻结。全部破坏性验证在 `/tmp/audit-copy`（41M 副本）上进行；**真实项目零写入**（`find -newermt` 校验为空，4 段 receipt 仍为原值 v1，`master.closed` 与候选哈希未变）。
- **像素级判据**：涉及「看起来一致」的判断，一律落到渲染像素（ffmpeg **输出 seek** 抽帧 + numpy/PIL 量测），不靠 CSS 推断。
- **官方 CLI 唯一入口**：`node node_modules/.bin/hyperframes`（0.8.36），不用 `npx`。

> 取证过程中我自己犯过一次错并纠正：先用正则数刻度，把 F03 的 12 根 div 刻度漏成 0 根（F11/F12 的 SVG `<line>` 反而数对了）。改成「div class 含 tick + SVG rect 4×16 + SVG line」三路合并后重算，F03/F06 均为 12 根 ✅。**F09 那 1 根「刻度」是电网座位块的电表圆盘，不是表盘刻度** —— 表盘本身零刻度这条结论不变。

---

## 2. 通过项（逐条附独立证据）

### 2.1 同源链：锁稿 → 段稿 → TTS → 注入 → 渲染

| 校验点 | 段 01 | 段 02 | 段 03 | 段 04 |
| --- | --- | --- | --- | --- |
| 锁稿 sha256 == `state.locked_script.sha256` | ✅ | ✅ | ✅ | ✅ |
| `segment-plan.text_sha256` == sha(锁稿该段区间 trim) | ✅ | ✅ | ✅ | ✅ |
| `user_script.txt` 内容 == 锁稿该段行区间（逐字） | ✅ | ✅ | ✅ | ✅ |
| `segment-manifest.user_script_sha256` == sha256File(user_script.txt) | ✅ | ✅ | ✅ | ✅ |
| `tts-binding.text_sha256` == sha256File(user_script.txt) | ✅ | ✅ | ✅ | ✅ |
| TTS 三产物（mp3 / titles / manifest）哈希绑定 | ✅ | ✅ | ✅ | ✅ |
| `injection-binding.text_sha256` == sha256File(user_script.txt) | ✅ | ✅ | ✅ | ✅ |
| `audio_meta.json` / `audio_engine_meta.json` / `STORYBOARD.md` 哈希绑定 | ✅ | ✅ | ✅ | ✅ |
| STORYBOARD 帧时长序列 == `injection.frame_durations` | ✅ | ✅ | ✅ | ✅ |
| `audio_meta` 词数 == binding `word_count` | 425 | 411 | 434 | 367 |
| `voice_total_duration_s` == 各帧 voice 时长和 | ✅ | ✅ | ✅ | ✅ |

锁稿 sha256 = `a0cb24a782515904dc642b0970f6cf5323f93ad919bfebcf073a1355ab60e6c8`（55 行）。
`segment-plan.json` 的 `text_sha256` 与 `sha256File(user_script.txt)` **不相等是正常的**：`new-video.mjs` 的口径是 `sha256Text(trim 后的区间正文)`，而 `user_script.txt` 多一个尾换行——按该口径重算，四段全部命中。**不是漂移。**

### 2.2 字幕合同

- 4 段 `caption_groups.json` 的 text 拼接 vs 锁稿行区间：426 / 412 / 438 / 367 字，**逐字全等**；全片归一化 **1640 字全等**。
- 语块长度：最长 **22 字**（段 01 caption-group-29 / 27），**超 22 字 0 组**。
- 含换行语块：**0 组**（单行显示 ✅）。
- 字幕覆盖到段末：62.143 / 58.745 / 63.165 / 53.434s ✅。
- `.hyperframes/caption-skin.html`：只调 `tl.set(className)`，**无 scale 动画**（合同「无动效」✅）。`is-active` 与 `is-spoken` 同色 ⇒ 无逐词高亮——官方 13 个 preset 中 **9 个**同色（biennale-yellow / blockframe / capsule / cartesian / code-editorial / coral / creative-mode / daisy-days / editorial-forest），仅 4 个（bold-poster / broadside / blue-professional / cobalt-grid）有高亮 ⇒ **属官方家族常见形态，不构成违规**；合同本身只约束文本、切分、单行、无动效。
- 4 段 `frame.md` **逐字节一致**（`58c78df5b1d6`，23246B）；4 段 `caption-skin.html` **逐字节一致**（`b7093cf1d920`）⇒ 无中途偷改。

### 2.3 视觉底线

49 帧全量重扫：系统 CJK 字体名、`@font-face` 声明一致性、字号下限、CSS transition/keyframes/animation、模糊阴影、渐变、back/bounce/elastic 缓动、`Math.random`/`Date.now`、repeat/yoyo ⇒ **0 项违规**。
最小可见字号：段 01 **28.0px** / 段 02 **29.8px** / 段 03 **30.7px** / 段 04 **28.8px**，全部 ≥28px ✅。

### 2.4 门禁真实性（不是假绿）

在 `/tmp/audit-copy` 副本上重跑官方 `check --strict --caption-zone="x0=0;y0=.83;x1=1;y1=1"`：

| 段 | Lint | Runtime | Layout | Motion | Contrast | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | 0 | 0 | 0 err / 0 warn / **1 info** | 0 | 29-29 | **Check passed** |
| 02 | 0 | 0 | 0 err / 0 warn / 0 info | 0 | 19-19 | **Check passed** |
| 03 | 0 | 0 | 0 err / 0 warn / 0 info | 0 | 17-17 | **Check passed** |
| 04 | 0 | 0 | 0 err / 0 warn / **4 info** | 0 | 16-16 | **Check passed** |

harness 自身的 `gate verify`（锁稿/TTS/注入绑定同源）4 段亦全过。

### 2.5 音轨

| 项 | 段 01 | 段 02 | 段 03 | 段 04 |
| --- | --- | --- | --- | --- |
| `audio_meta` voices / 磁盘 wav 数 | 12/12 | 12/12 | 13/13 | 12/12 |
| meta 时长 vs ffprobe 时长偏差 | 全部 ≤60ms | 同 | 同 | 同 |
| 词末时间 ≤ 音频时长 | ✅ | ✅ | ✅ | ✅ |
| 渲染 MP4 时长 / 语音总时长 | 62.167 / 62.142 | 58.767 / 58.745 | 63.167 / 63.164 | 53.467 / 53.433 |
| 渲染音轨 silencedetect（-45dB / ≥0.6s） | **0 处** | **0 处** | **0 处** | **0 处** |
| wav 拼接 silencedetect | **0 处** | **0 处** | **0 处** | **0 处** |
| 渲染 MP4 含音轨流 | ✅ | ✅ | ✅ | ✅ |

**音画差 ≤34ms**，无静音、无截断、无丢音。

---

## 3. 本次新发现（真实瑕疵）

### 3.1 【根因级】STORYBOARD 的表体规格自相矛盾

段 02 STORYBOARD 第 89 行原文：

> `border: 0.4cqw solid {colors.ink}`（**4px** 墨黑描边）

`0.4cqw` 在 **1920px** 画布上是 **7.68px**，不是 4px。两种表述并存 ⇒ 实现者必然二选一 ⇒ **同一台表出现了两种描边**。这就是 3.2 的根因。
段 04 STORYBOARD 第 160 行给出了**权威口径**（`border 4px #0F0F0F`）并点名「与段 02 F03/F11/F12、段 03 F03/F10/F13 是同一台表」，而段 02 那行括号注释与之冲突——**两份 STORYBOARD 互相打架**。

### 3.2 同一台 Ø360 表，描边在 4px 与 7.68px 之间摇摆（像素实测）

从**渲染后的 MP4**量测（非 CSS 推断）：

| 段 | 帧 | CSS 描边 | **实测环厚** | 占直径 | 轴帽 | 表盘邻域橙影 |
| --- | --- | --- | --- | --- | --- | --- |
| 02 | F03 | `4px` | **4px** | 1.11% | 44px | 11750 px ✅ |
| 02 | F11 | `0.4cqw` | **7px** | 1.94% | 44px | 11744 px ✅ |
| 02 | F12 | `0.4cqw` | **7px** | 1.94% | 44px | ✅ |
| 03 | F03 | `4px` | **4px** | 1.11% | 44px | ✅ |
| 03 | F10 | `4px` | **4px** | 1.11% | 44px | ✅ |
| 03 | F13 | `0.4cqw` | **7px** | 1.94% | 44px | ✅ |
| 04 | F06 | `0.4cqw` | **7px** | 1.94% | 44px | ✅ |

⇒ 同一台表出现 **1.75 倍** 的描边粗细差。段 02 内部（8.26s 与 47.1s）与跨段（段 02 F03 / 段 03 F03 的 4px vs 段 02 F11 / 段 03 F13 / 段 04 F06 的 7px）都有。

**观感影响：小**（1.94% vs 1.11% 的直径比，观众几乎不可能注意到）。
**规格影响：实打实的违背**——段 04 F06 的 STORYBOARD 明文要求 `border 4px` 且点名这 9 帧为同一台表。

### 3.3 段 04 F09 的表**不是**「同一台表」

段 04 STORYBOARD 第 228 行明文：「计量表是 F6 的**同一台表**（同一几何、同一读数 007、指针同一停位），尺寸缩小放在桌角，**不是另一只表**」。

实装与渲染像素：

| 项 | F06（规格表） | F09（缩小版） | 判定 |
| --- | --- | --- | --- |
| 表盘直径 | 360px | 200px | 规格允许缩小 ✅ |
| 描边 | 7px（1.94%） | 4px（2.00%） | 比例近似 ✅ |
| **橙色硬偏移影** | **有**（邻域橙像素 11745） | **无**（邻域橙像素 **0**） | ❌ |
| 刻度 | 12 根 4×16 | 12 根 4×16（192 viewBox） | ✅ |
| 指针 | 12×132（宽占 3.33%） | 12×78（宽占 **6.00%**） | ❌ 宽度未缩 |
| 轴帽 | Ø44（12.2%） | Ø40（**19.0%**） | ❌ 明显偏大 |
| 计数器 | 160×56 | 104×46 | ❌ 非等比 |
| 读数 | 007 | 007 | ✅ |

⇒ F09 是**手绘简化版**而非等比缩放：橙色硬影整个丢了，指针变粗 1.8 倍，轴帽大 1.56 倍。
**观感影响：中等**——观众一眼能看出「F06 那台表有橙色影子，桌上这台没有」⇒ 削弱「同一台表 → 同一读数 007」的视觉论证。
（段 04 F10 的 Ø660 表已排除：规格明写「秒表……**不是那台成本表**」✅。）

### 3.4 段 02 F03 读数 `000` 与规格链的 `003` 冲突

实装读数链条：
段 02 F03 = **000** → F11 = 003 → F12 = 003→999 → 段 03 F03 = 003 → F10 = 003 → F13 = 003→999 → 段 04 F06 = 003→007 → F09 = 007。

规格链：
- 段 02 F11 规格：「**与 Frame 3 是同一台表、同一个零读数**……计数器读数 **003**」
- 段 03 F10 规格：「与 F3 是**同一台表**……**指针依旧贴着零、读数依旧 003**——与 F3 完全一致」

「依旧 003」坐实了段 02 的贴零态读数就是 003。**段 02 F03 写 000，是全片唯一一处同表读数在无叙事依据下的跳变**（000→003，段 02 内部）。
**观感影响：极小**（000 与 003 都读作「几乎为零」）；**规格影响：断链**。

---

## 4. 本轮 harness 改动的零信任审查

本轮改动引入了 `gate.mjs render-ready`（拿 final-look receipt 重算盘上产物）与 receipt v2 的目录绑定。我按「找洞」的思路审了一遍，**查出 3 个洞，全部已修**。

### 4.1 洞 A：目录绑定把「本来就不存在」误判成漂移（合法路径被误伤）

目录型绑定在「preflight 当时目录就不存在」时记为 `null`，而复核把 `null` **一律**当成漂移 ⇒ 任何没有 `assets/fonts/` 的合法段（只用系统字体）**永远过不了 `set-mp4`**。

- **实证**：复刻比较逻辑 → `drift = "assets/fonts/：receipt 未记录该目录"` → 假阳性成立。
- **修复**：语义改为「**preflight 当时不存在 ⇒ 现在也不该存在**」；只有**凭空多出**目录/文件才算漂移（那意味着渲染会多读一批没被验证过的字节）。
- **回归**：新增用例「preflight 时不存在的目录不算漂移」，**变异验证通过**（撤掉修复当场变红，恢复复绿）。

### 4.2 洞 B：`assets/bgm/` 与 `assets/sfx/` 完全在门禁视野外（本轮改动自身的盲区）

官方 `assemble-index.mjs` 会把 `assets/bgm/x.mp3` 与 `assets/sfx/x.mp3` 写进 `index.html` 的媒体表，渲染逐帧读取它们。而 v2 的目录绑定只有 `voice` 与 `fonts`。

- **实证**：在副本上造 `assets/bgm/bed.mp3` + `assets/sfx/whoosh.mp3` → `render-ready` 仍报「✓ 渲染输入复核通过（7 项产物 + 2 个目录 + 12 帧均未漂移）」。**换掉配乐/音效完全无声通过。**
- **修复**：receipt 升 **v3**，绑定四个资产目录：`voice` / `fonts` / `bgm` / `sfx`。
- **回归**：新增用例「BGM 与音效目录必须在绑定内」，**变异验证通过**（撤掉 bgm/sfx 绑定当场变红）。
- **复验**：副本上重跑 → 塞入 BGM 后立刻被拦下：`• assets/bgm/：preflight 时不存在，现在出现了` ✅。

### 4.3 洞 C：扩展名白名单会漏掉未知扩展名

原 `dirDigest` 按扩展名白名单筛文件（voice: `.wav/.mp3/.m4a`；fonts: `.woff2/.woff/.ttf/.otf`）。白名单是「猜测渲染可能读什么」——漏掉的扩展名（`.ogg` / `.aiff` / …）若被渲染读到，门禁看不见。**那是漏检，不是稳健。**

- **修复**：改为**封闭 denylist**——除 `.DS_Store` / `Thumbs.db` / `desktop.ini` 三个 OS 噪音文件外，目录内**全部**文件纳入摘要。误伤面有界，覆盖面完整。
- 副作用：receipt 摘要算法变了 ⇒ v2 receipt 失效 ⇒ 一并升到 v3，让失败信息诚实（"版本过旧"而非误导性的"内容已变化"）。

### 4.4 绑定覆盖率审计：无缺口

逐帧扫描 4 段 `index.html` / `compositions/frames/*.html` / `compositions/captions.html` 的**全部本地引用**，得到渲染真正读取的文件集合：
`assets/voice/*.wav`（✅ 目录绑定）、`assets/fonts/*.woff2`（✅ 目录绑定）、`compositions/captions.html`（✅ 单文件绑定）、`compositions/frames/*.html`（✅ 帧集合绑定）、`index.html`（✅ 单文件绑定）。
无 `compositions/components/`、无 `capture/assets/fonts/` ⇒ **v3 绑定表覆盖渲染读取的 100% 本地文件**。
（`assets/bgm` / `assets/sfx` 已在 v3 补入。）

### 4.5 残留边界（未修，已记录）

**`render-ready` 证明的是「渲染前输入未被改动」，不是「这段 MP4 就是这批输入渲染出来的」。**
若有人在校验之后改产物 → 渲染 → 再把产物改回原样，`render-ready` 会通过（盘上字节确实等于 receipt 绑定），但 MP4 里是改后那版的画面。这是 TOCTOU 的残留形态。
彻底闭合需要「渲染后比对产物哈希」或「用产物哈希派生 MP4 身份」，后者与官方 CLI 的产物口径冲突。**当前实现的诚实表述是：它拦的是「Studio preview 改写产物后忘了重跑 preflight」这个真实事故，不是防篡改。** 已写入规则与 FAQ。

### 4.6 存量影响面

4 段 receipt 均为 **v1** ⇒ 新 `render-ready` 会拒绝它们并要求重跑 preflight（这是实话，不是故障）。
- **已收尾项目不受影响**：`render-ready` 只在 `set-mp4` 触发，已绑定 MP4 的段落与 `master.closed=true` 的项目无需回补。
- **只有返工重渲**（重新 `set-mp4`）才会撞上 v1 拒绝；此时重跑 preflight + 重新取得 final-look 授权即可，且换片后旧授权自动作废（既有设计）。
- 已写入 `references/faq.md` §4.7、规则 §3.4。

### 4.7 本轮 harness 改动的其余部分

- `set-mp4` 作废 final-look 的口径修正（只在真换片时作废，避免段间死锁）——逻辑复核无误。
- `chrome/`（官方 `hyperframes browser ensure` 的下载缓存）按**路径**排除 + `.gitignore`——复核无误。
- `scripts/lib/harness.mjs` 抽出的 `RECEIPT_BINDINGS` / `RECEIPT_DIR_BINDINGS` / `receiptBindingHashes` / `receiptDirBindingDigests` / `framesDigest` / `dirDigest` 确为唯一真源，写 receipt 与复核 receipt 共用同一张表 ✅。
- `npm test` = **75 pass / 0 fail**（本轮新增 2 条用例，均完成变异验证）。

---

## 5. 遗留风险清单

### 必修（已在本轮完成）

| # | 项 | 状态 |
| --- | --- | --- |
| R1 | `render-ready` 目录绑定 `null` 被当漂移 → 合法段永久被误伤 | ✅ 已修 + 回归 + 变异验证 |
| R2 | `assets/bgm/`、`assets/sfx/` 未绑定 → 换配乐/音效无声通过 | ✅ 已修（receipt v3）+ 回归 + 变异验证 |
| R3 | 目录摘要用扩展名白名单 → 未知扩展名漏检 | ✅ 已修（改 denylist OS 噪音）+ 回归 |

### 建议修（已在本轮完成，属规则层）

| # | 项 | 状态 |
| --- | --- | --- |
| R4 | 跨帧共享规格自相矛盾（`0.4cqw` vs 「4px」）→ 下一段生产会复现 | ✅ 已写入规则 §4（单一权威数值 + 单位换算） |
| R5 | 缩小版道具未按比例缩放几何 → 观众认不出是同一件道具 | ✅ 已写入规则 §4 |

### 记录即可（不返工已渲染段落）

| # | 项 | 量级 | 理由 |
| --- | --- | --- | --- |
| R6 | 同一台 Ø360 表描边 4px / 7.68px 摇摆 | 观感极小（1.11% vs 1.94% 直径比） | 违反 STORYBOARD 明文，但按「段后不返工」原则不动；根因已在 R4 修正 |
| R7 | 段 04 F09 无橙色硬影 + 指针/轴帽/计数器非等比 | 观感中等 | 削弱「同一台表」论证；已渲染，不返工 |
| R8 | 段 02 F03 读数 `000` 与规格链的 `003` 冲突 | 观感极小 | 全片唯一一处同表读数无理由跳变；已渲染，不返工 |
| R9 | `render-ready` 不证明「MP4 由这批输入渲染而来」（TOCTOU） | 残留边界 | 已写入规则与 FAQ 的诚实表述；彻底闭合与官方 CLI 产物口径冲突 |
| R10 | 存量 v1 receipt 阻断返工重渲 | 流程性 | 已收尾项目不受影响；FAQ 已写补证路径 |

---

## 6. 本轮产出物

**harness 仓（未提交，17 文件 +662/−46）**
- `scripts/lib/harness.mjs` — `RECEIPT_DIR_BINDINGS` 扩到 4 个目录；`dirDigest` 改 denylist
- `scripts/gate.mjs` — receipt v3 + `FINAL_LOOK_RECEIPT_VERSION`；目录绑定 null/absent 语义修正
- `scripts/state.mjs` — `set-mp4` 以 `render-ready` 为前置
- `scripts/build-skill-package.mjs` / `.gitignore` — 按路径排除 `chrome/`
- `docs/rules/production-workflow-rules.md` — §3.4 渲染输入完整性；§4 新增三条跨帧规格纪律
- `references/{commands,walkthrough,faq}.md` / `README*` / `SKILL.md` / `CHANGELOG*` — 口径同步到 v3
- `tests/pipeline-e2e.test.mjs` / `tests/packaging.test.mjs` — 4 条新用例，全部完成变异验证

**项目侧**：**零改动**（已 `find -newermt` 校验）。

**临时件**：`/tmp/audit-copy`（副本，41M）、`/tmp/px`（抽帧与量测产物）。真实项目未被触碰。
