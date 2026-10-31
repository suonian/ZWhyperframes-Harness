# 第二轮零信任独立评估：成片质量缺口 + 跨平台阻断（2026-10-31）

> 性质：只读评估。本轮**未改动仓库任何文件**（结束时仍为 51 文件暂存态，+2075/−163，HEAD `e9cb611`）。
> 方法：零信任——不采信「项目已在苹果终端多次验证迭代、具备生产条件」的断言，所有结论以本人实测或源码直读为准，并逐条标注证据等级。
> 前序：`windows-cross-platform-audit-2026-10-31.md`（第一轮，跨平台适配 18 项）、`audit-2026-10-25-zero-trust-review.md`（第一轮零信任基线）。

---

## 0. 一句话结论

**流程强制层已经扎实，成片质量层几乎全空。**

- 仓库的「保流程 / 强制能力」主张基本成立：规则落点、决策门、fail-closed 探针都在位。
- 但「决定好不好看」的那几条要求——hero 早可见、禁纯色等待/首帧规则、全时长揭示（禁 front-load）、一页一职责、节奏、禁飞线——**一条机器门禁都没有**，全靠人工复审。
- 本仓自己交出的成片，在仓库自己的规则书下**不合格**（首帧近乎纯色、88.1% 帧静止、PPT 风险 98.7%），而**全部门禁全绿**。这正是本仓立志要消灭的病。
- 跨平台侧另有 2 处**实测坐实**的阻断 + CI `test-windows` 必红 + `.gitattributes` 未提交 → **Windows 目前不具备可生产性**。

---

## 1. 证据等级约定

| 标记 | 含义 |
| --- | --- |
| 【实测】 | 本轮实际运行并观察到结果，可复现 |
| 【源码】 | 直接读官方 / 本仓源码得出的事实（行号可核） |
| 【推断】 | 未在本机实测，需在目标平台验证 |

---

## 2. 跨平台阻断（Windows 不可生产）

### B-1【实测·阻断】`scripts/doctor.sh:25` 在登录 shell 下丢弃官方 doctor 全部结论

**根因**：`doctor.sh:13` 通过 `hf_cli_path` 拿到**原生形态**路径（`native_path` 已转换），但 `:25` 把**未经转换的 POSIX 路径** `$HARNESS_ROOT/scripts/lib/doctor-report.mjs` 直接交给原生 `node`。

Git Bash 登录 shell 会预设 `MSYS_NO_PATHCONV=1`（实测 `bash -lc 'echo $MSYS_NO_PATHCONV'` → `1`；`bash -c` → 未设），MSYS 的自动路径转换因此**被关闭**，`/d/AI-Trae/...` 原样送到 node，node 解析为 `D:\d\AI-Trae\...` → `MODULE_NOT_FOUND`。

**实测对照**：

| shell | 结果 |
| --- | --- |
| `bash scripts/doctor.sh`（非登录） | 18 行全绿，exit 0 |
| `bash -lc 'scripts/doctor.sh'`（登录） | `Cannot find module 'D:\d\AI-Trae\...\doctor-report.mjs'` → 官方 doctor 结论**整份丢失**，却报「必需项未通过」，exit 1 |

**危害等级**：最高。doctor 是环境体检入口，它报的「必需项未通过」是**假阴性**，会误导排查方向，且官方检查的真实结论无人能读。

**修复**：`doctor.sh:25` 的第二个 `node` 参数套 `native_path`（该文件 `:7` 已 source `platform-compat.sh`，函数现成）。

### B-2【实测·阻断】`scripts/install-skill.sh:57` 在登录 shell 下直接中止

**根因**：与 B-1 同源，但更严重——`install-skill.sh` **根本没有 source `platform-compat.sh`**（全文无 `native_path`），`:57` 把 `$HARNESS_ROOT/scripts/build-skill-package.mjs` 与 `--out "$STAGING/pkg"`（`mktemp -d` → `/tmp/...`）两个 POSIX 路径交给原生 node。

**实测**：登录 shell → `MODULE_NOT_FOUND`，`set -euo pipefail` 下**脚本中止**；非登录 shell → 正常安装。

**修复**：source `platform-compat.sh` + 对传给 node 的所有路径套 `native_path`。

> 全仓仅此 2 处未走 `native_path`（其余 bash→原生调用均已转换，见 `bootstrap.sh:59/118/255-258`）。

### B-3【实测·阻断】`scripts/bootstrap.sh:87` `xargs` 空白切词

```
find "$VENDOR_SKILLS" -type f -print | LC_ALL=C sort | xargs $hasher | $hasher | awk '{print $1}'
```

`xargs` 默认按空白切词，文件名含空格即被拆成多个参数。

**实测**：构造 `My Dir/f.txt` → `cat: /tmp/…/My: No such file or directory` + `Dir/f.txt: …`；`find -print0 | sort -z | xargs -0` 正常。

**放大因素**：`set -euo pipefail` 下第 234 行是独立命令，xargs 以 123 退出时**整脚本无声中止**，无任何错误提示。

**附带缺陷**：聚合哈希把**绝对路径**也算进被哈希内容，实为「路径+内容」哈希；同内容不同路径会得到不同结果。

**修复**：`xargs -0` / `xargs --null`（需同步 `find -print0` 与 `sort -z`）。

### B-4【实测】CI `test-windows` job 第一步即红

- `ci.yml:102` 注释「windows-latest 自带 ffmpeg」——**实测官方 `actions/runner-images` Windows2025 README：Tools 段只有 ImageMagick / jq / zstd，无 ffmpeg**。
- 默认 Python 3.12.10，**无 `python3`**（本仓 `resolve_python()` 会在 `python3` 失败后回退 `python`，但 `tests/pipeline-e2e.test.mjs:59` 的 `makeTinyMp4` **无 ffmpeg 缺失守卫**，直接失败且报错信息误导）。
- runner 有 `C:\Program Files\Git\bin\bash.exe`（Git Bash）与 `C:\Windows\System32\bash.exe`（**WSL 存根**）——runner 上的 `bash` 解析顺序需显式指定，否则可能落到 WSL 存根。

