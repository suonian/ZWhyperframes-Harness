[English](CHANGELOG.en.md) | **中文**

# 更新日志

本项目的版本记录 notable changes。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> ⚠️ **HyperFrames 版本锁定**：`0.8.36`。升级不是版本号的改动，而是**合同审计**任务——官方 skill 内容随上游 commit 一并变动，而本仓规则直接引用其原文。

## [0.2.10] — 2026-11-01

**A1 集成分支**：以 `v0.2.9`（`53c456c`）为主干，吸收 `feat/visual-baseline-and-windows-hardening` 的 Windows 平台修复、视觉基线门禁、成片质量门禁与全套测试，同时保留 main 的最终交付契约、frame 工具（`frame-guard` / `css-selector-audit`）与 `creative-mode-zh` preset。**默认视觉基线 = 官方 `capsule` + `Noto Sans SC`；`creative-mode-zh` 降为显式可选 preset（不再强制）。** 只允许有一套默认政策——本版起「必须 creative-mode-zh」的表述全部撤销。

### 分发与体积（460KB 安全线）

- 集成版实测：**48 个文件 / 文件字节 405.1KB / 请求体 421.6KB**（自设安全线 460KB，余量 38.4KB）。发布闸的**常量不动**（仍是服务端实测上限 476KB，那是事实值）；压下去的是内容，不是线路。
- **`package-lock.json` 不再入包（-93.9KB）**：它是消费者「不装也能跑」的唯一大文件——`bootstrap.sh` 用的是 `npm install`（非 `npm ci`），CLI 版本由 `package.json` 精确钉死 `0.8.36`，官方 skill 的 helper 依赖由 `scripts/lib/official-deps.mjs` 在 bootstrap 期逐个钉死；仓库与 CI 仍保留并使用该锁（`npm ci` + 可复现构建）。
- **为什么不按「FAQ 出包 + preset repo-only」走**：两步都做了也只到 **479KB 请求体，仍破 460KB 线**（实测数字：508,587 → 462,379 文件字节 + 17KB 请求体开销）。而再砍就只能动规则文档（`docs/rules/` 是产品骨架）。相比之下移出锁文件既满足 460KB，又保住了 FAQ、`creative-mode-zh` preset 与全部规则文档——这是体积约束下伤害最小的一刀，且**没有**动门禁常量。
- `frame-guard.mjs` / `css-selector-audit.mjs` 继续 repo-only（开发期预筛工具，不进包、不接入 `gate preflight`）。

### 变更
- **模板 / 调色板 / 音色基线落地（用官方的那套，不造自己的）**：本轮先做了**官方资产盘点**再动手——确认 HyperFrames **自带** 13 套 frame preset（`hyperframes-creative/frame-presets/`，每套含 `FRAME.md` + showcase + caption skin）、自带品牌 remix（`build-frame.mjs --tokens` 按角色映射）、自带配方冻结（`recipe.mjs freeze/use` → `~/.media/recipes/`）与偏好记忆（`prefs.mjs`）。用户自建的那套**真实存在**，且经比对就是**官方 `capsule` preset 的 CJK remix**（13 个 colors 键值逐字相同，仅字体从 Bodoni Moda + Space Grotesk 换成 Noto Sans SC）——**不是另一套体系**。因此本仓**不建** `brand/` 色板副本（那是第二真源，换项目必漂），改为新增 `docs/rules/visual-baseline.md`：只声明「本项目默认 `capsule` + `Noto Sans SC`」，并写明这是**偏好不是排他**——13 套 preset 全部合法可用，用户指名就照用，官方 13/13 preset 明写的 `≥1.4cqw` 与 px-chrome 条款本仓**不与官方对撞**，只把项目级下限收紧到 28px。
- **新增视觉基线门禁 `gate.mjs baseline`**（官方不覆盖处才补）：官方 `check` 只做 WCAG 对比度与几何判定，**不查色板归属、不查项目级字号下限、不查音色一致性**。新门禁判四件事——① 帧内颜色不越出 `frame.md` 的 `colors:` 声明；② 帧内承载性字号 ≥28px（官方 chrome 令牌豁免）；③ `frame.md` 承载性 px 令牌自身 ≥28px（基线自检）；④ 段内 TTS manifest 的 `voice_profile` 与真源一致。已接入 `preflight` 链。
- **音色真源单一化**：音色参数原本只写在 `tools/minimax/scripts/minimax_tts.py` 的 `VOICE_PROFILE` 里，规则层零声明、也无法核验。现给 Python 加只读出口 `--dump-voice-profile`，门禁**直接问真源**而不是复制常量（复制就有两份真源，改一处忘另一处会让门禁拿旧值判绿）；同时把 Python 解释器解析上移到 `scripts/lib/python-runtime.mjs` 供 TTS 与门禁共用，避免两处漂移。
- **官方 skill 脚本的依赖与版本钉死**（本轮补上的真实缺口）：官方 `animation-map.mjs` **自带依赖解析**——它要 `@hyperframes/producer` 与 `@hyperframes/core`，而这两个**不在** hyperframes CLI 包里（实测只装 CLI 时 `node_modules/@hyperframes` 根本不存在）。官方 loader 的两条退路都不可接受：缺包时装到 tmp 目录、跑完即删（**每跑一次 animation-map 就重下 ~100MB**）；推不出版本时**默认用 `@latest`**（只打印一行 stderr——实测上游 latest 已是 0.8.223，与锁定值差 187 个补丁版，且**静默**）。根因是官方靠自身所在目录的祖先链里名为 `hyperframes` / `@hyperframes/cli` 的 `package.json` 推断版本，本仓包名是 `zwhyperframes-harness`，推断必然落空。现由 `scripts/lib/official-deps.mjs` 统一钉死：`bootstrap.sh` 按锁定版本把依赖装进**仓库** `node_modules`（`--no-save --no-package-lock --ignore-scripts`：不进 `package.json`、不动锁文件、不执行生命周期脚本——puppeteer 因此不会下载第二份 Chromium，浏览器用官方 CLI 缓存的 `chrome-headless-shell`），传递依赖逐个钉版本（producer 声明 `^0.8.36`，实测 `@hyperframes/engine` 会飘到 0.8.223）；`hf-env.sh` 导出 `HYPERFRAMES_SKILL_PKG_VERSION=0.8.36`，官方 loader 从此没有 `@latest` 退路。
- **`gate animation-map --generate`**：产物缺失时先调用**官方**脚本生成、再做内容断言（cwd 固定为段目录并传绝对 `--out`，绕开官方「`--out` 相对 cwd 解析」的坑）。此前干净克隆上 `gate animation-map` 根本无法按文档流程被满足。
- **打包与发布的体积口径统一成一套（此前是「打包过、发布必失败」）**：此前 `build-skill-package.mjs` 按**文件字节和**判、线在 470KB，而 `publish-skillhub.mjs` 按**真实 multipart 请求体**判、线在 460KB——请求体比文件字节和多十几 KB（multipart 头 + changelog 字段 + 其它字段），于是能产出「本地通过、发布必失败」的包。实测：47 个文件、文件字节和 451.2KB 时，真实请求体 466.5KB，**上一轮的包过不了发布闸**。现由 `scripts/lib/package-limits.mjs` 收口：打包期按**估计的请求体**判（fail-closed，不产出超限包），发布期用**真实 body** 判并与估计值**对账**，不等即拒发（估计函数与真实构造漂了就拒发，而不是放行一个「本地过、线上炸」的包）。这正是本仓 2026-10-24 审计里 M-21 记的那条「构建通过不代表可发布」。
- **发布闸从 460KB 提到 476KB（且改判「请求体」）**：请求体体积现在是**确定性**算出来的——打包期按同一套算法估、发布期用真实 body 复核，两者不等即拒发。「防止服务端静默断连」这个目的已由**打包期就拒绝产出**达成，不再需要靠一条比实测值低 15KB 的线兜底；而 475KB 是**实测能通过**的，任何 ≤475KB 的请求体都可证明安全，故闸值取**服务端实测上限** 476KB（几乎不留隐藏余量：超线即打包 fail-closed 并直接告知「内容超了，请处置」，不会发布到一半被服务端静默断开）。处置顺序是固定的：**① 扩排除清单 → ② 把长文档拆到仓库 → ③ 才谈调上限**。本轮 ①②已做完（分发侧工具链、MiniMax 参考文档、端到端走查及其示例输入整组出包，合计让出约 46KB；另把完整 FAQ 与分发契约拆到 `docs/architecture/`），但**视觉基线能力**（新增规则书 + 门禁 + 判定库约 33KB）走完前两步仍超 470KB，故闸值最终从 470KB 提到实测上限 476KB。
- **changelog 字段有上限了**：它是请求体里的一个**字段**（不是包内文件），大小由仓库的 `CHANGELOG.md` 决定——发布新版本时它会变成新版本的整节说明（本仓当前「未发布」节就有 30KB 量级），不设上限等于把超限留到上线那一刻。现截断到 8KB 并**显式标注**（静默截断会让人以为看到的是全文）。
- **分发侧工具链整组移出分发包**：`build-skill-package.mjs` / `install-skill.sh` / `lib/changelog.mjs` / `lib/package-limits.mjs` —— **消费者装上技能是为了跑 harness 干活，不是为了再打包、再发布一次**；包内 `package.json` 同步去掉指向它们的 npm script（此前只剥了 `publish-skill`）。
- **端到端走查移出分发包**：`references/walkthrough.md` 及其示例输入是「照抄一遍完整流程」的教学材料，在 GitHub 仓库里随时可查；包内保留的是**运行与排障**所需的 `references/faq.md`（按症状索引）、`references/commands.md`（命令契约）与 `docs/rules/`（规范合同）。
- **MiniMax 的第三方 API 参考文档移出分发包**：`HF_AUDIO_SUBTITLE_FORMAT.md` / `VOICE_PROFILE.md` / 请求样例——运行时**不读**它们（脚本里写死了档案参数），它们只服务于维护者。

