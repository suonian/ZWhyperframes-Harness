# 常见问题、错误索引与反模式

> 本文件是分发包内的**排障速查**。规范本身仍以 `AGENTS.md` 与 `docs/rules/` 为唯一所有者；这里只回答「遇到这个症状先查什么、怎么修」。
>
> **深度取证**（为什么是这个根因、官方 CLI 的内部行为、逐条错误码的判定细节）在 GitHub 仓库的 `docs/architecture/faq-full.md`——它不进本包。包内保留的是「症状 → 判据 → 修法」，够用即可。
>
> 按症状直接跳到对应小节；命令参数与成功输出见 `references/commands.md`。

## 1. 安装与自举

### 1.1 `hf-env` 报 HF CLI 缺失或版本不符

先 `source ./hf-env.sh`（Git Bash）。它把仓库锁定的 HF CLI 放到 PATH 前并校验版本；不 source 就直接调 `hf`，可能命中系统里别的同名命令。

### 1.2 `bootstrap` 取回官方 skills 失败

官方 skills 只能按**锁定 commit**从 GitHub 取回（`git fetch` + sparse-checkout），成功后 `vendor/skills/` 里应有 13 个官方 skill 目录。常见原因：**网络**——先看 `scripts/net-env.sh` 打印的代理状态，代理不可达时会**自动直连**而不是挂死，仍失败就设 `HARNESS_PROXY=http://127.0.0.1:7890` 或 `HARNESS_NO_PROXY=1`；**LFS 指针**——取回的是指针而非内容时装 `git-lfs`；**GitHub 完全不可达**——这是 P0 环境准备问题，不影响已缓存的离线生产。

### 1.3 `npm run bootstrap` 没走国内 npm 镜像

`scripts/net-env.sh` 会把 npm registry 指向 `registry.npmmirror.com`。要覆盖：

```bash
HARNESS_NPM_REGISTRY=https://registry.npmjs.org npm run bootstrap
```

### 1.4 为什么不能用 `hyperframes skills update` / `npx skills add`

两者都取**上游 main 的实时产物**而非本仓锁定的 commit，生产结果会随上游漂移；且 `hyperframes skills update` 会移除上游已撤下的 skill（`faceless-explainer` 已在 2026-10-21 退役）而直接失败。一律用 `npm run bootstrap`。

### 1.5 分发包没有 `tests/`

**预期行为**：测试依赖完整仓库（含 `vendor/` 与 `node_modules`），包内执行 `npm test` 会明确失败。测试在 GitHub 仓库跑。

### 1.6 `bootstrap` 中途 Ctrl-C / 断网

bootstrap 有回滚：旧 `vendor/` 被换回，失败不写 commit stamp。修好网络后重跑即可。### 1.7 分发包里有什么、没有什么

**有**：`SKILL.md`、`AGENTS.md`、`docs/rules/`（规范合同）、`references/`（本速查 + 命令契约）、`scripts/`、`tools/minimax/`、`package.json` + `package-lock.json`。

**没有**：`tests/`、`vendor/`、`docs/architecture/`、`references/walkthrough.md`、打包/发布工具链、`assets/wechat-qr.jpg`（平台拒收该类型）。完整清单见仓库 `README.package.md`。

## 2. 项目输入与分段

### 2.1 `init` 报“需要 --source”或留下半成品

`init` 要求 `--source <资料包文件或目录>`，且项目目录必须为空或不存在。写入失败会自动清理半成品，重试即可。

### 2.2 `segment` 报计划哈希不一致 / 不连续

`segment-plan.json` 的 `locked_script_sha256` 必须与当前锁稿一致；各段行范围必须**连续且不重不漏**覆盖锁稿全文。改过锁稿就先重跑 `init` 或更新计划里的哈希。

### 2.3 改了锁稿或段稿后门禁失败

**设计如此**：锁稿/段稿/TTS/字幕之间有 SHA-256 链式绑定。改动锁稿必须重新派生全部下游产物（TTS → 注入 → 字幕），不能只改哈希。

## 3. TTS 与字幕

### 3.1 “TTS 复用”后注入报 audio/titles 哈希漂移