**修复**：`ci.yml` 增加 `choco install ffmpeg`（或 `imageMagick` 替代）；`makeTinyMp4` 加缺失守卫，缺失即 `skip` 并在 CI 里显式安装。

### B-5【实测】`.gitattributes` 与 `test-windows` job 只在暂存区，未提交

`.gitattributes`（`* text=auto eol=lf`）与 CI Windows job 均在暂存态，**HEAD 里没有**。→ 干净克隆无 CRLF 策略，「Windows 有 CI 证据」目前为 0。

### B-6【源码】`bootstrap.sh:133` `git sparse-checkout set --no-cone --stdin` 有 git 版本下限

`--no-cone` 需 git ≥ 2.25，`--stdin` 需 git ≥ 2.26。macOS 12 自带 git 2.30 ✅；但**本机未实测**，标【推断】。

### 跨平台判定

| 平台 | 判定 |
| --- | --- |
| **Windows** | ❌ 不具备可生产性：B-1/B-2 阻断 + B-3 阻断 + B-4 CI 必红 + B-5 未提交 |
| **macOS** | ⚠️ 基本可用，唯一风险 B-6（推断，未实测） |
| **Linux** | ✅ 未发现独有缺陷 |

---

## 3. 文档 / 规则一致性缺陷（12 项）

| # | 位置 | 缺陷 | 证据 |
| --- | --- | --- | --- |
| D-1 | `docs/rules/production-workflow-rules.md:43` 与 `:54` | 两个 `#7`（`final delivery` / `keyframes 诊断`）撞号 | 【源码】 |
| D-2 | 同上 | 三张表合计 13 行，文中称 12 项 | 【源码】 |
| D-3 | `README.md:121` / `README.en.md:121` / `SKILL.md:166` | 称「12 项中只有 3 项落在 3.1」，实际 §3.1 已 4 项 | 【源码】+ git 溯源：`5ac10fc` 写「3 项」时确为 3 个，**`e9cb611`（HEAD）新增 `final delivery` 后 README 未同步** |
| D-4 | `references/faq.md:47` / `AGENTS.md:58` vs `faq.md:223` / `faq.md:407` | 「禁用 `node node_modules/.bin/hyperframes`」与「正确做法 = 用它」直接矛盾；`.github/ISSUE_TEMPLATE/{bug_report,question}.md` 照抄了推荐版 | 【源码】+【实测】npm 在 Windows 生成的 `.bin` 是 `#!/bin/sh` 包装脚本，node 执行抛 `SyntaxError: missing ) after argument list`（用同目录未被改动的 `hyperframes-localize-fonts` 复现） |
| D-5 | `scripts/platform-compat.sh:67` + `scripts/net-env.sh:41` vs `scripts/minimax-tts.mjs:38` / `AGENTS.md:59` | bash 侧读 `HARNESS_PYTHON`，Node 侧与文档读 `MINIMAX_PYTHON` → 按文档设 `MINIMAX_PYTHON` 后 bash 侧解析失败，**代理被静默清空 + doctor 假告警**，而 TTS 正常 | 【源码】 |
| D-6 | `scripts/state.mjs:169-179` vs `scripts/gate.mjs` | 时长正则 vs 结构化解析分歧：`- duration：4s`（全角冒号）→ state.mjs 得 0s → **`expected > 0` 为假 → 时长校验整条跳过（fail-open）**；帧块外多一行 `- duration: 30s` → 正则 34s vs 结构化 30s → **`set-mp4` 拒绑正确 MP4** | 【实测】 |
| D-7 | `docs/rules/captions-contract.md:15` vs `references/faq.md:163` | 「第一步：官方 captions.mjs build」与「官方 build 覆盖产物是头号故障原因」**指令相反**；代码恒用 harness 算法 | 【源码】 |
| D-8 | `.minimax/skills/zwhyperframes-harness/` | 仓内副本已漂移：`gate.mjs`/`state.mjs`/`faq.md`/`SKILL.md` 全不同，**缺 `media-probe.mjs`/`hf-version.mjs`/`doctor-report.mjs`** → 本机实际加载的是**不带成片内容门禁的旧版** | 【源码】 |
| D-9 | `scripts/doctor.sh:44` | 称「10 项」，实际 13 项 | 【源码】 |
| D-10 | `CHANGELOG.md:51` | 称「77 项」，实际 89 项（`git diff HEAD` 证明该行是上一轮我方引入） | 【实测】 |
| D-11 | `SKILL.md:115` | 「460KB（服务端实测上限）」vs 代码注释（460KB 是自设安全线，服务端约 476KB） | 【源码】 |
| D-12 | `references/commands.md:3` / `:13` / `tools/minimax/README.md:112,134` / `AGENTS.md:57` / `README.md:142` | 承诺 `[state]`/`[new-video]` 前缀但代码 0 次；「失败退出 1」但 6 处 `exit 2`；仍硬编码 `python3`；「需 bash」清单漏 `install-skill.sh` 与 `platform-compat.sh` | 【源码】 |

**另**（轻微）：`listProjectSegmentDirs` 死代码（仅定义处 1 命中）；`hf-env.sh:54` 导出已知不可用的 `python3`；`platform-compat.sh:15-19` 注释与实测相反；`runHf` 不检查 `r.error`；`gate final-look` 先覆盖 receipt 再比对。

---

## 4. 成片质量缺口（本轮核心增量）