- **仓库内路径一律相对仓库根**（本轮确立的总约定）：原生程序（node / git / npm）在 Windows 上不认 MSYS 的 POSIX 绝对路径，登录 shell 还预置 `MSYS_NO_PATHCONV=1` 把参数转换**关掉**——于是同一份脚本在 `bash -c` 下正常、在 `bash -lc` 下整份失效。相对路径既不带盘符也不以 `/` 开头，任何形态下都不会被改写，因此「先 cd 到仓库根、再用相对路径」是跨平台的正解。仓库**外**的路径（用户发现目录、产品段目录、临时目录）无法相对表达，那一类才走 `native_path`。新增 `scripts/platform-compat.sh` 的 `hf_node()` / `hf_cli()` 两个 helper 固化这条约定。
- **官方运动校验从「零覆盖」变成「真跑」**：实测官方 `check --json` 在**没有** `*.motion.json` sidecar 时 `motion.enabled=false, samples=0`——官方那条「最接近自动看片的代理检查」在本仓**一直是零覆盖**（不是没跑，是压根没启用）。新增 `scripts/lib/motion-spec.mjs`：从帧 HTML 的 `data-motion-role="hero"` 声明 + `index.html` 的装配时间轴生成官方 sidecar，断言 hero 早可见（t≤0.5s，规则书 §1）、跨帧顺序、主体不出画。`gate.mjs check` 若发现 `motion.enabled=false` 会**直接判失败**——不让「全绿」冒充「运动也验过了」。帧未声明主体时 **fail-closed**（不猜、不跳过：猜错等于把这条检查变成恒绿）。
- **`check` 改走 `--json` 并逐条归因**：官方信封里每条 finding 都带 selector / 时间点 / 源文件 / fixHint，此前 `gate.mjs` 只看退出码，把官方最值钱的部分全扔了。新增 `scripts/lib/check-envelope.mjs`（信封解析 + 归因格式化）。
- **animation-map 从「验存在」升级为「验内容」**：官方脚本算出了 deadZones / staggers / tween flags，但 `gate.mjs` 只验文件存在且非空，**结论全被丢弃**。新增 `scripts/lib/animation-map.mjs` 定档：死区（≥1s 无补间）、`degenerate`、`invisible` → **阻断**；`offscreen` / 节奏类 flag / stagger 不一致 → **告警**（哪些该阻断属本仓自定政策，官方脚本恒 exit 0 且 prose 零记录阈值）。
- **新增成片像素级质检**（`scripts/lib/pixel-quality.mjs` + `gate.mjs quality`）：把判据落到**渲染像素**上——首帧可辨认度（非背景像素 ≥0.5%、唯一色 ≥3）与「每个 Scene 区间内画面必须有变化」。官方 motion 阶段数的是「元素的 opacity/transform 有没有变」，不是「画面看起来有没有变」，实测两者会给出**相反**结论：前者会被「画面里只要有一个元素在动」掩盖，后者不会。
- **打包内容边界与自检**：新增**包内死链自检**（随包分发的 .md 若指向包内不存在的文件即拒绝产出——排除清单移走的文件常被别人用链接指着，而包内死链只在分发后才暴露，那时已无法 fail-closed）；`publish-skillhub.mjs` 与「独立通用工具」（MiniMax 图片/视频脚本及其独立文档）成组移出分发包（它们不在生产主链上），包内 `package.json` 同步去掉指向包外文件的 npm script。
- **包产物与临时产物分离**：包产物改落 `.skillhub-pkg/pkg/`，与同级的临时审计产物分开——两者混在一处时 `install-skill.sh` 会把临时文件一并装进技能目录。
- **全面适配 Windows**：本仓此前在 macOS 上开发，代码里散落着 POSIX/macOS-only 假设——在 Windows 上会直接崩、崩得莫名其妙、或**静默产生错误结果**。本轮把跨平台缺陷逐项取证并修掉，同时把「平台声明」从「macOS / Linux」改成真实的「macOS / Linux / Windows」。完整的取证、修复清单、能力矩阵与未验证项见 `docs/architecture/windows-cross-platform-audit-2026-10-31.md`。
- **官方 CLI 入口统一到包内真实入口**：新增 `scripts/lib/harness.mjs` 的 `hfCliEntry()`，从 `package.json` 的 `bin` 字段解析 `node_modules/hyperframes/bin/hyperframes.mjs`。此前用 `node node_modules/.bin/hyperframes`——那是 npm 生成的 **sh 包装脚本**，用 node 执行会 `SyntaxError: missing ) after argument list`。`runHf` / `doctor.sh` / `bootstrap.sh` / `hf-env.sh` 统一改走真实入口；新增纯 Node 的 `scripts/hf-version.mjs`（支持 `--print`）承担版本校验。
- **Python 解释器不再硬编码 `python3`**：Windows 上 `python3` 常命中 Microsoft Store 的 `python3.exe` 存根（执行即非零退出、不输出任何东西）。新增 `scripts/platform-compat.sh` 的 `resolve_python()`：候选依次为 `MINIMAX_PYTHON` → `python3` → `python`，且**必须真跑一次最小导入**才算通过；`net-env.sh` 与 `scripts/minimax-tts.mjs` 同步改用。
- **官方 skills 分发改用 Node 建链接**：新增 `scripts/lib/link-official-skills.mjs`——Windows 建 **junction**（免管理员、可穿透），POSIX 建 symlink。原先用 `ln -sfn`，在 Windows 上退化为整树副本，与 `vendor/` 失去联动——智能体会读到旧版官方合同，正是本仓要防的漂移。
- **新增 `scripts/platform-compat.sh`**：bash 侧唯一真源——`native_path()`（`cygpath -m` 给原生程序做路径形态转换）、`resolve_hf_cli()` / `hf_cli_path()` / `resolve_python()`。
- **CI 增加 Windows 矩阵**：新增 `test-windows` job（`shell: bash`，Node 22/24）；版本校验改走 `node scripts/hf-version.mjs --print`，同时**保留独立的版本字面量断言**（CI 与脚本侧声明要交叉校验，单一真源会让校验退化成同义反复）。
- **新增 `.gitattributes`**（`* text=auto eol=lf` + 二进制标记）：固定行尾策略。CRLF 会破坏 `SKILL.md` frontmatter 断言与用例计数，也会让跨平台产物哈希漂移。
- **产品根按 Windows Known Folder 解析**：`defaultProductsRoot()` 读 `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders\Personal` 的真实值，Windows 的「文档」目录被 OneDrive 重定向时不再错位。
- **新增成片内容门禁**：新增 `scripts/lib/media-probe.mjs`——把成片的三件事读成机器可判定的事实（**只读数，不做判断**）：轨道结构（`ffprobe`）、音频响度（`volumedetect`）、黑帧区间（`blackdetect`）。`gate.mjs mp4` 与 `state.mjs set-mp4` 都据此 fail-closed：**有视频轨 + 有音频轨 + 音频非静音（`mean_volume > -60 dB`）+ 无持续 ≥1s 的整片全黑区间**。