「复用」只在文本与三项产物哈希**全部一致**时才成立；磁盘上的 mp3 / titles / manifest 被动过，复用判定会失败——这是保护。删掉 `audio/tts-binding.json` 可强制重跑。

### 3.2 `captions-zh verify` 不一致

字幕分组数据与 `compositions/captions.html` 不同源。重跑：

```bash
node scripts/captions-zh.mjs build --segment <段目录>
node scripts/captions-zh.mjs verify --segment <段目录>
```

### 3.3 字幕行首尾出现空格/空标点行

`captions-zh` 的分组规则会剔除空行与纯标点行。若仍出现，检查是否手工改过 `caption_groups.json`。

## 4. 门禁与交付

### 4.1 `final-look` 前置检查失败

preflight 依次跑：verify → captions verify → animation-map → layout-guard → **baseline** → motion-spec → 官方 check。先看 `[gate]` 输出定位是哪一项，不要先写授权再补检查。

### 4.2 `animation-map.json` 为空/缺失

默认路径 `<段目录>/.hyperframes/anim-map/animation-map.json`。产物缺失时可直接让门禁代跑官方脚本：

```bash
node scripts/gate.mjs animation-map --project <root> --segment <NN> --generate
```

官方脚本自带依赖解析（要 `@hyperframes/producer` 与 `@hyperframes/core`，不在 CLI 包里）。本仓 `bootstrap.sh` 已按锁定版本装好，`hf-env.sh` 导出了 `HYPERFRAMES_SKILL_PKG_VERSION`，官方 loader 从此没有 `@latest` 退路。核对命令：

```bash
node scripts/lib/official-deps.mjs   # 缺包或版本漂移即 exit 1
```

### 4.3 `layout-guard` 报 28px 或“无法判定”

- `px` 直接比较；`cqw`/`vw` 按 STORYBOARD `format` 的真实宽度换算；`rem`/`em` 按 16px 估算；`clamp()` 取下界。
- `var()`/`calc()` 等动态值无法静态判定，按 fail-closed 报错。
- 隐藏元素也可能被扫到；这是已知的保守误报，必要时人工确认后调整元素，而不是放宽门禁。

### 4.3b `baseline` 报「视觉基线不一致」

`gate.mjs baseline` 判四件事，口径全文见 `docs/rules/visual-baseline.md`：

| 报错 | 含义 | 修法 |
| --- | --- | --- |
| 帧内颜色 X 不在 frame.md 声明的色板内 | worker 自造了颜色（官方 `check` 只查 WCAG 对比度，**不查色板归属**） | 换成 `frame.md` `colors:` 里的键值；**透明度变化不算越界**（官方 preset 的 radial glow / shadow 本就是同色不同 alpha） |
| font-size Npx < 28px | 承载性文字过小 | 调大字号。**官方 chrome 令牌（counter/pagenum/rail 等元信息）豁免**，且该值须已在 `frame.md` typography 里声明 |
| frame.md 承载性令牌 X = Npx 低于 28px 下限 | 基线本身有问题——例如官方 `capsule` 的 `label: px 14` | 上调到 ≥28px 或改用 cqw（官方 1.4cqw 只是**下界**，上调不违反官方条款） |
| voice_profile.X 与真源不一致 | 段内 TTS 用错了音色/语速 | 用 `minimax-tts.mjs` 重生成语音（真源：`tools/minimax/scripts/minimax_tts.py` 的 `VOICE_PROFILE`） |

> 官方 `check` 通过**不代表**这三项过了——官方只查 WCAG 对比度与几何，不查色板归属、不查项目级字号下限、不查音色一致性。

### 4.4 `master final-look` / `close` 被拒绝

- `master final-look` 必须已有 `finalize-master.mjs` 生成的 candidate，且 candidate 哈希未漂移；`close` 前必须有 master final-look，candidate 的段列表与输入快照须与当前 state 一致。
- master 批准/收尾后不能再 `set-mp4`、重新 `finalize` 或写段授权（防「批准后换片」）。返工时必须显式重置 master 审批，而不是手工删一个字段继续。

### 4.5 官方 `check --strict` 报 layout 类的码