### 4.1 「我们的要求」→ 门禁映射

依据 `docs/rules/visual-production-rulebook.md` + `docs/rules/captions-contract.md` + `production-workflow-rules.md §4` + 官方合同，枚举约 **19 条**视觉要求：

| 要求 | 机器门禁 |
| --- | --- |
| keep-out 安全区 | ✅ |
| 最小字号 28px | ✅ |
| 文本对比度 | ✅（官方 check `contrast`，实测 `checked:14 passed:14`） |
| 模板结构（帧/标题层级） | ✅ |
| 确定性（同输入同输出） | ✅ |
| **hero 早可见 t≤0.5s** | ❌ |
| **全时长揭示 / 禁 front-load** | ❌ |
| **首帧规则：禁纯色等待** | ❌ |
| **一页一职责** | ❌ |
| **节奏 8–12s** | ❌ |
| **禁飞线（connector）** | ❌ |
| **文本真字（不用图形假装文字）** | ❌ |
| **平台中立** | ❌ |
| 其余约 6 条（字幕、音频、时长等） | 部分 ✅ |

**约 19 条中仅约 5 条有机器门禁——而决定「好不好看」的那 8 条，一条都没有。**

### 4.2 像素级实测（按本仓自有方法论「一律落到渲染像素」）

> **口径更正（第三轮）**：本节初版用的探针把「平均帧差 < 1」判为静止，读数是「静止帧占比 88.1%、PPT 风险 98.7%」。该阈值把**轻微的可见变化也算成静止**（卡片的 2.8% 呼吸缩放被整帧平均掉）。改用「**可见变化像素比例**」（灰度 1/10 缩放，逐像素差 > 12 才算变化）后，同一支片子的读数是：**静止占比 13.9%、最长静止段 0.167s**。
>
> 也就是说：**这支片子并没有「整段静止」**，我初版那个 88.1% 的数字是探针阈值的假象。真正成立、且有规则书明文依据的违规只有一条——**首帧**（非背景像素 0.000%、唯一色 2 种 = 近乎纯色等待）。下文与后续实现按更正后的口径。

工具：`scripts/lib/pixel-quality.mjs`（ffmpeg rawvideo + 纯 Node，无第三方依赖）。

```
视频      : 1920x1080 @ 30.0fps / 3.4s / 102 帧
运动      : 可见变化像素占比 平均 0.0243/帧  静止帧占比 13.9%  最长静止段 0.167s
首帧      : 主体面积占比 0.000%  唯一色数 2      ← 近乎纯色
窗口活动量: 0.0243 | 0.0086 | 0.0123 | 0.0042（每帧平均变化像素比例）
```

对照组（纯黑空壳）：静止 100%、最长静止 3.367s、变化 0%、首帧唯一色 1 → **量测器有判别力，非恒绿**。

**结论：上一轮交付的成片违反本仓自己的一条硬要求——「首帧规则：禁纯色等待」（§2）。** 而当时全部门禁全绿。

### 4.2.1 官方 motion 与像素量测的分工（实测互补，不可互替）

| 判据 | 官方 `keepsMoving` | 像素量测 |
| --- | --- | --- |
| 数的是什么 | 元素的 opacity/transform 有没有变 | 画面上有没有可见像素变化 |
| 聚合稀释 | **有**：`#root` 级判定会被「一棵树在动」掩盖整棵静止子树 | 无：按像素面积统计 |
| 离屏误判 | **有**：按 scene 内选择器判定时，已离屏元素仍被算进静止窗 | 无：只看画面 |
| 抓「首帧空」 | **能**：`appearsBy(hero, 0)` 报 `motion_appears_late` | **能**：首帧主体占比 / 唯一色 |

→ 两者**都必须有**：官方 sidecar 负责「时序意图」，像素量测负责「画面实感」。

### 4.3 决定性实验：官方 `*.motion.json` sidecar 能否抓出这些缺陷

**背景**：`vendor/skills/hyperframes-cli/references/lint-validate-inspect.md:78` ——「Drop a `*.motion.json` sidecar next to the composition. `check` discovers it automatically... **With no sidecar, `check` behaves exactly as before.**」

**实测：无 sidecar 时官方 `check --json` 的 motion 段是关闭的**：

```json
"motion": { "ok": true, "errorCount": 0, "findings": [], "enabled": false, "samples": 0 }
```

→ **本仓从未生成 sidecar ⇒ 官方 motion 校验 0 覆盖。**

**实验**：把本仓规则书翻译成官方 sidecar，对已交付成片实跑 `check --json --samples 15`。

**实验 A（能力探测）** → 命中 1 条：

```json
{ "code": "motion_appears_late", "severity": "error", "time": 0.149,
  "selector": "#m01-card",
  "message": "appears at 0.15s but should be visible by 0s (check its entrance reveal fires under seek)" }
```

- ✅ **官方 sidecar 能表达并强制「首帧/hero 早可见」**——正是我方首帧近乎纯色那个缺陷。
- `appearsBy(#m01-card, 0.5)`、`before`、`staysInFrame` 全部 PASS。

**实验 B（阈值敏感度）** → 命中 2 条：

```json
{ "code": "motion_frozen", "severity": "error", "time": 1.892,
  "selector": "#m01-stage",
  "message": "nothing moves within #m01-stage between 1.89s and 3.39s (1.49s static) — should keep moving" }
```

- ✅ **1.49s 静止窗与像素探针的 1.5s 完全吻合**——两个独立方法互证。
- ⚠️ 但**默认 `maxStaticSec = 2`（官方 `DEFAULT_MAX_STATIC_SEC`，cli.js:157578）不触发**；必须显式调到 < 1.49 才会红。
- ⚠️ **聚合稀释**：`withinSelector: "#root"` 在同样严格阈值下**不触发**——一个活跃子元素会掩盖整棵静止子树。
- ⚠️ **假阳性**：用 scene 内选择器（`#m01-stage`/`#m01-card`）时，官方把**已离屏元素**也算进「静止窗口」，报出的 1.89→3.39s 其实是第二帧的时间段。→ 选择器必须与**在屏时间窗**对齐。