### 修复
- **`fs.cpSync` 拷到含非 ASCII 的目标目录时静默拷空**（CI 实测坐实，**Node 22 + Windows**）：目录资料包归档后，`00-项目总控/资料包/` **目录建出来了但里面一个文件都没有**（`原稿.md`、`证据/说明.md` 全丢），而锁稿提取正常、init 退出码 0。判别证据：同进程同结构的 `fs.cpSync` 探针**正常**；差别只在**目标路径含非 ASCII**（生产目标是全中文的「00-项目总控/资料包」，探针目标是纯 ASCII）；同一份代码在 **Node 24 + Windows / ubuntu / macOS 全绿**，只有 **Node 22 + Windows 红**。根因：Node 的 `fs.cp` 无 `filter` 时下沉到 **C++ 快路径** `fsBinding.cpSyncCopyDir`，该路径在 Node 22 + Windows 上对含非 ASCII 的目标路径会静默拷空——不抛错、不报警。修法：`cpSync(..., { recursive: true, filter: () => true })` 强制走纯 JS 路径（`opendirSync` + 逐文件 `copyFileSync`，这几个 API 早已验证能正确处理中文路径）。回归锁：归档用例加了同结构双变体探针，「带 filter（生产用）」必须拷进去（**断言**），「裸 cpSync」结果一并记进失败信息——有人改回裸 `cpSync` 会立刻红。
- **`findBash()` 返回裸命令名 → 替换 PATH 后 ENOENT**（CI 实测坐实）：`tests/net-env.test.mjs` 的「无 python3」用例失败，报的是 `source 失败：undefined` / `null !== 0`——看着像脚本崩了，实际是**根本没启动**。根因：`findBash()` 在 Windows 上先试 `works("bash")`——本机 PATH 上的 `bash` 是 WSL 存根（跑不通）→ 回退到 Git Bash 的**绝对路径**，所以本机一直是对的；**runner** 上 Git Bash 在 PATH 上 → 返回**裸名** `"bash"`。而 `spawnSync` 解析可执行文件名用的是**子进程的 PATH**，该用例为构造「无 python3」把 PATH 整体换成空沙箱 → ENOENT。修法：`findBash()` / `findZsh()` 一律返回**绝对路径**（`where`/`which` 解析后逐个实跑校验），并对所有命中的 `git` 路径反推 Git Bash。
- **色板越界判据按 alpha 比较 → 官方 preset 被误判**（实测坐实）：初版把 `rgba(232,93,78,0.15)` 与 `#E85D4E` 判为不同色，于是官方 `capsule` 的 atmosphere 组件（`FRAME.md:107-109` 明写「1–3 radial candy glows（6–15% opacity）」）与 shadow 令牌**全部被判越界**——门禁变成了对官方 preset 的误伤。改为**按 RGB 比、忽略 alpha**：透明度变化是同一品牌色的表现，不是第二个颜色；alpha 相关的问题归官方 `check` 的 WCAG 对比度阶段管。
- **chrome 豁免只按 px 值匹配 → 14px 正文标签蒙混过关**（实测坐实）：初版豁免条件是「该字号值出现在 frame.md 的 px 令牌里」，于是官方 `capsule` 的 `label: px 14` 让 worker 随手写的 **14px 正文标签**通过（30px→14px 变异竟然 PASS）。改为**双重条件**：令牌名必须命中 chrome 语义（counter / pagenum / rail / colophon / credit / footnote / meta / chrome）**且不命中承载性语义**（label / tag / kicker / caption / badge / overline / attribution / body / title / headline）——承载性令牌优先，宁可少豁免不可多豁免。
- **`doctor.sh` 在登录 shell 下丢弃官方 doctor 的整份结论**（实测坐实）：`doctor.sh` 把 MSYS 的 POSIX **绝对**路径直接交给原生 node。登录 shell 预置 `MSYS_NO_PATHCONV=1` → 参数转换被关闭 → `/d/foo` 原样送达 → node 解析成 `<当前盘>\d\foo` → `MODULE_NOT_FOUND`。后果不是报错，而是**官方 doctor 的结论整份丢失**、却报成「必需项未通过」（假阴性，把排查带偏）。非登录 shell 正常，所以只用非登录 shell 测就永远测不出来。已改为相对路径 + `hf_node()` helper。
- **`install-skill.sh` 在登录 shell 下直接中止**（实测坐实）：同源问题，且该脚本**根本没有 source `platform-compat.sh`** → 登录 shell 下 `MODULE_NOT_FOUND` + `set -e` 中止，技能装不上。
- **`bootstrap.sh` 的 vendor 哈希按空白切词**：`find … | xargs $hasher` 在文件名含空格时被拆成多个参数，报 `No such file or directory`，且在 `set -euo pipefail` 下**无声中止**（exit 123，没有任何错误提示）。改用 `-print0 | sort -z | read -d ''` 逐个处理（新增 `scripts/lib/tree-hash.sh`，可被测试直接调用）。顺带修正：聚合哈希原先把**绝对路径**也算进内容，等于「路径+内容」哈希——同一棵树换个盘符放就「漂移」。
- **打包清单被自己打进包 → 包体自指增长**：`.skillhub-pkg.manifest.json` 写在包目录**同级**（仓库根），既没进内容排除清单，也没进 `.gitignore` → 第二次打包把它打进包里，包体凭空变大，逼近上限时会让打包 fail-closed 失败。已排除并加 ignore。
- **`state.mjs set-mp4` 的时长校验 fail-open**：用全文正则 `- duration:` 扫 STORYBOARD——只认半角冒号（全角 `duration：4s` 解析出 0 个时长 → `expected=0` → **整条时长校验被静默跳过**，坏片照样能绑）；且扫全文（帧块之外多一行 `- duration: 30s` 会被算进去 → 期望总时长虚高 → **正确的 MP4 反被拒绝绑定**）。改用结构化解析（与 `gate.mjs` 同一套 `storyboardDurationFacts`），并把「有 duration 行却解析不出数字」从静默跳过改为显式失败。
- **`install-skill.sh` 重装会删掉 bootstrap 产物**：原实现 `rm -rf "$DEST"` 连 `node_modules/`（依赖）与 `vendor/`（按锁定 commit 取回的官方 skills）一起删掉，重装就意味着重新下载依赖与官方 skills。改为**就地同步**：包内文件覆盖更新、包外残留删除、`node_modules`/`vendor` 原地保留。顺带避开一个 Windows 陷阱：被进程持有句柄的目录**不能重命名**（`MoveFileEx` → `ERROR_ACCESS_DENIED`），实测装好的技能目录整棵 `mv` 会失败，而同样内容重新 `cp` 一份就能 `mv`——失败的是「那一份被占用的旧树」。
- **`ci.yml` 的 `test-windows` job 第一步就红**：注释写「windows-latest 自带 ffmpeg」，实测官方 `actions/runner-images` 的 Windows2025 镜像工具清单里**没有 ffmpeg**（只有 ImageMagick / jq / zstd）。已加 `choco install ffmpeg`；`makeTinyMp4` 也补了 ffmpeg 缺失守卫（原先的失败信息是「null !== 0」，看不出根因）。
- **Python 解释器变量名分裂**：bash 侧读 `HARNESS_PYTHON`，Node 侧与文档读 `MINIMAX_PYTHON` → 按文档设了 `MINIMAX_PYTHON` 后 bash 侧解析失败 → 代理被静默清空 + doctor 假告警，而 TTS 照常工作。现统一以 `MINIMAX_PYTHON` 为准，`HARNESS_PYTHON` 保留为历史别名。
- **§3 能力编号撞号**：两个 `#7`（`final delivery` 与 `keyframes 诊断`），三张表合计 13 行却称 12 项，且 README/SKILL 仍写「12 项中只有 3 项落在 3.1」（`e9cb611` 新增 `final delivery` 后没同步）。现按阅读顺序重编为 **1–13**，三处文档同步为「13 项中 4 项落在 3.1」。
- **FAQ 内部自相矛盾 + issue 模板照抄了错的做法**：`faq.md` 一处写「**不要用** `node node_modules/.bin/hyperframes`」（实测那是 npm 生成的 sh 包装脚本，node 执行抛 `SyntaxError`），另一处的「正确做法」列却推荐它；两个 issue 模板也照抄了推荐版。已统一为 `node scripts/hf-version.mjs --print`。
- **`references/commands.md` 的契约与代码不符**：承诺 `[state]`/`[new-video]` 前缀但代码 0 次使用；写「失败退出 1」但有 6 处 `exit 2`（用法错误）。已按实际行为改写。
- **`doctor.sh` 的产物清单口径**：注释写「10 项」，实际 `bootstrap.sh` 的 `HF_REQUIRED_ARTIFACTS` 是 13 项。已改正。
- **`gate verify` 误判「STORYBOARD 帧顺序/时长漂移」**（Windows 端到端跑出来的**平台无关**缺陷，任何平台都会卡住生产）：注入绑定存的是「按帧解析出的 `meta.duration`」（帧缺 `- duration:` 行时是字符串 `"undefined"`），门禁却用正则从原文数 `- duration:` 行（缺行时是空数组）——两套表示法在缺行时必然不等，于是**未漂移的产物被误判为漂移**。而官方 `sync-durations` **只更新已有的 duration 行、从不新增**，「帧缺 duration 行」是合法的官方产物形态。门禁已改用与注入**同一套解析**比对「帧号 + 时长」，信息量不小于旧实现；漂移检测仍由 `storyboard_sha256` 兜底。新增回归用例钉住（变异验证：撤掉修复当场变红）。
- **代理探测在 Windows 上永远判「不可达」→ 静默直连**：探针用 `python3`，命中 Store 存根即失败，于是「本机有代理」被误判成「没有代理」，流量静默直连。改用 `resolve_python()` 的真实解释器后，探测结果正确。
- **Python stdout 在 Windows 管道下是 GBK(cp936)**：Node 按 utf8 解码出乱码；口播稿含 emoji / 扩展 B 区汉字时 Python 直接 `UnicodeEncodeError` 硬崩。三个 minimax 脚本强制 UTF-8 输出，`minimax-tts.mjs` 注入 `PYTHONIOENCODING=utf-8` / `PYTHONUTF8=1`。
- **Python 产物未锁 LF**：跨平台重算哈希不同。`write_json_file()` 改为写字节并锁 LF。
- **`renameSync` 覆盖只读目标在 Windows 上 EPERM**（POSIX 的 `rename()` 无此限制）：新增 `replaceFileSync()`——只在第一次命中 `EPERM`/`EACCES` 时去掉只读属性重试，其他错误码原样抛出。
- **`captions-zh.mjs` 的主模块判定大小写敏感**：Windows 下 `import.meta.url` 与 `process.argv[1]` 的大小写/分隔符不一致，脚本会**静默 exit 0**（看上去成功，实际什么都没做）。改用 `realpathSync` 两侧比较。
- **跨盘路径守卫漏判**：`relative()` 跨盘时返回绝对路径，守卫会当成越界；补 `isAbsolute(rel)`。
- **`ffprobe` 缺失被伪装成代码 bug**：`spawnSync` 在外部命令不存在时返回 `stdout=undefined`，直接 `.trim()` 会抛 `TypeError`。收口为 `probeDurationSeconds()`，返回 `{ok, seconds|reason}`，错误信息直指「ffprobe 没装/不在 PATH」。
- **`tests/net-env.test.mjs` 硬编码 `/bin/bash`、`/bin/zsh`**，且「无 python3」用例因 `symlinkSync` 从未调用而**恒定 skip**（隐性失效）。新增 `tests/lib/shell.mjs`（`findBash()`/`findZsh()` 实际跑一次判定，Windows 上从 `where git` 反推 Git Bash 并排除 WSL 存根）；**缺 bash 时明确失败而非 skip**——本仓 bootstrap/doctor/hf-env 全是 bash 脚本，缺 shell 是真实阻塞，skip 会伪装成通过。
- **`publish-skillhub.mjs` 的 exit 清理处理器**抛错会打出与发布无关的栈（Windows 上临时目录可能被杀毒软件占用）；已包 try/catch——发布结论只由退出码决定。
- **`doctor.sh` 的「hyperframes doctor 通过」是空门禁**（平台无关）：官方 `doctor --json` **永远 exit 0**（官方文档原话："always exit 0; gate on payload ok"；`cli.js` 里算完 `allOk` 只打印 JSON 就 `return`，没有任何 `process.exit(1)`）。判退出码等于「官方检查全红也显示通过」。而官方 payload 的顶层 `ok` 是所有检查的 AND，含 whisper-cpp / Kokoro / MusicGen / Docker 等**可选**回退——直接 gate 它也会永远误判。新增 `scripts/lib/doctor-report.mjs` 按三档判定：**必需项**（Node.js / FFmpeg / FFprobe / Archive extractor / Environment）缺任一项即失败；**Chrome** 分「Not found」（致命）与「Failed to run」（Windows 探测假阳性，只警告）;**可选项**只提示。配套 4 条回归用例。
- **`scripts/build-skill-package.mjs` 的 `EXCLUDE_DIRS` 增加 `.minimax`**，避免项目级技能安装副本被递归打包。