**先确认 CLI 版本。** `npx hyperframes` 在**项目目录**会去 registry 拉最新 CLI，判定口径不同，结论不可用。一律用 `source ./hf-env.sh` 之后的 `hf`（锁定 0.8.36），或 `node scripts/hf-version.mjs --print`。

**`--strict` = warning 也会 exit 1**（要求 0 error 且 0 warning）。

最常见的三个码：

| 码 | 级别 | 修法 |
| --- | --- | --- |
| `text_occluded` | error | 文字被不透明元素盖住。**优先改设计**：让被盖内容没有文字（保留形状、拿掉文字）。`data-layout-allow-overlap` 豁免不了它；确有「就是要盖住」的意图时才用 `data-layout-allow-occlusion`，且**必须标在那个具体的遮挡元素上** |
| `content_overlap` | warning | 两块文字墨迹盒重叠。中文 Noto Sans SC 的墨迹盒高 ≈ **1.448em**（与 `line-height` 无关），所以**相邻中文行距必须 ≥ 1.5em**；放不下就缩小字号或加大容器，**不要压缩行距** |
| `panel_out_of_canvas` | warning / info | 元素超出画布。主体（≥画布 10%）超界算 info，普通元素算 warning → `--strict` 会失败 |

**不要用 `data-layout-ignore` 绕过字号**；`data-layout-allow-overlap` 只能用于**刻意的交叉叠化**；`data-layout-allow-overflow` 是官方认可的**出画位移**豁免。

> 完整错误码表（锁定版 0.8.36 的 11 个 layout 码）、官方判定阈值与取证见仓库 `docs/architecture/faq-full.md` §4.5。**不要**把本仓自定的门槛（可读窗口、可见字号下限）写成「官方 check 报了这个码」。

### 4.6 `approve --kind start` 报「前序段 NN 无 MP4 或 final look 授权」

看前序段的 `state.json`：下一段的开始授权会**机械确认**前序段，前序段必须同时具备 MP4 绑定和 final-look 授权。

### 4.7 `set-mp4` / `render-ready` 报「渲染前复核未通过」

渲染发生在 final-look 授权**之后**；中间任何改写（官方 Studio preview 会重写 `index.html` 与 `compositions/captions.html`）都会让渲染字节 ≠ 验证字节。`render-ready` 重算盘上产物：7 项单文件 + 语音/字体/BGM/音效四个目录 + 帧集合。

修法：重跑 `captions-zh build` → 官方 assemble → 官方 transitions → `gate preflight` → **重新授权** → 渲染 → `set-mp4`。不要手工改 receipt。

### 4.8 视频播放是黑屏，没有任何画面和声音

用 `gate.mjs mp4` 判：成片必须有视频轨 + 音频轨 + 音频非静音 + 无持续 ≥1s 的全黑区间。

- **有声无画**：装配缺位——`compositions/frames/*.html` 为空或 `index.html` 没引用 clip。
- **有画无声**：音频没注入——检查 `audio_meta.json` 与 `audio/injection-binding.json` 是否存在且与段稿哈希一致。
- **整片黑**：多半是渲染了官方 `init` 的空壳（0 clip）。必须真正执行 Step 2–5。

## 5. 网络、代理与密钥

### 5.1 中国大陆网络

```bash
HARNESS_NPM_REGISTRY=https://registry.npmjs.org npm run bootstrap  # 覆盖 npm 源
HARNESS_PROXY=http://127.0.0.1:7890 npm run bootstrap               # 显式指定代理
HARNESS_NO_PROXY=1 npm run bootstrap                               # 强制直连
```

默认行为：npm 走 npmmirror；GitHub/npm 代理**默认探测** `127.0.0.1:7890`，可达才启用，不可达则直连（不会把流量指向不存在的本地端口导致静默挂死）。

### 5.2 离线 P0 缓存与 MiniMax Key

生产主链可离线完成：脚手架、字幕、装配、check、渲染。仍需联网或有缓存的：TTS 与 BGM 检索（或在 P0 预生成全部段语音）。Key 只从环境变量 `MINIMAX_API_KEY` 读取（macOS 另有 Keychain），不入仓、不入日志、不写进 state 或 manifest；Windows / Linux 只有环境变量一条路。