### 4.4 官方 `animation-map.mjs` 的判据被本仓丢弃

`vendor/skills/hyperframes-animation/scripts/animation-map.mjs`（659 行）产出 `choreography / density / staggers / elements / deadZones / snapshots`，源码内阈值：

| 判据 | 阈值 | 位置 |
| --- | --- | --- |
| 死区 | `zoneEnd - zoneStart >= 1.0`（s） | :439-475 |
| stagger 漂移 | 30% | — |
| `endsVisible` | opacity > 0.1 | — |
| tween flags | `degenerate` / `offscreen` / `invisible` / `paced-fast`(0.2s) / `paced-slow`(2.0s) / `collision`(30%) | — |

**但**：`scripts/gate.mjs:331-355` **只验文件存在且非空**，全部结论丢弃；且该脚本**恒 exit 0、无 verdict、无 severity**；官方 prose 文档**零记录任何阈值**。

→ 「哪个 flag 该阻断」属**本仓自定政策**，必须写进规则，不能默认全收或全不收。

**互补性实测**：`findDeadZones` 数的是「补间是否存在」，不是「像素是否变化」。帧 1 能拿到「无 dead zone」绿字，而像素上 88% 静止——**两者互补，不可互替**。

### 4.5 官方 `check --json` 信封被丢弃

官方信封含 `lint`（97 个规则码：65 error / 29 warning / 3 动态）、`runtime`、`layout`（15 码）、`motion`（6 码）、`contrast`，每条 finding 带 `severity / selector / bbox / sourceFile / time / fixHint`。

**本仓 `gate.mjs:362` 跑 `check --strict` 却只看退出码**——问题定位信息（哪个元素、哪个时间点、怎么修）全丢，用户只看到一个非零退出码。

**坑**：`check --json` 不落盘，必须捕获 stdout；且 lint 有 error 时会**短路整个浏览器阶段**（cli.js:160349-160351）→ 想同时拿 lint 与 layout/motion/contrast 需跑两次。

### 4.6 官方阈值常量（实测取值，供方案标定）

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `DEFAULT_MAX_STATIC_SEC` | 2 | cli.js:157578 |
| `MOTION_FPS` | 20 | cli.js:158167 |
| `MOTION_MAX_SAMPLES` | 300 | cli.js:158168 |
| `SWEEP_STATIC_MIN_DURATION_SEC` | 3 | cli.js:160705 |
| `CONTENT_OVERLAP_HELD_ERROR_MS` | 500 | cli.js:157365 |
| 官方 `check` 默认采样 | `--samples 9` | — |
| 官方 `check` 判定 | `ok = errorCount === 0 && (!strict \|\| warningCount === 0)` | cli.js:160504 |

### 4.7 场景对账原型（已实测，PASS 但**会假绿**）

`.skillhub-pkg/envcheck/scene_reconcile.py`：解析 `STORYBOARD.md` 的 `Scene N (a–b)` 时间区间（**本仓已有真源，可机器解析**）与成片逐帧变化面积对账。

| 对象 | 结果 |
| --- | --- |
| 真实成片 | 4/4 场景「有变化」→ **PASS** |
| 纯黑空壳 | 4/4 无变化 + 3.367s 长静止 → **FAIL**（不恒绿 ✅） |

**但**：真实片在像素上是 88% 静止，**粗粒度场景对账却给绿** → 粗对账**太粗会给假绿**，必须叠加帧级静止占比 / 最长静止段 / 首帧可辨认度。

**阈值敏感度**：真实片在变化面积阈值 0.002–0.01 下 PASS，**≥0.02 翻转 FAIL** → 判别余量窄，**阈值必须用基线校准**，不能拍脑袋。

### 4.8 官方可机器化质量信号盘点结论

| 信号 | 状态 | 可否作为门禁 |
| --- | --- | --- |
| `check --json` 全信封 | ✅ 可解析 | ✅ 应接入（带 finding 归因） |
| `*.motion.json` sidecar | ✅ 可用，需手写 | ✅ **最高性价比** |
| `animation-map.mjs` 判据 | ✅ 已产出但被丢弃 | ⚠️ 需本仓定政策 |
| `transitions.mjs verify` | ✅ 真门禁（exit 0/1） | ✅ 已是 |
| `keyframes --json` / `compare --json` | ❌ 无判据（纯描述） | ❌ |
| `catalog --json` | ❌ 只有清单，无质量字段 | ❌ |
| 像素级成片质检 | ✅ 本轮自建可用（numpy+PIL） | ✅ 需基线校准阈值 |

### 4.9 质量链路的「失效点」总结

```
官方 check --json  ──→ 本仓 gate.mjs:362 只看退出码  ──→ 结论丢弃
官方 animation-map ──→ 本仓 gate.mjs:331 只看存在非空  ──→ 结论丢弃
官方 motion sidecar ──→ 本仓从不生成              ──→ 阶段 enabled:false
官方 sweep_static   ──→ 只在 3s+ 且零变化才触发    ──→ 对 PPT 式分段片不敏感
```

**四条路全部断在同一处：本仓把官方的「结论」当成「文件存在」来验收。**

---

## 5. 优化方案

### P0 — 阻断修复（不做则 Windows 不能生产）