### 文档
- 平台声明全面更新：`README.md` / `README.en.md`（新增「Windows 说明」：按脚本类型选 shell、三个易踩的坑）、`README.package.md`（删掉「Windows 原生未验证」，改列 winget 准备步骤）、`SKILL.md`、`AGENTS.md`（新增「跨平台」小节）、`SECURITY.md` / `SECURITY.en.md`、`CONTRIBUTING.md` / `CONTRIBUTING.en.md`、`references/faq.md`（新增 §5.4「Windows 专项」排查表 + 30 秒索引条目）、`references/walkthrough.md`、`references/commands.md`、`tools/minimax/README.md`、`tools/minimax/docs/VOICE_PROFILE.md`、`tools/minimax/docs/STANDALONE_API_GUIDE.md`。
- **Keychain 的跨平台口径写清**：Keychain 是 macOS 专有机制，Windows / Linux **只有环境变量一条路**。本仓**不引入第三种凭证形态**（例如去读某个应用自己的配置文件）——那会让「key 只在两处」的审计结论失效。
- `references/faq.md` §1.1 不再建议 `node node_modules/.bin/hyperframes`（Windows 上是 sh 包装脚本），改用 `node scripts/hf-version.mjs --print`。

### 验证（Windows 本机实测）
- **产出真实成片（有画面 + 有声音）**：按官方 `faceless-explainer` Step 2–6 补齐真实内容后官方 `render` 出片——102/102 帧、3.4s、15.9s、exit 0；产物 **2 条轨道**（h264 / 1920×1080 / 30fps + aac / 48kHz / 立体声）；`blackdetect` **0 命中**、`volumedetect mean_volume = -21.2 dB`（纯静音是 −91 dB 量级）；从成片抽帧肉眼可见完整版式与中文字幕。
- **黑屏根因查清并固化**：官方 `init` 铺的 `index.html` 是 **0 clip 的空壳**，跳过 Step 2–5 直接渲染必然得到「有轨无画、无声」的片；此前的门禁（存在/哈希/时长）**一条都拦不住**。修复路径走官方流程（brand token → STORYBOARD → frame-packets + 逐帧 worker → assemble-index → transitions → 字幕 → check → render），并补上上述成片内容门禁。
- **官方渲染管线跑通**：300/300 帧、10.0s、21.8s、exit 0（空壳样片，用于验证管线本身）；渲染走 puppeteer-core/CDP 启动官方锁定的 `chrome-headless-shell`，**不依赖** `chrome.exe --version`——后者在 Windows 上必然挂到超时（这正是官方 doctor 把 Chrome 判成 FAIL 的原因，属**探测假阳性**）。
- **冷启动自举跑通**：分发包 → `bootstrap` → `doctor` 全绿；官方 skills 按锁定 commit 从 GitHub 取回时 **HTTPS 握手失败，自动回退 SSH 成功**；60 个官方 skill 以 **junction** 链接到 3 个发现目录。
- **端到端生产链跑通**：段脚手架 → MiniMax TTS（真实 API，23 词级时间，二次运行幂等复用）→ 官方 sync-durations 注入 → 中文字幕分组（4 组 / 23 词级 token）→ `gate verify` 通过。
- **发现并记录一条可生产性风险**：官方 `browser ensure` 下载锁定的 `chrome-headless-shell`（约 119 MB）在本机只有 **~13 KB/s**（实测 13.1 KB/s，剩余 107 MB 需 132 分钟），且**下载期间无任何进度输出**——看起来像卡死。建议把这一步放进 P0 联网窗口，不要留在生产主链里。

### 测试
- 113 项（112 通过 / 0 失败 / 1 跳过——跳过的是缺 zsh 时的跨 shell 一致性用例）。
- 新增回归用例两组：`tests/platform-paths.test.mjs`（5 例：登录/非登录 shell 一致性 + 结构式守卫「仓库内脚本不得把 MSYS 绝对 POSIX 路径直接交给原生 node」）、`tests/quality-gates.test.mjs`（9 例：像素质检双对照、motion sidecar fail-closed、check 信封归因、animation-map 内容断言）、`tests/official-deps.test.mjs`（7 例：官方 loader 的 `@latest` 退路双对照 + 版本钉死结构式守卫）、`tests/packaging.test.mjs` 增至 8 例（打包期按真实请求体判 + 打包/发布口径对账 + changelog 截断）。均做变异验证（撤掉修复当场变红）。

## [0.2.9] — 2026-10-31

Windows / Git Bash 路径的真实兼容性修复，并增加 Windows CI smoke。

### 修复
- `runHf()` 不再执行 `node_modules/.bin/hyperframes`（Windows 上是 shell/cmd 包装，`node` 直接执行会失败），改为从 `hyperframes/package.json` 的 `bin.hyperframes` 解析真实 `.mjs` 入口。
- `hf-env.sh` / `bootstrap.sh` / `doctor.sh` 同样改为直接调用 `node_modules/hyperframes/bin/hyperframes.mjs`，不再依赖 POSIX shim。
- `new-video.mjs` 的目录资料包改为显式递归复制目录**内容**（不再使用 `cpSync`），避免 Windows 上目录/中文路径的平台差异与原生崩溃。
- `tests/net-env.test.mjs` 在 Windows 上解析 Git Bash 的绝对路径，并且不剥掉 `SystemRoot` / `COMSPEC` / `PATHEXT` / `TEMP`；zsh 用例仍按环境跳过。
- 新增 `windows-latest` / Git Bash / Node 22 的 CI smoke：不跑 bootstrap，验证 Node 测试、shell 语法与 Windows 路径；官方 skill 用例按缺失跳过。

### 文档与验证
- README CI 徽章更新为 5 jobs；Windows 支持边界仍为 **WSL2 / Git Bash**，原生 cmd/PowerShell 不支持。
- 本地 `npm test` 78/78 通过；SkillHub 包 50 文件 / 440.3KB / 请求体 450.4KB，仍低于 460KB。

## [0.2.8] — 2026-10-31

中文 preset、Windows 支持边界与分发包边界修正。不兼容已交付项目，只对后续生产生效。

### 修复
- `presets/creative-mode-zh/FRAME.md`：删除官方英文 preset 残留（Archivo Black / JetBrains Mono / 四强调色 / 无圆角 / 24px 正文）；正文字号统一到 28px（1.46cqw），色板统一为五强调色，补齐圆角与字体说明。
- `presets/creative-mode-zh/caption-skin.html`：恢复「当前行 accent 高亮」；仍保持无背景、无盒子、无逐词块。
- 分发包排除开发期预筛脚本 `frame-guard.mjs` / `css-selector-audit.mjs`；中文 preset 保留在包内。包内 `commands.md` 明确两者仅在 GitHub 仓库提供。
- 新增 `.gitattributes` 强制 shell/Node/Markdown 使用 LF；Windows 支持边界写明为 **WSL2 或 Git Bash**，原生 cmd/PowerShell 不支持。

### 文档与测试
- 包/仓库 README、SKILL、preset README 同步 Windows 与 preset 说明。
- 新增 `tests/frame-tools.test.mjs`：frame-guard / css-selector-audit / preset 回归；测试数 78。
- SkillHub 包：50 个文件 / 439.3KB / 请求体 456.2KB（低于 460KB 上限）。

## [0.2.7] — 2026-10-25

最终交付与后续生产硬化：master 收尾必须把 candidate 原样交付到 `99-最终合成/renders/final.mp4`；字幕均衡切分改按中文词边界；harness 身份写入 state；preflight 增加 frame-check。

### 新增
- **`gate.mjs render-ready`：渲染那一刻的产物复核**（生产实测踩中，此前是纯纪律、无机器门禁）。`preflight` 只在**授权那一刻**跑一次，而渲染发生在授权**之后**；中间任何一次改写——官方 Studio preview 会在运行时重写 `compositions/captions.html` 与 `index.html`——都会让渲染用的字节 ≠ 验证过的字节，而当时没有任何检查会拦。`render-ready` 拿 final-look receipt 重算盘上产物，逐项比对**渲染真正读取的每一个字节**：帧集合、`index.html`、字幕、音频元数据，以及**逐帧读取的 `assets/voice/*.wav` 与 `assets/fonts/*.woff2`**——后两类文件不进任何单文件绑定，此前完全在门禁视野之外（换一个 wav 或改一个字体，preflight 察觉不到）。任何一项漂移即 fail-closed，并给出可执行的修复命令清单。零副作用、纯哈希复核。
- receipt 升到 **v3**：绑定**四个**渲染真正读取的资产目录——`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/`（官方 `assemble-index.mjs` 会把 BGM/音效写进 `index.html` 的媒体表，此前完全在门禁视野之外：换一条配乐或音效，门禁一声不吭）。目录摘要同时从**扩展名白名单**改为「除 `.DS_Store` / `Thumbs.db` 等 OS 噪音外一律纳入」——白名单会漏掉未知扩展名（`.ogg` / `.aiff` / …），而渲染可能照样读它；那是漏检，不是稳健。v1 / v2 receipt 会被 `render-ready` 明确拒绝并要求重跑 preflight——这是实话，不是故障。