### 5.4 Windows 专项

**先分清脚本类型，再选 shell。** `*.mjs` 是 Node 脚本，PowerShell 里直接跑；`hf-env.sh` / `scripts/bootstrap.sh` / `scripts/doctor.sh` / `scripts/net-env.sh` 是 bash 脚本，**用 Git Bash 跑**（PowerShell 没有 `source` 与 POSIX 语义）。

| 症状 | 根因 | 处理 |
| --- | --- | --- |
| `hf --version` 输出 `0.8.36` 之外的东西 | PATH 上的 `hf` 是 Python 装的 HuggingFace Hub CLI | 先 `source ./hf-env.sh`（Git Bash），或直接 `node node_modules/hyperframes/bin/hyperframes.mjs` |
| `node node_modules/.bin/hyperframes` 报 `SyntaxError: missing ) after argument list` | `.bin/` 下是 npm 的 sh 包装脚本，node 当 JS 解析 | 用 `node scripts/hf-version.mjs --print` |
| `python3` 存在但一执行就 `exit 49`、无输出 | 命中 Microsoft Store 的 `python3.exe` 存根 | 仓库依次试 `MINIMAX_PYTHON` → `python3` → `python`，且必须真跑一次最小导入才算通过 |
| `~` 指向的「文档」目录不是产品根 | Windows 的「文档」可能被 OneDrive 重定向 | 仓库读 `HKCU\...\User Shell Folders\Personal`；也可用 `--products-root` 指定 |
| 官方 doctor 报 `Chrome: Failed to run ... --version` | `chrome.exe` 是 GUI 子系统程序，`--version` 不写 stdout，官方探测挂到超时 | **探测假阳性**，渲染走 puppeteer-core/CDP 不受影响；本仓判为警告，可设 `HYPERFRAMES_BROWSER_PATH` |
| `hyperframes render` 长时间没输出像卡死 | 首次渲染先下载**锁定的** `chrome-headless-shell`（约 119 MB），**下载期间无进度输出** | 先单独跑一次 `hyperframes browser ensure` |

## 6. 反模式清单

| 反模式 | 为什么错 | 正确做法 |
| --- | --- | --- |
| 先 `state approve final-look`，再补 check | 授权已写入，check 不再是前置 | 让 `state approve` 自己跑 preflight，失败就修产物 |
| 手工改 `state.json` 的 `approvals` / 哈希 | 证据链失去意义 | 重跑对应命令重新派生 |
| 用 `npx hyperframes` 或全局 CLI | 版本可能漂移，离线不可控 | `source ./hf-env.sh` 后用 `hf`，或 `node scripts/hf-version.mjs --print` |
| 用 `hyperframes skills update` 取官方 skills | 拉 main 实时 HEAD，且会删退役 skill | `npm run bootstrap` 按锁定 commit 取回 |
| 在 harness 生成字幕后跑官方 `captions.mjs build` | 覆盖 `caption_groups.json` / `captions.html` | 只跑 `captions-zh build` + `verify` |
| 改段稿后只更新哈希 | TTS 与字幕时间不再对应 | 重跑 TTS → inject → captions |
| master 批准后再换段 MP4 | 批准对象已变化 | 先重置 master 审批，再重新 finalize |
| 在分发包里补 `tests/` 伪装 `npm test` | 测试依赖完整仓库 | 在仓库跑测试；包内明确失败 |

> 完整清单（含 animation-map 逐页登记、包内混入本机文件等）在仓库 `docs/architecture/faq-full.md` §6。

## 7. 仍然无法解决

收集以下信息后再报问题（不要粘贴 API Key）：`hf --version`、`node --version`、`ffmpeg -version | head -1`、`npm test`、`node scripts/gate.mjs verify|preflight --project <root> --segment <NN>` 的输出。

完整规范见 `docs/rules/`；架构审计、深度取证与变更历史在 GitHub 仓库（<https://github.com/suonian/ZWhyperframes-Harness>）的 `docs/architecture/` 与 `CHANGELOG.md`。