| # | 改动 | 文件 | 工作量 | 验收标准 |
| --- | --- | --- | --- | --- |
| P0-1 | node 实参套 `native_path` | `scripts/doctor.sh:25` | 5 min | 登录/非登录 shell 两种调用输出**逐行一致**，exit 码一致 |
| P0-2 | source `platform-compat.sh` + 全路径转换 | `scripts/install-skill.sh` | 15 min | 登录 shell 下安装成功；产物与 `.skillhub-pkg/` 逐字节一致 |
| P0-3 | `find -print0` / `sort -z` / `xargs -0` | `scripts/bootstrap.sh:87` | 10 min | 含空格路径的 vendor 目录能聚合哈希；失败时**有错误输出** |
| P0-4 | CI 装 ffmpeg + `makeTinyMp4` 缺失守卫 | `.github/workflows/ci.yml`、`tests/pipeline-e2e.test.mjs:59` | 20 min | `test-windows` job 首次全绿（含 e2e 用例真实执行，非 skip） |
| P0-5 | 提交 `.gitattributes` + `ci.yml` | — | 5 min | 干净克隆后 `git config core.autocrlf` 任意取值，行尾均为 LF |
| P0-6 | `state.mjs` 时长改用 `readStoryboard` 结构化解析 | `scripts/state.mjs:169-179` | 30 min | 全角冒号 / 多余 bullet / 帧块外 bullet 三用例，结果与 `gate.mjs` 一致 |

### P1 — 质量门禁补齐（本轮建议的核心增量）

| # | 改动 | 依据 | 工作量 | 验收标准 |
| --- | --- | --- | --- | --- |
| P1-1 | 接入官方 `check --json` 信封，输出**归因级**错误（selector + 时间 + fixHint） | §4.5 | 1.5 h | 故意制造一个 layout 错误，门禁输出能指出元素与时间点，而非仅非零退出码 |
| P1-2 | 新增 **motion sidecar 生成器**：由 `STORYBOARD.md` 的 Scene + 帧内关键 id 自动生成 `*.motion.json`（`appearsBy` / `before` / `staysInFrame` / `keepsMoving`） | §4.3 实验 A | 3 h | 对交付段生成 sidecar 后 `check --json` 的 `motion.enabled == true` 且 `samples > 0`；对**空壳段**必须报 `motion_frozen` 或 `motion_appears_late` |
| P1-3 | `keepsMoving` 阈值与选择器策略写入规则：**按 Scene 生成、不跨离屏时间窗**；`maxStaticSec` 需**基线校准**后定值（官方默认 2 过松） | §4.3 实验 B | 1 h | 实测：真实片在选定阈值下红/绿符合预期；**root 级聚合不用于放行判定** |
| P1-4 | `animation-map` 从「验存在」升级为**内容断言**（deadZones / stagger 漂移 / endsVisible / tween flags），并在本仓规则里写明「哪些 flag 阻断、哪些仅告警」 | §4.4 | 3 h | 人为造一条 degenerate tween → 门禁红；正常片 → 绿 |
| P1-5 | 新增**像素级成片质检门禁**：首帧可辨认度（唯一色数 / 主体面积占比）、帧级静止占比、最长静止段、场景对账 | §4.2 / §4.7 | 4 h | **双对照必须成立**：纯黑空壳 → FAIL；当前成片 → FAIL（它确实 PPT 化）；已知合格片 → PASS |
| P1-6 | 判别力/变异验证纪律：新门禁必须同时跑「空壳必 FAIL」+「已知好片必 PASS」，否则不合并 | §4.7 假绿教训 | 1 h | 每个新门禁在 `tests/` 里有对照用例 |

> **P1-5 的阈值目前不能拍脑袋**——真实片在 0.002–0.02 之间翻转，余量窄。需要先采集若干「历史合格片」建立基线，或用**相对判据**（如「最长静止段 ≤ 时长 × 0.4」）替代绝对阈值。

### P2 — 成片质量提升（按证据排序）

| # | 改动 | 证据 | 工作量 |
| --- | --- | --- | --- |
| P2-1 | 首帧必须已有可辨认主体（hero 在 t=0 可见）——写进规则书并由 P1-2 的 `appearsBy(..., 0)` 强制 | §4.3 实验 A 直接命中 | 规则 0.5 h |
| P2-2 | 揭示铺满全时长（禁 front-load）；每段至少一个持续活跃元素 | §4.2 静止 88.1% / PPT 98.7% | 规则 0.5 h + 模板改造 |
| P2-3 | 分段长度对齐规则书节奏 8–12s（当前测试段 3.4s 是验证用短片，不是产品形态） | §4.1 | 0.5 h |
| P2-4 | 帧 worker 产出前增加「首帧预览」自检（frame-worker 交付物必须含 t=0 截图） | §4.3 | 1 h |

### P3 — 文档一致性收敛

按 §3 的 D-1 ~ D-12 逐条修，**并同步 README.md / README.en.md / SKILL.md 三处副本**。重点：

- D-3：README「3 项」→ 与 §3.1 实际条数一致（**这是用户可见的错误承诺**）。
- D-4：faq 内部矛盾 + issue 模板照抄了错误命令（**会把用户带进坑**）。
- D-5：统一 Python 解释器环境变量名（`MINIMAX_PYTHON` 与文档一致，或文档改齐）。
- D-8：`.minimax/skills/zwhyperframes-harness/` 副本漂移——建立**同步机制**而非手工拷贝，否则下次 bootstrap 又是旧版。

### P4 — 流程与发布

- 提交暂存区 51 个文件（P0/P1 完成后一并 commit）。
- 在真实 runner 跑一次 `test-windows` 并回填报告 §6.1。
- macOS / Linux 回归（§6.5）。

---

## 6. 需要用户拍板的事项