### 变更
- **`state.mjs set-mp4` 现在以 `gate render-ready` 为前置**：绑定是渲染后的第一道机器检查，**漂移的渲染进不了 master 链条**。同时要求本段存在**合法的 final-look 授权**（此前只要求「开始授权」即可绑定任意 MP4）——官方顺序本就是「final-look 授权 → 渲染 → set-mp4」，少一环就没有「授权的是哪一次渲染」这层语义。
- `docs/rules/production-workflow-rules.md` 新增 §3.4「渲染输入完整性」：写明渲染前必须停掉 Studio preview、停了之后重跑字幕 → 装配 → 转场 → preflight → 重新授权 → 渲染 → `set-mp4`。
- `docs/rules/production-workflow-rules.md` §4 派发纪律补三条：**编排者必须按跨段连续性规格复核 worker 的实现，不只信它的回报**；**跨帧共享的规格必须写成单一权威数值、不得同时出现两种表述**（实测事故：`border: 0.4cqw solid` 与括注「4px 墨黑描边」并存，而 `0.4cqw` 在 1920px 画布上是 7.68px——同一台表因此出现 4px 与 7.68px 两种描边；规格自相矛盾就是把选择丢给实现者）；**缩放版不等于同款**（缩小放置的道具必须按同一比例缩放几何，否则观众认不出是同一件道具，「同一台表 → 同一读数」的论证被掏空）。lint 与 check 只能证明「这一帧自洽」，证明不了「这一帧与上一段/下一帧说的是同一件事」——量表口径、角度基准、读数链条这些**把论点讲反**的入口，机器门禁看不见。派发上下文必须写死跨帧规格，编排者逐帧对照复核。

### 修复
- **`render-ready` 的目录型绑定不再把「本来就不存在」误判成漂移**（自查复盘发现）：目录绑定在「preflight 当时目录就不存在」时被记成 `null`，而复核把 `null` 一律当成漂移——于是「该段只用系统字体、没有 `assets/fonts/`」这类**完全合法的段**会被永久误伤，`set-mp4` 永远过不了。语义已改正为：**preflight 当时不存在 ⇒ 现在也不该存在**；只有**凭空多出**目录/文件才算漂移（那意味着渲染会多读一批没被验证过的字节）。新增一条回归用例钉住它（变异验证：撤掉修复当场变红）。
- **官方 CLI 的浏览器下载缓存（`chrome/`）不再污染工作区与发布包**：`hyperframes browser ensure` 把 Chrome 下载缓存写在 `<cwd>/chrome/`。在仓库根跑过一次就会留下上百 MB 的压缩包——它既不在 `.gitignore`（一次 `git add -A` 就会把二进制提交进去），也只靠扩展名白名单才被排除在技能包之外。现在按**路径**排除（`build-skill-package.mjs` 的 `EXCLUDE_DIRS`），并补进 `.gitignore`。
- **`set-mp4` 作废 final-look 的口径修正**（生产实测踩中，段与段之间会死锁）：`state.mjs set-mp4` 原先无条件删除本段 `final_look` 授权，而官方生产顺序是「final-look 授权 → 渲染 → `set-mp4`」——首次绑定正是那次授权的正常收尾，却被当成「换片」抹掉，导致下一段的开始授权永远拿不到前段确认（`前序段 NN 无 MP4 或 final look 授权`），流水线在第 1 段之后无法推进。现在只有「本段此前已绑定过 MP4，且这次绑的不是同一片（路径或 SHA-256 变了）」才作废旧授权；首次绑定与同一片重绑均保留授权。真正换片仍必须重新送审。

### 文档与测试
- **FAQ §4.5 的规则归属修正**：原文把 `line_unread` / `text_below_floor` 写成「官方 `check --strict` 报的码」。核对锁定版 0.8.36 的 `dist/commands/layout-audit.browser.js` 后确认——这两个码在该版里出现 **0 次**，属于更新版 CLI（0.8.188）或本仓自有门禁。现在按真实归属写清：可读窗口（0.5s + 0.3s/词）与 ≥28px 字号下限是**本项目/本仓的门槛**（其中字号下限由 `gate layout-guard` 机器强制），**不得**在报告里写成「官方 check 报了 X」。同时补上该版 layout 审计的**完整 11 码表与各自级别**（此前只记了 2 个）：error 级 `clipped_text` / `text_box_overflow` / `text_not_painted` / `text_occluded`，warning 级 `content_overlap` / `container_overflow` / `escaped_container` / `panel_out_of_canvas` / `connector_*`，info 级 `canvas_overflow`（`panel_out_of_canvas` 对面积 ≥ 画布 10% 的主体只算 info）。重点补写了 **`text_occluded` 的判定机制**（9×3 探针 + `elementsFromPoint`；短标签命中任一探针即 error；`data-layout-allow-overlap` **豁免不了它**）与正解（要盖住上一帧内容时，保留形状但去掉它的文字）——这是「一个硬块砸下来盖住上一帧」这类镜头必踩的坑，此前无人记录。
- `references/commands.md` / `references/walkthrough.md` 写清 `set-mp4` 的精确作废口径；新增 `references/faq.md` §4.6（「前序段无 MP4 或 final look 授权」的排查表与处理方式）与 30 秒索引条目。
- `tests/pipeline-e2e.test.mjs`：原用例注释写「换片清除旧 final-look」，实际绑的是同一个文件，并未覆盖换片；改为覆盖真实语义（同一片重绑保留授权 / 换片作废授权），并新增一条钉住「final-look 授权 → `set-mp4` → 下一段开始授权」这条死锁路径的回归用例。

### 最终交付
- `state.mjs master --kind close` 现在生成 `99-最终合成/renders/final.mp4` 与 `final-render.json`，并在 `state.master.final_render` 绑定 final/candidate 哈希、时长和 harness 身份；final 只做 candidate 的字节级拷贝，不重新编码。
- 新增 `gate.mjs final-delivery`：校验 final 存在、与 candidate SHA-256 完全相同、时长一致、manifest 完整；缺 final 或漂移即 fail-closed。
- `new-video.mjs init` 创建 `99-最终合成/renders/`，并把 harness 版本/commit/dirty 写入 `state.harness`；dirty 工作区会显式警告，避免再次出现无法归因的生产版本。
- `captions-zh` 的超长语块均衡切分改为中文词边界，并保护引号/破折号/功能词；新增回归用例。
- `gate preflight` 的官方 check 增加 `--frame-check`，把项目级安全边界纳入 preflight。

## [0.2.6] — 2026-10-24

补齐命令契约：把各脚本的参数、成功输出、失败含义、产物与返工顺序集中到分发包内的 `references/commands.md`，并在 `SKILL.md` / `AGENTS.md` / README 中建立入口。无生产行为变更。

### 文档与分发
- 新增 `references/commands.md`：`new-video`、`gate`、`state`、TTS/注入/字幕、`finalize-master` 的参数与退出含义，明确 0/1 退出码与 `[gate]`/`[state]` 前缀。
- 命令契约入口加入 `SKILL.md` 的路由表、`AGENTS.md` 的规则导航、GitHub README 与包内 README。
- `SKILL.md` / 包内 README 增加输入输出约束、稳定性与错误处理机制、设计取舍，明确不可变边界与恢复路径。
- 版本号在 `package.json` / `package-lock.json`（两处）/ `CITATION.cff` / `SKILL.md` 五处一致推进到 `0.2.6`。

## [0.2.5] — 2026-10-24

SkillHub 列表信息与上手体验补齐：明确触发/不适用场景，新增分发包内的 FAQ、错误索引、反模式清单与端到端走查；补齐安装矩阵、依赖准备、命令地图、证据链和中国大陆网络说明；优化展示名、摘要与标签。无生产行为变更。

### 文档与分发
- 新增 `references/faq.md`：按症状索引安装、TTS、字幕、门禁、master、网络与反模式；新增 `references/walkthrough.md`：从资料包到 master 的可照抄最小示例；新增 `references/example-source.md` / `example-segment-plan.json` 可直接复制的输入。
- `README.package.md` 重写为包内完整上手页：何时使用/不使用、30 秒判断、安装矩阵、命令地图、证据链、中国大陆网络与文档索引。
- `SKILL.md` 增加典型触发、FAQ/走查路由；frontmatter 增加 `metadata.display-name`，展示名、摘要与标签同步优化。
- GitHub 仓库 README 增加「何时使用 / 先看什么」与 references 索引。

## [0.2.4] — 2026-10-24

本版本完成 2026-10-24 审计闭环：门禁编排、审批冻结、分发包与文档一致性。

### 修复（2026-10-24 审计闭环）
- **门禁编排**：新增 `gate.mjs preflight`；`state.mjs approve --kind final-look` 先跑 preflight，拒绝在空脚手架/无 TTS/无字幕时写入授权；授权记录绑定 `.hyperframes/final-look-receipt.json` 的 SHA-256。`gate verify` 默认严格（缺绑定即失败），早期阶段显式 `--allow-missing`。
- **master 证据链**：`master final-look` 必须已有 candidate 并绑定其 SHA-256；`finalize-master` 在 master final-look/close 后拒绝重跑；`set-mp4` 在 master 批准/收尾后拒绝，并在换片时清除段级 final_look；close 写入 `master.closed`。
- **分发包**：排除本地专用 `RELEASE-HANDBOOK.md`；审计报告移至 `docs/architecture/`（分发包不含该目录）；用 `README.package.md` 映射为包内 `README.md`，修复包内死链；`npm test` 在 `tests/` 缺失时非零退出；发布 UA 从 `SKILL.md` 版本读取。
- **TTS/注入**：`minimax-tts` 复用前校验 mp3/titles/manifest 哈希；`inject-audio-meta` 校验 binding 文本哈希；`MINIMAX_PYTHON` 生效；字幕 URL 为 `.json` 时统一落为 `<name>.titles`。
- **脚手架/计划**：`--source` 必填；锁稿提取先于目录创建；分段计划校验 `locked_script_sha256` 与每段 `text_sha256`，并把 plan 哈希写入 state。
- **字幕/分镜**：`captions-zh` 合并连续终止标点、写 `caption-overrides.json`、从 STORYBOARD 复算画布尺寸；`storyboard` 修 `---` 分隔线吞帧；`layout-guard` 支持竖屏 `cqw`、`clamp/rem/vw`。
- **环境**：bootstrap 必需产物 13 项、annotated tag 用 `^{commit}`；`net-env` 默认镜像不被 npm 注入覆盖；`hf()` 版本漂移即拒绝执行；`writeJson` 原子替换。
- **文档**：对齐 capture/frame.md/animation-map/BRIEF/离线范围/Ed25519/30 字/packageManager 等冲突，详见 [审计报告](docs/architecture/audit-2026-10-24.md)。

## [0.2.3] — 2026-10-24

SkillHub 发布路径的实测适配：平台对 publish 请求体有约 476KB 的实际上限，且不接受 gzip 压缩的请求体。本版本据此收敛发布包的内容边界，并给出可复现的发布脚本与体积闸门。

> 版本号说明：`v0.2.2` 的 GitHub Release 已发布，其内容不含本节的发布脚本；本节改动因此进入 `0.2.3`，避免同一版本号在两条版本线上指向不同内容。SkillHub 上已提交 `0.2.2`（HTTP 201），平台按惯例在审核后自行推版。

### 新增
- `scripts/publish-skillhub.mjs`（`npm run publish-skill`）：本仓的 SkillHub 发布路径。它走 `scripts/build-skill-package.mjs` 的产物（而非直接作用于仓库根），字段与文件收集规则同 SkillHub CLI 的 `parse_skill_md_frontmatter` / `_collect_skill_files` / `_post_publish_multipart` 保持一致。凭据只从本机 CLI 的凭据文件读取（`~/.skillhub/credentials.json` 的 `user` 节点），不入仓、不入日志、不进环境变量。支持 `--root` / `--changelog` / `--dry-run`。
- 发布请求体的体积闸门：超过实测上限即 fail-closed 并明确报错，**不发出请求**。超限时服务端只会静默断开连接，客户端侧看到的是没有可读信息的 Broken pipe。
- `tests/packaging.test.mjs` 增至 4 项：新增「请求体超限时 fail-closed，不发出请求」与「体积在上限内时通过闸门并完成干跑」。均以变异测试验证敏感性（把上限放宽到 10MB，超限用例当场转红）。
- `tests/changelog.test.mjs`（4 项）：changelog 提取的回归门禁，抽取到 `scripts/lib/changelog.mjs`。其中「结果恒不为空」一项针对的是一个**静默失效**的缺陷——原实现用多行正则 `(?=\n## \[|$)` 取节正文，而 multiline 模式下 `$` 会在任意行尾匹配，非贪婪捕获组因此恒为空：脚本照常成功、平台照常接收，只是 changelog 恒为空并显示为默认文案。已用变异测试确认四项在还原实现后全部转红。
- **发布脚本的 changelog 提取改为按行扫描**（`scripts/lib/changelog.mjs`）。原多行正则实现恒返回空串，结果是 0.2.2 上传到平台的 changelog 为空，线上显示为平台默认文案 "Initial release"——0.2.0 的上传则正常显示了中文说明，可作对照。

### 修复
- **发布包的内容边界**由「仅按扩展名过滤」改为「平台准入白名单 + 发布包内容清单」两层。此前包内含治理文档、变更历史、英文镜像、内部架构记录与本仓自身的门禁用例（68 个文件 / 488KB），超出服务端上限；现为 45 个文件 / 319KB。
- 打包脚本的排除清单补入 `.skillhub-pkg/`：它是脚本自己的产物目录，不排除会把它连同上一次的包一起扫进来（实测文件数从 45 涨到 135，直接触发平台上限拒绝）。
- 打包脚本的排除清单补入 `.github/`：本仓自身的 CI 定义与 issue 模板属仓库基础设施，对技能使用者无用。发布包现为 39 个文件 / 314KB。
- 打包清单改写到**包目录的同级**（`<out>.manifest.json`）：清单是关于包的元数据而非包的内容，放进包里会让包多带一份自指的文件。
- 发布脚本在 `CHANGELOG.md` 缺失时不再崩溃——它只是发布说明的来源，不是发布的必要条件。
- 发布脚本的打包产物改落系统临时目录，不在工作区留下构建物；`.gitignore` 相应补入 `.skillhub-pkg/`。
- `scripts/bootstrap.sh` 的 fetch 与 checkout 加硬超时（默认 1800 秒，可用 `HF_SKILLS_FETCH_TIMEOUT` 覆盖）。此前上游无响应时，CI 作业会一直挂到 GitHub 的默认上限（6 小时）；现在超时后走下一条通路，最终明确报错退出。macOS 无 `timeout(1)`，用 perl 的 `alarm` 包装（exec 后 alarm 仍生效），HTTPS 另加 `http.lowSpeedLimit/lowSpeedTime` 判据以防「连上但传不动」的软挂死。
- **sparse-checkout 改为 non-cone 模式并精确锚定**（`git sparse-checkout set --no-cone '/skills/'`）。cone 模式下 `sparse-checkout set skills` 匹配的是**所有层级**名为 `skills` 的目录（gitignore 语义），故上游的 `.agents/skills/` 也会被一并拉入；而那里的媒体文件由上游 `.gitattributes` 声明为 LFS，checkout 时要向 LFS 服务器取对象——该通路不可达时整个 bootstrap 会以「smudge 过滤器 lfs 失败」中断。实测本机装好的 0.2.2 技能包正是在这一步失败。改为精确锚定后，工作树只剩 `skills/`（21 个目录），`.agents/` 不再被拉入。
- **新增 LFS 指针检测**：取回后若检出 LFS 指针文本即 fail-closed 并报错。指针不是内容——拿它当真实文件用，症状会出现在渲染阶段而不是取回阶段，极难归因。已核实锁定 commit 下 `skills/` 内零个 LFS 指针（其中 `media-use` 的 mp3 为真实文件，27KB / 11KB）。
- 取回通路可由环境变量覆盖（`HF_SKILLS_REPO_URL` / `HF_SKILLS_REPO_SSH`），便于在 HTTPS 不可达而 SSH 可用的环境里让 SSH 先被尝试。

### 平台实测
- **SkillHub 服务端对 publish 请求体有约 476KB 的实际上限**（协议文档 §8.3 写的是 ≤10MB，文档与线上部署不一致——与本仓此前发现的「.jpg 列入白名单但线上拒收」属同一类问题）。实测 475KB 可通过、480KB 被断开。
- **服务端不接受 `Content-Encoding: gzip` 的请求体**：带该头的 multipart 会在表单解析阶段返回 400「解析表单失败: multipart: NextPart: EOF」。故体积只能靠内容取舍满足，不能靠压缩。（注：鉴权失败发生在表单解析之前，返回 401，因此**不能用 401 证明服务端支持解压**——本仓最初据该现象误判过一次。）

## [0.2.2] — 2026-10-23

本仓以 SkillHub 技能的形式对外分发；同时把「装到发现目录」「装完自举」「不会自动进索引」三件实测事实写进文档，不再依赖使用者自行推断。

> 版本号说明：本仓首个 SkillHub 制品由平台在审核通过后自行发布为 `0.2.1`（内容等同于 `v0.2.0` 加 `SKILL.md`）。协议要求本地版本严格大于线上版本，故本次直接升至 `0.2.2`；GitHub 侧不发布 `0.2.1`，避免同一版本号在两条版本线上指向不同内容。