1. **`.minimax/skills/zwhyperframes-harness/` 副本漂移**（D-8）：本机实际加载的是**不带成片内容门禁的旧版**。是否授权我重建该副本并建立自动同步？
2. **官方 animation-map 的哪些 flag 阻断**（P1-4）：阈值只在官方源码里、官方 prose 零记录、脚本恒 exit 0 —— 这是本仓的政策选择，我建议：`degenerate` / `offscreen` / `invisible` → 阻断；`paced-fast` / `paced-slow` / `collision` → 告警（与视觉质量底线挂钩）。请确认或改。
3. **像素质检阈值**（P1-5）：当前无「已知合格片」基线。选项：(a) 先做相对判据（静止占比、最长静止段占比），(b) 你提供几支历史合格片做基线校准，(c) 先只上线首帧可辨认度 + 场景对账两项。
4. **上一轮遗留未拍板 4 项**：`~/.mmx/config.json` 是否作第三凭证源；Windows 补丁是否上提上游；CI 真实跑 `test-windows` 回填报告；macOS/Linux 回归。
5. **是否 commit**：当前 51 文件仅 `git add` 未 commit，本轮我未做任何改动。

---

## 7. 未核实 / 需实测

| 项 | 状态 |
| --- | --- |
| macOS / Linux 实跑 | 未实测（推断「无独有缺陷」） |
| 真实 CI runner 上 `bash` 解析顺序（Git Bash vs WSL 存根） | 未实测 |
| macOS 12 的 git 2.30 是否支持 `sparse-checkout set --no-cone --stdin` | 推断支持，未实测 |
| 官方 `animation-map.mjs` 在真实段上的实跑 | 未跑（需联网 bootstrap `@hyperframes/core` / `@hyperframes/producer`，本机 `node_modules` 无 scoped 包） |
| 官方 `check --json` 的 layout/motion/contrast 在**lint 不过**时的输出 | 未实测（官方 lint error 会短路浏览器阶段） |
| 官方版本落后 | `_meta.latestVersion = 0.8.223`，本仓锁定 `0.8.36`（差 187 个补丁版本）；`updateAvailable: true`。锁定是刻意的（上游 2026-10-21 撤下 workflow 类 skills），但**落后是否带来已知回归未核实** |

---

## 8. 第三轮实施结果（2026-10-31）

本轮从「只读评估」转为「评估 + 实施」。本节记录**实际落地的内容**与**实测证据**，并保留仍未闭合的项。

### 8.1 总约定：仓库内路径一律相对仓库根

原生程序（node / git / npm）在 Windows 上不认 MSYS 的 POSIX 绝对路径，而**登录 shell 预置 `MSYS_NO_PATHCONV=1`** 把参数转换关掉——同一份脚本在 `bash -c` 下正常、在 `bash -lc` 下整份失效。相对路径既不带盘符也不以 `/` 开头，任何形态下都不会被改写。

- 形态：「先 cd 到仓库根、再用相对路径」，由 `scripts/platform-compat.sh` 的 `hf_node()` / `hf_cli()` 固化。
- 仓库**外**路径（用户发现目录、产品段目录、临时目录）无法相对表达，那一类仍走 `native_path()`。
- 回归锁：`tests/platform-paths.test.mjs` 含一条**结构式守卫**——仓库内脚本不得把 MSYS 绝对 POSIX 路径直接交给原生 node。

### 8.2 P0 阻断修复（全部实测坐实）

| 项 | 证据 |
| --- | --- |
| `doctor.sh` 登录 shell 丢结论 | 修前 `Cannot find module 'D:\d\AI-Trae\...\doctor-report.mjs'`；修后登录/非登录输出**逐行一致**，18 行全绿 exit 0 |
| `install-skill.sh` 登录 shell 中止 | 修前 `MODULE_NOT_FOUND` + `set -e` 中止；修后登录/非登录均 exit 0（965 文件） |
| `bootstrap.sh` vendor 哈希按空白切词 | 改用 `find -print0 \| sort -z \| read -d ''`（新 `scripts/lib/tree-hash.sh`），并去掉哈希里的绝对路径成分 |
| CI `test-windows` 第一步就红 | `windows-latest` 实测**不自带 ffmpeg**；改 `choco install ffmpeg` + `makeTinyMp4` 缺 ffmpeg 守卫 |
| `state.mjs set-mp4` 时长校验 fail-open | 改走结构化解析 `storyboardDurationFacts`；「有 duration 行却解析不出数字」由静默跳过改为显式失败 |
| 打包清单自指增长 | `.skillhub-pkg.manifest.json` 曾被自己打进包（曾致 480262 B 超限）；已排除 + ignore |
| 副本漂移（D-8） | `install-skill.sh` 改为**就地同步**（包内覆盖 / 包外残留删除 / `node_modules`·`vendor` 原地保留），副本已同步到最新 |

**为什么改就地同步**：Windows 上**被进程持有句柄的目录不能重命名**（`MoveFileEx` → `ERROR_ACCESS_DENIED`）。实测装好的技能目录整棵 `mv` 失败，而同样内容重新 `cp` 一份就能 `mv`——失败的是「那一份被占用的旧树」，不是内容。

### 8.3 P1 质量门禁（新建，均做判别力双对照 + 变异验证）

| 门禁 | 文件 | 阻断级判据 | 告警级判据 |
| --- | --- | --- | --- |
| 官方 motion 真跑 | `scripts/lib/motion-spec.mjs` | 缺 hero / 多 hero / id 跨帧重复 → **fail-closed**；`motion.enabled=false` 直接判失败 | — |
| check 归因 | `scripts/lib/check-envelope.mjs` | 官方信封有 error | 逐条打印 selector / 时间点 / 源文件 / fixHint |
| animation-map 内容 | `scripts/lib/animation-map.mjs` | `degenerate` / `invisible` / 死区 ≥1s | `offscreen` / 节奏类 flag / stagger 不一致 / front-load |
| 成片像素质检 | `scripts/lib/pixel-quality.mjs` | 首帧可辨认度（非背景 ≥0.5%、唯一色 ≥3）；Scene 区间内画面必须变化（末帧末段豁免） | 静止占比 / 末尾死区 / front-load（**无历史合格片基线，故只告警并打印数值**） |

**阈值两档制的理由**：判据无歧义且规则书有明文依据的 → 阻断；依赖「什么样算好片」且**无合格片基线**的 → 只告警并打印数值，基线建立后再升级为阻断。

**hero 声明用 HTML 属性 `data-motion-role="hero"`**（不是 STORYBOARD 字段）：帧 worker 才知道哪个是主体，且与元素共址、无 id 错配风险。

**变异验证**（撤掉修复当场变红）：
1. 把 `doctor.sh` 改回绝对路径 → `tests/platform-paths.test.mjs` 3 个用例变红。
2. 在真实交付段把主体 opacity 改回 0 → `gate check` 报 `[error] motion/motion_appears_late · #m01-card · @compositions/frames/01-opening.html · t=0.149s` + 官方 fixHint。

### 8.4 交付段端到端闭环（真实证据）

段 `win-e2e-verify/01-开场`：两帧加 `data-motion-role="hero"`，入场动画改为「主体首帧即可见」（去掉 opacity 淡入与画外滑入）。

- `gate motion-spec` → 生成官方 sidecar：`appearsBy(#m01-card, bySec 0)`、`appearsBy(#m02-row, bySec 2.361)`、`staysInFrame` ×2、`before(#m01-card,#m02-row)`，duration 3.386s。
- `gate check` → **官方 motion 阶段真的跑起来**（69 次采样）且通过。
- `gate quality` 对照：旧片 **FAIL**（首帧非背景 0.000%、唯一色 2）→ 新片 **PASS**（首帧唯一色 110、非背景 5.46%、静止 13.9%、最长静止 0.167s、4 个 Scene 区间）。
- `gate animation-map --generate` → 调用官方脚本生成产物（36 个补间 / 0 个死区 / 4 组 stagger），内容断言通过。

### 8.5 本轮新发现的缺口：官方 skill 脚本的依赖与版本

官方 `animation-map.mjs` **自带依赖解析**：它要 `@hyperframes/producer` 与 `@hyperframes/core`，而这两个**不在** hyperframes CLI 包里（实测只装 CLI 时 `node_modules/@hyperframes` 根本不存在）。官方 loader 的两条退路都不可接受：

- 缺包时装到 tmp 目录、跑完即删 → **每跑一次 animation-map 就重下 ~100MB**；
- 推不出版本时**默认用 `@latest`**（只打印一行 stderr）——实测上游 latest 已是 0.8.223，与锁定值差 187 个补丁版，且**静默**。根因：官方靠自身所在目录的祖先链里名为 `hyperframes` / `@hyperframes/cli` 的 `package.json` 推断版本，本仓包名是 `zwhyperframes-harness`，推断必然落空。

处置（`scripts/lib/official-deps.mjs` 为唯一真源）：

- `bootstrap.sh` 按锁定版本装进**仓库** `node_modules`：`--no-save --no-package-lock --ignore-scripts`（不进 `package.json`、不动锁文件、不执行生命周期脚本——puppeteer 因此不会下载第二份 Chromium，浏览器用官方 CLI 缓存的 `chrome-headless-shell`，实测 `HeadlessChrome/152.0.7977.30` 可用）。传递依赖逐个钉版本——producer 声明 `^0.8.36`，实测 `@hyperframes/engine` 会飘到 0.8.223。
- `hf-env.sh` 导出 `HYPERFRAMES_SKILL_PKG_VERSION=0.8.36`，官方 loader 从此没有 `@latest` 退路。
- `gate animation-map --generate`：产物缺失时先调用官方脚本再断言（cwd 固定为段目录、传绝对 `--out`）。
- 回归锁 `tests/official-deps.test.mjs`（7 例）含**双对照**：不钉版本时官方 loader 确实返回 `@hyperframes/core@latest`（危险真实存在），钉死后必须返回精确版本。

### 8.6 打包体积口径：此前是「打包过、发布必失败」

本轮在跑测试时撞上的**真实阻断**（`tests/platform-paths.test.mjs` 的 install-skill 用例）：包体超限。追下去发现不止是「大了」：

| 事实 | 证据 |
| --- | --- |
| 两道体积闸口径不同 | `build-skill-package.mjs` 按**文件字节和**判（线 470KB）；`publish-skillhub.mjs` 按**真实 multipart 请求体**判（线 460KB） |
| 请求体比文件字节和大十几 KB | 实测：47 文件 / 文件字节和 451.2KB → 真实请求体 **466.5KB**（multipart 头 7.4KB + changelog 字段 7.9KB + 其它字段 0.6KB） |
| **上一轮的包根本发不出去** | 上一轮包体 469304 B → 请求体 ≈ 484KB > 发布闸 471040 B → **发布干跑必然失败** |
| changelog 字段没有上限 | 它是请求体里的字段不是包内文件；发布新版本时它会变成新版本的整节说明（当前「未发布」节 30KB 量级）→ **超限被留到上线那一刻** |

这正是本仓 2026-10-24 审计里的 M-21「构建通过不代表可发布」，上一轮只改了数字没改口径。