### 新增
- `tests/packaging.test.mjs`（2 项）：打包脚本此前未排除 `vendor/`——bootstrap 取回上游 `skills/` 子树后，打包会把它一并扫进来（实测 805 个文件，远超平台 §8.3 的 100 上限，产出被拒）。用例用最小合成仓库驱动打包脚本（不依赖开发机是否已 bootstrap），断言产物中不含 `vendor/` 且文件数在限内。已用变异测试（从排除清单移除 `vendor`）确认两项用例均当场转红。
- `tests/docs-links.test.mjs`（6 项）：把此前靠人工核对的文档一致性变成机器门禁——① 全仓 markdown 相对链接零死链；② README 中英目录锚点与实际标题一致（按 GitHub 真实 slug 规则逐空格替换，不折叠）；③ 版本号在 `package.json` / `package-lock.json` / `CITATION.cff` / `SKILL.md` 四处一致；④ `SKILL.md` 满足协议 §8.2 的 frontmatter 要求（`name` 为 kebab-case、`version` 为合法 SemVer、`displayName` 与 `description` 非空且单行）；⑤ `SKILL.md` 声明自己只做路由；⑥ 文档声明的测试数（README 中英徽章与正文、SKILL.md 正文）与 `tests/` 实际用例数一致。前五项均以变异测试验证敏感性——注入死链、还原版本倒挂、去掉 `name`、去掉路由声明，用例均当场转红，还原后复绿。其中第③项正是本版本修掉的版本倒挂缺陷的原样再现。第⑥项针对的是「新增了用例却没改 README 徽章」这一反复出现的漂移形态（本次即发生：徽章停留在 50 而实际已 52），已用变异测试确认可捕获。
- `scripts/build-skill-package.mjs`：把本仓打成 SkillHub 可上传的技能包。平台协议（`iflytek/skillhub` docs/07 §8.3）限定文件类型白名单、数量 ≤100、总包 ≤10MB、单文件 ≤1MB，而本仓的 `LICENSE` / `NOTICE` / `.gitignore` / `CITATION.cff` 均不在白名单内。脚本按准入规则过滤、逐项 fail-closed 校验后产出到独立目录，并写出含每个文件 SHA-256 的 `package-manifest.json`。单步、幂等、确定性、零 agent 调用。
- `scripts/install-skill.sh`（`npm run install-skill`）：把本仓安装到客户端的技能发现目录。**这是补缺口的实作**：SkillHub CLI 的默认安装路径不被任何客户端扫描（实测落在 `/private/tmp/skills/`），且该 CLI 不写 `AGENTS.md` 的 `<skill>` 索引块（源码中 `agents/skills` 与 `AGENTS.md` 命中数均为 0，协议 §8.4 / §8.5 均未实现）。脚本按协议 §8.4 的四级优先级探测目标目录（或由 `--dir` 指定），打包后安装并 fail-closed 校验 `SKILL.md` 存在，最后打印自举与索引两步提示。单步、幂等、确定性、零 agent 调用。

### 修复
- **上游合同审计：官方 skills 改为按锁定 commit 取回**。上游于 2026-10-21（PR #5651，破坏性变更）退役 `skills/faceless-explainer/` 与 `skills/embedded-captions/`，本仓 CI 因此全红（`Unknown skill(s): faceless-explainer`）。审计结论与证据见 `docs/architecture/hf-contract-audit-2026-10-21.md`。
  - `scripts/bootstrap.sh` 不再使用 `hyperframes skills update`——该命令把「latest」硬编码为上游 main 的**实时 HEAD**，无法固定到本仓声明的锁定 commit，且会「移除任何不再发布的 skill」。改用 git 按 SHA 取回官方 `skills/` 到 `vendor/skills/`：外层换传输通路（HTTPS / SSH）、内层换 ref 形态（按 SHA / 按 tag），四种组合逐一尝试，每次成功取回都立刻用 `git rev-parse FETCH_HEAD` 校验取回的确实是锁定 commit；`--filter=blob:none` 使 fetch 只取 commit 与 tree、blob 在 checkout 时按需拉取，避免传输与本仓需求无关的整仓内容。随后对本仓实际引用的 10 个官方产物逐项 fail-closed 校验，缺失即报错而不静默跳过。
  - 实测排除了一条看似可用的替代路径：`npx skills add owner/repo@<sha>` 只在**发现阶段**认 sha（提示 Found 13 skills），实际装出的内容逐字节等于 main HEAD——它无法真正按 commit 固定。
  - 把锁定版本软链到各智能体发现目录（`~/.agents/skills`、`~/.claude/skills`、`~/.config/opencode/skills`），使 agent 读到的官方合同与本仓规则引用的版本一致。
  - **bootstrap 改为幂等**：vendor 里已锁定在同一 commit 时跳过取回（实测重复运行 17 秒 → 1.0 秒）；发现目录的替换一律用 `ln -sfn` 原地改指向，而非「删除后再建」——软链替换是 O(1)，而删除的代价随目录内容量级变化（在带可恢复删除 shim 的环境里，逐项 `rm -rf` 实测可达分钟级）；只有目标确实是真实目录时才挪到暂存区、末尾一次性清理。
- **校正两处陈旧的官方合同路径**：规则与架构文档把 brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core 写在 `skills/hyperframes/references/` 下，而锁定 commit 中它们位于 `skills/hyperframes-core/references/`。该错误在本次上游变更前即已存在——bootstrap 一直拉 main 的实时产物，而 main 上那些文件早已不在。`scripts/gate.mjs` 引用的 `skills/hyperframes/references/pitch-round.md` 路径本就正确，无需改动。
- **更正 `sprintf-js` 残留告警的表述**：其 advisory（GHSA-hp3w-g68c-fv3c）已于 2026-10-22 被**撤回**（`withdrawn_at` 非空），不再是有效漏洞。此前记入 `[0.2.0]` 的「将在发布补丁前持续为 open」按当时事实成立，故历史条目不回写，在此更正。
- `hono` 由 4.13.7 升至 4.13.13（传递依赖，落在既有 `^4.0.0` 范围内，`hyperframes` 版本锁未动），修复 GHSA-5r4p-p66f-jhc7——该 advisory 声明受影响区间为 `>=4.12.4, <4.13.11`、修复版 4.13.11，而本仓原装的 4.13.7 落在区间内。Dependabot 未能自动修复（它读到的 `first_patched_version` 为空），故手动在既有 semver 范围内升版。
- `.github/ISSUE_TEMPLATE/question.md` 的 README 链接为相对路径 `README.md`，从该目录解析后指向不存在的文件——修正为 `../../README.md`。
- **官方 skill 的解析收敛为唯一真源**。`scripts/captions-zh.mjs` 与 `scripts/inject-audio-meta.mjs` 原先在 `vendor/skills/` 缺失时回退到 `~/.claude/skills`、`~/.agents/skills`、`~/.config/opencode/skills`——那三处的同名 skill 可能来自任意版本（上游 CLI 的 `skills update` 拉的是 main 实时 HEAD、`npx skills add` 实测不真正固定 commit、或用户手工安装）。后果是门禁可能验证了**另一份**官方产物却报告通过。实测此前在干净克隆（无 `vendor/`）下 53 项全 pass、0 skip——它验证的是本机发现目录里的版本，而非锁定 commit 的版本。现新增 `scripts/lib/official-skills.mjs` 收敛三处重复逻辑，一律只认 `vendor/skills/`；无 vendor 时字幕用例**明确 skip**。已验证：干净克隆下 52 pass / 1 skip；伪造 HOME 中放置一个会抛错的「上游 main HEAD 版本」，结果不变。
- `scripts/doctor.sh` 的注释声称检查 skills，实际并无对应检查项——补上：验证锁定 commit 的官方 skills 已取回至 `vendor/skills/`，且生产主链真正 import 的四个运行时文件（`captions.mjs` / `audio.mjs` / `lib/tokens.mjs` / `lib/dimensions.mjs`）齐备。体检脚本的声明与实现此前不一致，这本身是一处真实缺陷。
- 打包白名单按**实测准入**收敛为纯文本类。协议 §8.3 列举的白名单含 `.png` / `.jpg` / `.svg`，但线上服务端实际拒收 `.jpg`（错误「不允许的文件类型: assets/wechat-qr.jpg」）——文档与线上部署不一致，以实测为准。
- `scripts/build-skill-package.mjs` 的排除清单补入 `vendor/`。该目录是 bootstrap 按锁定 commit 取回的上游产物树（`.gitignore` 内），不随本仓分发；不排除时打包会把它一并扫进来（实测 805 个文件，远超平台 §8.3 的 100 上限，产出被拒）。
- 文档链接门禁排除 `vendor/`。该目录下的 326 份 markdown 由上游维护，其内部相对链接的成败不应让本仓门禁变红——门禁只能对本仓负责的内容断言。已验证：向 `vendor/` 注入一份含死链的 markdown 后，本仓五项文档门禁仍全绿。
- 版本号倒挂：平台线上版本已由审核流程推进至 `0.2.1`，本地仍为 `0.2.0`，下次发布会撞 409。本仓版本号（`package.json` / `package-lock.json` / `CITATION.cff` / `SKILL.md`）统一升至 `0.2.2`。

### 文档
- 新增 `SKILL.md`：本仓在 SkillHub 上的分发封装。它只做路由、不承载规范，全部要求仍由 `AGENTS.md` 与 `docs/rules/` 各自唯一持有；`AGENTS.md` 相应加了一条互指，声明冲突时以 `AGENTS.md` 与 `docs/rules/` 为准。
- `SKILL.md` 的 frontmatter 补 `name` 字段（协议 §8.2 必需，且首次发布后映射为 `skill.slug` 不可变更）；`LICENSE` 链接改为指向 GitHub 绝对地址并注明该文件不随包分发。
- **`SKILL.md` 的 `description` 改写为触发条件式**。协议 §8.2 规定 `description` 映射为 `skill.summary`，即平台展示与路由匹配所用的那段文字；此前写的是「它是什么」，检索时匹配度不佳，现改为「当需要……时使用本技能」。
- **`SKILL.md` 补三段实测事实**：「如何被新智能体加载」（发现目录优先级、CLI 不写 `AGENTS.md` 索引块）、「如何开工生产」（`new-video.mjs init` / `segment` 的完整参数形式）、「目录约定说明」（`docs/` 承担协议 `references/` 角色，`tools/` 承担 `assets/` 角色，二者协议中均为可选）。
- README 中英双份新增「作为 SkillHub 技能安装」段，给出平台安装与本地安装两条命令、发现目录优先级，以及三条须知（必须显式指定目录、装完仍需自举、不会自动进索引）。
- `CONTRIBUTING.md` / `CONTRIBUTING.en.md` 与 `.github/dependabot.yml` 中「官方 skill 内容随 `skills update` 一并变动」的表述校正为「随上游 commit 一并变动」——取回方式已改为按锁定 commit 取回，`skills update` 不再是本仓的取回路径。
- `AGENTS.md` / `SKILL.md` / README 中英双份的冲突裁决表述原以 `$HYPERFRAMES_REPO` 为官方合同真源——该变量在本仓已无对应实体（上游仓库不再整体检出，取回的是 `skills/` 子树），改为「锁定 commit 下 `vendor/skills/` 的官方原文」。

## [0.2.0] — 2026-10-08

项目定位统一为 harness 工程，并把强制力的真实覆盖范围如实分层披露；同时新增两项机器门禁。

### 门禁
- **修正一处不实断言**：§3 原写「12 项强制质量能力，缺一项即门禁失败」，并声称第 1 项由 `gate.mjs` 校验 `BRIEF.md` 的 `## Intent`——但该门禁**从未实现**，全仓零 BRIEF 校验代码。把「写在规则里」当成「已经强制」，正是本项目要消灭的病，且它自己先犯了。
- 新增 `gate.mjs pitch-round`：校验项目根 `BRIEF.md` 的 `## Intent` 非空（官方 `pitch-round.md` 规定的胜出概念落点）。
- 新增 `gate.mjs animation-map`：校验段内 `.hyperframes/anim-map/animation-map.json` 存在（官方 `animation-map.mjs` 的默认产物路径）。
- **`gate.mjs final-look` 内含官方 `check --strict`**：此前 `check` 与 `final-look` 互不调用，可先拿渲染授权再补跑甚至不跑；现在渲染授权不可绕过检查。
- 两项新门禁均配 e2e 用例，已用变异测试（把门禁改成永远放行）确认用例会转红。
- §3 拆为三层并如实标注覆盖范围：3.1 本仓机器门禁（3 项）、3.2 官方 CLI 命令（6 项，无机器门禁）、3.3 流程/复审证据（3 项，无机器门禁），并写明「任何声称本仓对全部 12 项 fail-closed 的表述都是错的」。

### 文档
- `package.json` 的 `description` 改为新定位，与 README 首句及 GitHub 仓库描述逐字一致（53 字符 / 117 字节）——此前仍是已作废的「管理层定制层」表述。
- README 特点段由 5 条扩为 8 条（中英双份）：新增**视觉可自定义**（`frame.md` 单一视觉真源，实拍配置 12 个自定义色、7 段共用）、**单一信源**（内容/视觉/状态/网络/治理各为唯一所有者，产物以 SHA-256 绑定输入）、**模块化**（共享能力集中 `scripts/lib/`，无脚本间复制；厂商能力隔离于 `tools/minimax/`）、**自我进化**（上游补齐即退役自建层；问题账本按根因合并并标记 resolved）四条；原「fail-closed」与「证据不可伪造」合并为「强制而非建议」。
- README 首屏改为「解决什么 · 提供什么 · 特点」：价值陈述置于一句话描述之后，免责声明与目录下沉；原「为什么需要这一层」章节内容上移并删除，避免重复。「凭什么可信」中与首屏重复的四条特点删除，仅保留机制说明与三层强制披露。
- 新增 `assets/wechat-qr.jpg` 与 README「联系作者」段（中英双份），置于许可节之前。
- 仓库描述改为「HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行。不重写官方能力。」（53 字符 / 117 字节）。
- 新增 `CITATION.cff`，GitHub 据此生成 Cite this repository。
- README 新增「获取帮助」段，列出 issue / 功能提议 / 安全漏洞 / 贡献代码四条渠道。
- topics 增补 `agent-harness`、`guardrails`、`llm` 三个领域检索词（共 15 个）。
- **纠正项目定位**：原先把本仓描述为「管理层定制层」「只补官方没有的管理能力」，因果是反的——真正的主因是 **HF 会跑但不会自守**：规则和官方能力「名义上在用」实际没被执行。定位改述为**驾驭 HF 的那一层工程**，三件事重新定性为「保流程（强制）/ 强制能力（强制）/ 补缺口（补件）」，并明确「不重造轮子是边界，不是目的」。
- **README 重构为六段结构**（中英双语）：一句话是什么 / 为什么需要 / 是什么·不是什么 / 如何解决 / 凭什么可信 / 使用与治理。「凭什么可信」段只写可被检验的事实，并公开三层强制力的真实覆盖——官方 12 项能力中只有 3 项有机器门禁。
- 新增**非目标**段落：把「不重造官方能力」「脚本零 agent 调用」「不追未发布版本」从角落提到正文，它们是「是什么」的一部分。
- **对齐 standard-readme 规范**：简短描述压到 112 字符并与 GitHub 仓库描述保持一致；补目录（README 已超 100 行门槛）；许可改为末节。
- **纠正 GitHub 仓库描述**：此前仍是 292 字符的旧定位（"管理层定制层…优能力（强制接入）"），与已改写的文档自相矛盾，本次同步为新定位。
- 中文 README 补上此前缺失的问题陈述段落（英文版原本有），中英结构对齐。
- **社区治理文档双语化**：新增 `CONTRIBUTING` / `CHANGELOG` / `CODE_OF_CONDUCT` / `SECURITY` / `DISCLAIMER` 五份英文版，中英版本互指语言切换行。
- **修复 README 语言切换**：`README.md` 原写作 `**English** | [中文](#...)`，"English" 被加粗却没有链接，导致仓库首页看起来「只有中文版」。已改为 `[English](README.en.md) | **中文**`。
- **确立语言政策**：社区与治理文档双语；`docs/rules/`、`AGENTS.md`、`docs/architecture/`、`docs/plans/` 维持中文单源——它们是单一所有者的规范合同，英文孪生版本会给规范性要求造出两个 source of truth，而本仓裁决顺序没有语言维度可仲裁漂移。

### 安全
- 合并两条 Dependabot 补丁 PR：`sharp` 0.35.4→0.35.5、`source-map-js` 1.2.1→1.2.2，对应两条 high 告警转为 fixed。两者均为 `hyperframes@0.8.36` 的传递依赖，补丁落在既有 semver 范围内，未改动 `package.json`，HyperFrames 版本锁保持不变。
- **残留告警（无法由本仓消除）**：`sprintf-js`（medium，GHSA-hp3w-g68c-fv3c）经 `roarr` 传递引入。已安装版本 1.1.3 即 npm 上的最新发布版本，上游无修复版本，因此该告警在 `sprintf-js` 发布补丁前将持续为 open。此处如实记录，不做降级或屏蔽处理。
- 开启 GitHub secret scanning（含 push protection）与 dependabot security updates。
- 开启 private vulnerability reporting——`SECURITY.md` 指示的私下报告通道此前处于关闭状态。

### 变更
- 官方合同引用路径纠错：5 份合同实际位于 `skills/hyperframes/references/`，原文档指向的 `skills/hyperframes-core/references/` 是死链（已逐个实证）。**更正（0.2.2）：该结论方向相反；锁定 commit 下合同实际在 `hyperframes-core/references/`，见 [0.2.2] 节。**

## [0.1.0] — 2026-10-08

首个公开版本。

### 新增
- **管理层定制层定位**：保流程（规则与门禁）、补缺口（锁定稿分段 / MiniMax 词级时间注入 / master 拼接 / 状态与授权）、优能力（强制接入官方质量能力）。
- **官方能力审计**（`docs/architecture/hf-0.8.36-capability-audit.md`）：确认 HF 0.8.36 已原生采用「单智能体 + 每帧一个子智能体」，前代自建的 Worker 执行层、传输证据、三槽队列、心跳/lease 全部退役。
- **生产脚本**（单步、幂等、确定性、零 agent 调用）：项目脚手架、MiniMax TTS 注入、中文字幕分组、门禁、状态与授权、master 拼接。
- **规则文档**（各为单一所有者）：生产工作流、视觉规则书、字幕合同、锁定稿与分段。
- **离线可跑底线**：官方逃生口 `HYPERFRAMES_SKIP_SKILLS=1` 阻断段脚手架的隐藏联网依赖；`npm test` 全程离线，含黑洞代理下的离线底线用例。
- **网络策略单点化**（`scripts/net-env.sh`）：npm 中国大陆镜像；GitHub/npm 代理**默认探测 `127.0.0.1:7890`，可达才启用**；MiniMax 直连豁免。
- **证据完整性**：锁稿 → TTS → 注入绑定 → MP4 的 SHA-256 链式绑定；帧口播必须与锁稿归一化后全等。
- **门禁**：`verify` / `authorized` / `final-look` / `check`（官方 `--strict` 包装）/ `mp4` / `next-segment` / `master-inputs` / `layout-guard`。
- **锁定稿标记泛化**：`<任意命名空间>:script:start|end`，向后兼容既有资料包。
- **CI**：ubuntu + macos × Node 22/24。

### 安全
- API Key 只来自环境变量或 macOS Keychain，不入仓、不入日志。
- 注入绑定 schema 版本化；历史格式**拒绝补哈希伪造证据**，只能重新派生。
- 密钥与个人标识扫描：全量历史无密钥、无个人绝对路径。

### 许可
- Apache-2.0（与上游 HyperFrames 一致）。本项目不含 HF 源码，仅作外部依赖调用。

[未发布]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.9...HEAD
[0.2.9]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.8...v0.2.9
[0.2.8]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.7...v0.2.8
[0.2.7]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.6...v0.2.7
[0.2.6]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/suonian/ZWhyperframes-Harness/releases/tag/v0.1.0