**处置**（`scripts/lib/package-limits.mjs` 为唯一真源）：
- 打包期按**估计的请求体**判（fail-closed，不产出超限包）；估计必须用**写盘后的字节**（`package.json` 在包内会被改写）。
- 发布期用**真实 body** 判，并与估计值**对账**；不等即拒发（估计函数漂了就拒发，而不是放行一个「本地过、线上炸」的包）。
- changelog 字段截断到 8KB 并**显式标注**（静默截断会让人以为看到的是全文）。
- 分发侧工具链（`build-skill-package.mjs` / `install-skill.sh` / `lib/changelog.mjs` / `lib/package-limits.mjs`）整组出包——**消费者是为了跑 harness 干活，不是为了再打包再发布**；包内 `package.json` 同步剥掉指向它们的 npm script。
- 端到端走查（`references/walkthrough.md`）及其示例输入出包：它们是「照抄一遍完整流程」的教学材料，仓库里随时可查；包内保留运行与排障所需的 faq / commands / rules。
- MiniMax 的第三方 API 参考文档与请求样例出包：运行时**不读**它们。

**同时纠正一次误判**：我一度以为打包排除逻辑对 `docs/architecture/` 失效（只按精确路径匹配、嵌套文件没排除），并「修」了它——那其实是个**回归**：原逻辑在**目录条目**这一层就排除了，walk 不再递归，里面的文件自然一个都不进包。逐级前缀匹配写成 `<` 上界后语义才既正确又显式。

**当前包体**：43 个文件 / 文件字节和 441.8KB / **请求体 457.4KB**（发布闸 470KB，服务端实测上限约 476KB：475KB 可通过、480KB 被断开）。锁文件实测**不能丢**：去掉后重新解析，189 个传递依赖里有 **23 个会漂**（含渲染用的 `puppeteer-core` 25.10.0 → 25.16.0）——那正是本仓要消灭的静默漂移。

### 8.7 规则书与文档

- `docs/rules/production-workflow-rules.md`：§3 能力编号重编 **1–13**（消除两个 `#7`）；新增 **§3.6 成片视觉质量门禁**（三道门 + 阻断/告警分档 + 阈值无基线的诚实声明）。
- `docs/rules/visual-production-rulebook.md` §2 新增「主体必须可机器定位」（`data-motion-role="hero"`，缺声明 fail-closed）。
- README.md / README.en.md / SKILL.md / references/{commands,faq}.md / AGENTS.md / CHANGELOG{,.en}.md 全部同步（能力项数、门禁命令、退出码口径、相对路径总约定、依赖钉死）。
- 分发包内容边界写进 `references/faq.md` 新增 §1.7（包内有什么 / 没有什么 / 为什么）与 `references/commands.md` 新增 §6（打包与发布的命令契约、失败含义）；`SKILL.md` 的体积描述从「总包 ≤460KB（服务端实测上限）」纠正为「按真实 multipart 请求体判、发布闸 470KB、服务端实测上限约 476KB」——前者是本轮评估里 D-11 记的文档与代码口径不符。
- 测试数声明同步：89 → **113**（README 中英徽章与正文、SKILL.md 正文三处）。

### 8.8 本轮仍未闭合 / 未闭合项

| 项 | 状态 |
| --- | --- |
| macOS / Linux 实跑 | **未实测**（推断「无独有缺陷」） |
| 真实 CI runner 上 `bash` 解析顺序 | **未实测** |
| macOS 12 的 git 2.30 是否支持 `sparse-checkout set --no-cone --stdin` | 推断支持，**未实测** |
| 官方 `check --json` 在 lint 不过时 motion/layout/contrast 数据为空 | 已知官方行为（lint 先短路浏览器阶段），本仓靠「lint 先过」规避，**未做双跑** |
| 官方版本落后 187 个补丁版本（0.8.36 vs 0.8.223）的影响 | **未核实**（锁定是刻意的：上游 2026-10-21 撤下 workflow 类 skills） |
| 完整 preflight 链在交付段上跑通 | **未闭合**：官方 animation-map 产物是否被 final-look receipt 绑定、帧已改动后能否重签，尚未验证 |
| 分发包体积 | 当前 43 个文件 / 文件字节和 441.8KB / **请求体 457.4KB**（发布闸 470KB，服务端实测上限约 476KB）。口径已统一为「按真实请求体判」，见 §8.6 |

---

## 附录 A：可复现命令

```bash
# 登录 vs 非登录 shell 的路径转换差异（关键）
bash -lc 'echo $MSYS_NO_PATHCONV'    # → 1
bash -c  'echo $MSYS_NO_PATHCONV'    # → 未设

# 两处阻断
bash scripts/doctor.sh               # 非登录：全绿 exit 0
bash -lc 'scripts/doctor.sh'         # 登录：MODULE_NOT_FOUND，结论全丢

# xargs 切词
find "$d" -type f -print | sort | xargs cat            # 失败
find "$d" -type f -print0 | sort -z | xargs -0 cat     # 正确

# 官方 motion 阶段默认关闭
node node_modules/hyperframes/bin/hyperframes.mjs check "<段目录>" --json --samples 15
# → "motion": { "enabled": false, "samples": 0 }

# 官方 check --json 不落盘，必须捕获 stdout
```

## 附录 B：本轮新增审计工具（均在 gitignore 的 `.skillhub-pkg/envcheck/`）

| 文件 | 用途 |
| --- | --- |
| `quality_probe.py` | 成片像素质量量测（静止占比 / 最长静止段 / 首帧可辨认度 / PPT 风险） |
| `scene_reconcile.py` | `STORYBOARD.md` ↔ render 场景对账 |
| `sweep.py` | 阈值敏感度扫描 |
| `duration-parse.mjs` / `duration-parse2.mjs` | 两套时长解析分歧实测 |
| `count-tests.cjs` | 用例计数（与 `docs-links.test.mjs` 同口径） |
| `shell-black.mp4` | 纯黑对照组 |
| `check.json` / `check-motion.json` / `check-motion2.json` | 官方 `check --json` 三次实跑证据（无 sidecar / 能力探测 / 阈值敏感度） |
