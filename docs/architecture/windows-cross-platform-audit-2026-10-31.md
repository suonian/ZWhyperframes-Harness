# Windows 跨平台适配评估报告（2026-10-31）

> 范围：`ZWhyperframes-Harness` 从「macOS 开发」到「macOS / Linux / Windows 三平台可生产」的全面适配、兼容性与可生产性评估。
>
> 取证原则：**所有结论必须有本机实测支撑**，不接受「按理应该可以」。凡未实测的，一律列进 §6「未验证项」，不写进结论。
>
> 本报告对应的代码改动**未提交**（工作区已 `git add`，未 `commit`）。改动规模：51 个文件，+2074 / −163。

---

## 0. 结论摘要

| 维度 | 结论 |
| --- | --- |
| 是否能跑通生产主链 | **能，且已产出真实成片**。段脚手架 → TTS → 注入 → 字幕 → 门禁 全链实测通过；官方 `check --strict` 在 Windows 上完整执行；官方 `render` 产出**有画面 + 有声音**的 MP4（2 轨：h264 1920×1080@30fps + aac 48kHz 立体声，102/102 帧，exit 0，`blackdetect` 0 命中、`mean_volume -21.2 dB`） |
| 环境自举是否可用 | **能**。分发包冷启动 `bootstrap` → `doctor` 全绿（含从 GitHub 按锁定 commit 取回官方 skills——HTTPS 握手失败时**自动回退 SSH** 成功；junction 链接 60 个 skill 到 3 个发现目录） |
| 测试门禁是否可信 | **能**。81 项，80 通过 / 0 失败 / 1 跳过（跳过项是缺 zsh 时的跨 shell 一致性用例）。顺带修掉一个**空门禁**：官方 `doctor --json` 恒 exit 0，本仓原来判退出码 |
| 平台声明是否属实 | 修复前**不属实**（README/SKILL 写「macOS / Linux」，实际 Windows 上多处必崩）；现已改为真实的三平台声明 |
| 是否有静默错误风险 | 修复前**有**（代理静默直连、Python GBK 乱码、CRLF 哈希漂移、`captions-zh` 静默 exit 0）。已逐项消除 |
| 是否发现平台无关缺陷 | **是**。2 个 P0 级（`gate verify` 误判漂移、`doctor` 空门禁——**任何平台**都会中招），1 个 P2 级 |
| 剩余风险 | 见 §5 / §6。主要是 GitHub runner 侧未实测、OneDrive 重定向场景未实测、`hf` 命令撞名无法在代码层消除 |

---

## 1. 方法

### 1.1 三条并行审计线（只读代理）

| 代理 | 范围 | 主要产出 |
| --- | --- | --- |
| A | Node 脚本（`scripts/*.mjs` + `scripts/lib/*.mjs`） | `.bin` 入口误用、`probe.stdout.trim()` 空值保护、`captions-zh` 主模块判定、OneDrive 重定向、只读目标覆盖 |
| B | Python + 视频脚本（`tools/minimax/scripts/*.py`、`minimax-tts.mjs`、`publish-skillhub.mjs`） | **Windows 管道下 Python stdout 是 GBK**、`write_text` 未锁 LF、exit 处理器抛错 |
| C | 测试 + CI + 文档 | `/bin/bash` 硬编码、**恒定 skip 的隐性失效用例**、CI 无 Windows、约 40 处过时平台声明 |

### 1.2 审计方法

- 先**穷举 POSIX/macOS-only 假设**（`/bin/`、`#!`、`ln -s`、`security`、`/dev/tcp`、`~/`、`python3`、行尾、路径分隔符），再逐条用实测证伪或坐实。
- 证伪过的假设也留档（如：ffmpeg concat 的 Windows 反斜杠路径**正常**、`cmd.exe` 的 `/` 吞并**无风险**）——避免后人重复怀疑。

---

## 2. 修复清单

### 2.1 P0：会直接崩、卡死或静默出错（全部已修）

| # | 症状 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | `node node_modules/.bin/hyperframes` → `SyntaxError: missing ) after argument list` | npm 在 Windows 上生成的是 **sh 包装脚本**，node 当 JS 解析 | `hfCliEntry()` 从 `package.json` 的 `bin` 字段解析包内真实入口；`runHf`/`doctor`/`bootstrap`/`hf-env` 统一改走；新增 `scripts/hf-version.mjs` |
| 2 | `python3` 执行即 `exit 49`、无任何输出 | 命中 Microsoft Store 的 `python3.exe` 存根 | `resolve_python()`：**必须真跑一次最小导入**才算通过；候选 `MINIMAX_PYTHON`→`python3`→`python` |
| 3 | 代理探测永远判「不可达」→ **静默直连** | 同 #2：探针用 `python3` | 改用真实解释器 |
| 4 | `git sparse-checkout`：`pathspec '/skills/' did not match` | MSYS 把 `/skills/` 改写成 `D:/Program Files/Git/skills/` | pathspec 走 `--stdin`（不经参数转换） |
| 5 | 官方 skills 软链变成整树副本 → **智能体读到旧版官方合同** | MSYS `ln -sfn` 在 Windows 退化为复制 | 新增 `scripts/lib/link-official-skills.mjs`：Windows 建 **junction**（免管理员、可穿透） |
| 6 | CRLF 破坏 `SKILL.md` frontmatter 断言与用例计数；跨平台产物哈希漂移 | 检出时行尾未固定 | 新增 `.gitattributes`（`* text=auto eol=lf` + 二进制标记） |
| 7 | `npm install --prefix` 路径形态错 | MSYS POSIX 路径被当 Windows 路径 | `native_path()`（`cygpath -m`） |
| 8 | `renameSync` 覆盖只读目标 → **EPERM**（POSIX 无此限制） | Windows `MoveFileEx` + `REPLACE_EXISTING` 对只读目标失败 | `replaceFileSync()`：只在 `EPERM`/`EACCES` 时去只读属性重试 |
| 9 | Python stdout 在 Windows 管道下是 GBK → 乱码；含 emoji 时 `UnicodeEncodeError` **硬崩** | Windows 管道默认 cp936 | 3 个 Python 脚本强制 UTF-8；`minimax-tts.mjs` 注入 `PYTHONIOENCODING=utf-8`/`PYTHONUTF8=1` |
| 10 | Python 产物未锁 LF → 跨平台哈希不同 | `write_text` 用平台换行 | `write_json_file()` 写字节锁 LF |
| 11 | `captions-zh.mjs` **静默 exit 0**（看上去成功，实际什么都没做） | 主模块判定大小写/分隔符敏感 | 改用 `realpathSync` 两侧比较 |
| 12 | 产品根在 OneDrive 重定向下错位 | 拼 `~/Documents` | 读 `HKCU\...\User Shell Folders\Personal` 真实值 |
| 13 | 跨盘路径守卫漏判 | `relative()` 跨盘返回绝对路径 | 补 `isAbsolute(rel)` |
| 14 | `ffprobe` 缺失被伪装成代码 bug（`TypeError`） | `spawnSync` 命令不存在时 `stdout=undefined` | 收口 `probeDurationSeconds()` → `{ok, seconds\|reason}` |
| 15 | 测试硬编码 `/bin/bash`、`/bin/zsh` | POSIX 路径 | 新增 `tests/lib/shell.mjs`：实际跑一次判定；Windows 从 `where git` 反推 Git Bash，排除 WSL 存根 |
| 16 | 「无 python3」用例**恒定 skip**（隐性失效） | `symlinkSync` 从未被调用 | 修好；子进程 env 补 Windows 必需变量 |
| 17 | CI 无 Windows 矩阵 | — | 新增 `test-windows` job（`shell: bash`，Node 22/24） |
| 18 | `doctor.sh` 的「hyperframes doctor 通过」是**空门禁** | 官方 `doctor --json` **永远 exit 0**（官方文档原话："always exit 0; gate on payload ok"），判退出码等于没检查 | 新增 `scripts/lib/doctor-report.mjs`：解析 payload，按「必需项 / Chrome 假阳性 / 可选项」三档判定；`doctor.sh` 改为按 payload 判定 |

### 2.2 平台无关缺陷（Windows 端到端跑出来的，任何平台都会中招）

**`gate verify` 误判「STORYBOARD 帧顺序/时长漂移」** —— 这是本轮最重要的发现，且**不是 Windows 专属**：

```
注入绑定存的是：按帧解析出的 meta.duration
                （帧缺 - duration: 行时 → 字符串 "undefined"）

门禁比的是：  用正则从原文数 - duration: 行
                （缺行时 → 空数组 []）

两套表示法在「帧缺 duration 行」时必然不等 → 未漂移的产物被误判为漂移
```

而官方 `sync-durations`（`vendor/skills/faceless-explainer/scripts/audio.mjs:263-284`）**只更新已有的 `- duration:` 行、从不新增**（缺行时它自己只是打印 `no \`- duration:\` line for frame(s) ...`）。所以「帧缺 duration 行」是**合法的官方产物形态**，却必然被门禁判死。

后果：`gate verify` 恒红 → `preflight` 恒红 → `final-look` 永远拿不到 → **整条流水线在第 1 段就死锁**，且失败信息（"帧顺序/时长不一致"）完全指错方向。

修复：门禁改用与注入**同一套解析**（`readStoryboard`）比对「帧号 + 时长」，信息量不小于旧实现；漂移检测仍由 `storyboard_sha256` 兜底。新增回归用例，并做**变异验证**（撤掉修复当场变红）。

**`publish-skillhub.mjs` 的 exit 清理处理器**抛错会打出与发布无关的栈（Windows 临时目录可能被杀毒软件占用）→ 包 try/catch。

**`doctor.sh` 的「hyperframes doctor 通过」是空门禁** —— 同样是**平台无关**的：官方 `doctor --json` 在 `cli.js` 里算完 `allOk` 后只 `console.log` JSON 就 `return`，**没有任何 `process.exit(1)`**，所以退出码恒为 0。官方文档也明说 "always exit 0; gate on payload ok"。本仓原来判退出码，等于「官方检查全红也显示通过」。

而且官方 payload 的顶层 `ok` 是**所有检查的 AND**（`outcomes.every((o) => o.ok)`），其中包含 whisper-cpp / Kokoro / MusicGen / Docker 这些**可选本地回退**——直接 gate 顶层 `ok` 在任何没装本地回退的机器上都会永远误判。

改法：新增 `scripts/lib/doctor-report.mjs`，按**本仓生产到底需要什么**分三档判定：

| 档 | 项 | 判定 |
| --- | --- | --- |
| 必需 | Node.js / FFmpeg / FFprobe / Archive extractor / Environment | 缺任一项 → 失败 |
| Chrome | detail 含 "Not found" | → **失败**（渲染确实不可用） |
| Chrome | detail 含 "Failed to run" | → **警告**（Windows 探测假阳性，见 §5） |
| 可选 | Version（有新版）/ whisper-cpp / Kokoro / MusicGen / Docker | 只提示，不判失败 |

配套 4 条回归用例（必需项齐全 / Chrome 假阳性 / Chrome 真缺失 / payload 不可解析）。

**成片内容门禁缺失 → 交付「黑屏无声片」** —— 第三个**平台无关**的空门禁，由用户报障挖出（详见 §6.2.1）：

```
官方 init 铺的 index.html = 0 clip 的空壳
跳过官方 Step 2–5（帧 / 装配 / 字幕）直接渲染
  → MP4 存在 ✓  非空 ✓  哈希正常 ✓  时长对得上 STORYBOARD ✓
  → 但整片全黑 + 没有音频轨 = 用户看到的「黑屏，没有任何画面和声音」
```

已有门禁（`gate.mjs mp4`）只查「存在 / 非空 / 哈希 / 时长」，**这四条空壳片全都通过**。这是和上面两个同类的病：*用能通过的形式指标代替了真正的验收*。

改法：新增 `scripts/lib/media-probe.mjs`（**只读数，不做判断**），把成片的三件事读成机器可判定的事实：

| 事实 | 探针 | 判据 |
| --- | --- | --- |
| 轨道结构 | `ffprobe -show_streams -of json` | 视频轨 ≥ 1 **且** 音频轨 ≥ 1 |
| 音频响度 | `ffmpeg -af volumedetect` | `mean_volume > -60 dB`（数字静音实测 −91.0 dB） |
| 黑帧区间 | `ffmpeg -vf blackdetect=d=1.0:pix_th=0.10` | 无持续 ≥1.0s 的整片全黑区间 |

`gate.mjs mp4` 与 `state.mjs set-mp4`（**绑定时**就查，黑屏片进不了 master 链条）据此 fail-closed。配套 7 条探针用例 + 1 条端到端用例（`set-mp4` 拒绝黑屏片且状态不被改写）。

**诚实声明**：这条门禁只证明「成片有画面、不是全黑、有声音、不是静音」，**不证明**内容对不对、字幕对不对、语音与画面对不对得上——那些属于复审证据，机器看不见。

---

## 3. 能力矩阵

✅ = 本机实测通过；⚠️ = 部分验证/有残留限制；✖️ = 不适用。

| 环节 | macOS | Linux | Windows | 本机证据 |
| --- | --- | --- | --- | --- |
| `npm ci` / 依赖安装 | ✅ | ✅ | ✅ | 137 包 / 12s，npmmirror 镜像生效 |
| 官方 skills 按锁定 commit 取回 | ✅ | ✅ | ✅ | 冷启动 bootstrap：commit `f86aae6` 取回并校验通过 |
| 官方 skills 分发到发现目录 | ✅ symlink | ✅ symlink | ✅ junction | 60 skill × 3 目录，免管理员 |
| HF CLI 版本校验 | ✅ | ✅ | ✅ | `0.8.36`（走包内真实入口） |
| `hf()` 生产入口 | ✅ | ✅ | ✅ | shell function 正确遮蔽 PATH 上撞名的 `hf` |
| 官方 `hyperframes doctor` | ✅ | ✅ | ⚠️ | win32：Node / FFmpeg / FFprobe / 磁盘 / 缓存 / 归档器 / 环境 全 PASS；**Chrome FAIL 是探测假阳性**（见 §5）；**Version FAIL** 是「有新版 0.8.223 可用」的提示，非故障 |
| 官方 `init`（段脚手架） | ✅ | ✅ | ✅ | 段目录 7 文件落地 |
| 官方 `build-frame`（Step 2） | ✅ | ✅ | ✅ | capsule preset → `frame.md` + `caption-skin.html` |
| MiniMax TTS | ✅ | ✅ | ✅ | **真实 API**：mp3 + 23 词级时间；二次运行幂等复用 |
| 词级时间注入 | ✅ | ✅ | ✅ | 官方 sync-durations，2/2 帧有语音 |
| 中文字幕分组 | ✅ | ✅ | ✅ | 4 组 / 23 词级 token，build 与 verify 一致 |
| `gate verify` | ✅ | ✅ | ✅ | 修复后通过 |
| 官方 `check --strict` | ✅ | ✅ | ✅ | Windows 实跑：Lint / Runtime / Layout / Motion / Contrast 全部执行 |
| 成片内容门禁（黑屏/无声片拦截） | ✅ | ✅ | ✅ | `gate mp4` + `set-mp4` 双点 fail-closed；空壳等价片实测被拒（报出「没有音频轨」+「0.00s→3.37s 全黑区间」），真实成片放行 |
| ffmpeg concat（master 拼接） | ✅ | ✅ | ✅ | 测试套件「state/gate/finalize 全链」用真 ffmpeg 通过 |
| 渲染成片（Chrome + ffmpeg） | ✅ | ✅ | ✅ | **真实成片实测**：102/102 帧、3.4s、15.9s、exit 0；产物 **2 条轨道**（h264 / 1920×1080 / 30fps + aac / 48kHz / 立体声）；`blackdetect` 0 命中、`volumedetect mean_volume = -21.2 dB`。前提是官方锁定的 `chrome-headless-shell` 已就位（见 §6.2 的下载风险） |
| Keychain 凭证 | ✅ | ✖️ | ✖️ | Windows / Linux 只有环境变量一条路 |

---

## 4. 本机环境依赖清单

| 依赖 | 本机实测 | 备注 |
| --- | --- | --- |
| Node.js | v24.16.0 | 需 ≥22 |
| Git for Windows | `D:\Program Files\Git\bin\bash.exe` | **不在 PATH 上**；PATH 上的 `bash` 是 WSL 存根 `C:\WINDOWS\system32\bash.exe`。仓库的 `findBash()` 已自动反推 |
| Python | `D:\Python\Python313\python3.exe` | 补自 `python.exe`（绕开 Store 存根） |
| ffmpeg / ffprobe | `D:\Python\ffmpeg-2025-07-07-git-d2828ab284-essentials_build\bin` | 必需 |
| Chrome | 系统安装于 `C:\Program Files\Google\Chrome\Application\chrome.exe` | 渲染用；官方 CLI 另会下载**锁定的** headless shell 到 `%USERPROFILE%\.cache\hyperframes\` |
| `MINIMAX_API_KEY` | 用户级环境变量（125 位） | 不入仓、不入日志 |
| 代理 | `127.0.0.1:7890` | 可达 → 自动启用 |
| 产品根 | `C:\Users\<user>\Documents\ZWhyperframes-products` | 与注册表 `Personal` 真实值一致 |

---

## 5. 风险分级与残留项

### P3（残留，需人工关注，无法在代码层消除）

| 项 | 说明 | 缓解 |
| --- | --- | --- |
| **`hf` 命令撞名** | Python 装的 HuggingFace Hub CLI 在 `Scripts\hf.exe` 提供同名命令（实测 1.6.0）。不 `source hf-env.sh` 就直接调会拿到**错误版本** | 已在 `AGENTS.md` / `README` / `faq.md` §5.4 / `README.package.md` 四处标注「先 source」；PATH 优先级由用户环境决定，代码无法消除 |
| **官方 doctor 的 Chrome 检查在 Windows 上恒 FAIL** | Windows 上 `chrome.exe` 是 **GUI 子系统程序**，`--version` 不把版本写到 stdout，官方 CLI 探测时会一直挂到超时被杀（实测 `signal SIGKILL, ETIMEDOUT`；直接跑 `chrome.exe --version` 15s 无输出被强杀）。**渲染走 puppeteer-core/CDP 启动，不依赖这个探测**，所以这是**探测假阳性**，不是渲染不可用 | 本仓 `doctor-report.mjs` 把「Failed to run」判为**警告**并给出解法（`HYPERFRAMES_BROWSER_PATH` / `hyperframes browser ensure --force`）；官方给的自救提示与本仓一致 |
| **`~` 在 PowerShell 展开到用户目录** | 不是「文档」目录（后者可能被 OneDrive 重定向） | Node 侧已按 Known Folder 解析真实路径；命令行手写路径仍需用户用绝对路径或 `--products-root` |
| **杀毒软件占用文件** | AV 持有句柄导致 `rmSync`/`renameSync` EPERM/EBUSY | 清理异常已 try/catch；只读目标已重试。**但占用期间的 EBUSY 仍会失败** |
| **仓库根残留空目录 `.envcheck/`** | 本机验证脚本暂存区，安全策略禁止删除 | git 不跟踪空目录，不影响提交；`.gitignore` 已覆盖 |

### 已排除的伪风险（留档，避免后人重复怀疑）

| 假设 | 结论 | 证据 |
| --- | --- | --- |
| ffmpeg concat 的 Windows 反斜杠路径会炸 | **不会** | `file 'D:\...\a.mp4'` → exit 0，产物 2.000000s（两段各 1s）；反倒是转义形式 `C\:/...` 才失败 |
| `cmd.exe` 会吞掉 `/` 参数 | **本仓无风险** | 全部 `spawnSync` 数组传参，不经 shell 字符串拼接 |
| 目录遍历顺序随文件系统变 → 哈希跨机不可复现 | **不会** | 目录遍历已全部 `.sort()` |

---

## 6. 未验证项（明确标注，不写进结论）

### 6.1 GitHub Actions `windows-latest` runner

`test-windows` job 已写好，YAML 解析正常（双 job：`test` / `test-windows`；矩阵 Node 22/24；`shell: bash`）。但 runner 的实际 **PATH / bash / `python3` 解析结果**只能等 CI 实跑确认。

> 风险提示：GitHub 的 windows runner 上 `python3` **不存在**（只有 `python`）。仓库的 `resolve_python()` 会自动回退，理论上没问题；但这是**推断**，不是实测。

### 6.2 官方渲染成片 —— **已验证通过**（本轮补齐；本节已关闭，保留在 §6 仅便于追溯）

Windows 上官方 `hyperframes render` **完整跑通**，且分两次取证，两次意义不同：

**（1）空壳渲染 —— 只证明「渲染管线能跑」**

用官方脚手架的初始 `index.html`（`#root` 内 0 个 clip）渲染：

```
300/300 帧 · 10.0s · 21.8s · exit 0
ffprobe: h264 / 1920×1080 / 30fps / duration=10.000000s / 18902 bytes / nb_streams=1
```

产物**只有 1 条视频轨、没有音频轨**——即「能出片，但片子里没有内容」。这一条**不能**作为「生产可出片」的证据。

**（2）真实内容渲染 —— 证明「生产链能出可看的片」**

按官方 `faceless-explainer` Step 2–6 补齐真实内容（brand token 重混字体 → 充实 `STORYBOARD.md` → 官方 `frame-packets.mjs` + 2 个 frame-worker 子智能体建帧 → 官方 `assemble-index.mjs` / `transitions.mjs` / `captions` → 官方 `check --strict` → 官方 `render`）后：

```
102/102 帧 · 3.4s · 15.9s · exit 0
编译期元数据: videoCount=0, audioCount=2, staticDuration=3.386, width=1920, height=1080
编码期: hasAudio=true, isPngSequence=false
ffprobe: nb_streams=2
  stream 0: h264 / 1920×1080 / 30fps / duration=3.400000
  stream 1: aac  (LC) / 48000 Hz / stereo / duration=3.392000
size: 1316727 bytes
```

**画面非黑**：`ffmpeg -vf blackdetect=d=0.1:pix_th=0.10` **0 命中**；从成片抽帧（t=0.93s / t=2.62s）肉眼可见完整版式（WHY 问号主卡 / HOW 三段流程卡 + 中文字幕「为什么要做这件事。」「我们怎么做。」）。
**声音非静音**：`volumedetect` → `mean_volume = -21.2 dB`、`max_volume = -3.7 dB`（纯静音会是 −91 dB 量级）；音频包络从 0.02s 起抬升，与两段 TTS 语音的起始对齐。

本仓门禁在这份真实内容上同样全绿：

```
gate verify       ✓ 段 01 输入同源（段级锁稿/TTS/注入绑定一致）
gate layout-guard ✓ 帧内可见字号均 ≥ 28px（2 帧，宽度基准 1920px）
gate check        ✓ 官方 check --strict 通过（含 lint + 字幕带 keep-out）
官方 check --strict  明细: Lint 0 error/0 warning · Runtime 0/0 · Layout 0 issues(10 samples)
                    · Motion 0/0 · Contrast 16/16 WCAG AA · Check passed
```

渲染用的是官方锁定的 `chrome-headless-shell`（152.0.7977.30），走 puppeteer-core/CDP 启动——**不依赖** `chrome.exe --version` 那个会挂死的探测。这同时证实了 §5 里「Chrome 检查在 Windows 上是探测假阳性」的判断。

#### 6.2.1 顺带查清的一个生产级陷阱：官方脚手架会产出「黑屏片」

用户报「视频播放时是黑屏，没有任何画面和声音」。根因**不是**平台问题，而是**内容与装配的缺位**，取证如下：

| 证据 | 读数 |
| --- | --- |
| 交付 MP4 的轨道 | `nb_streams=1`（只有 h264 视频，**无音频流**） |
| 源 `index.html` 的 clip 数 | **0**（只有官方脚手架生成的空 `#root`） |
| 段内已存在的语音 | `assets/voice/01.wav`、`02.wav` **都在，但无人引用** |

即：官方 `init` 铺好的是**空壳**（0 clip），若只跑渲染就必然得到一段有轨无画、无声的片。**结论**：官方流程里「渲染」是最后一步，「帧」才是内容；跳过 Step 2–5 直接渲染 = 交黑屏片。这条与平台无关，任何平台都会中招。

修复路径（全部走官方 CLI/脚本，未自造渲染器）：

1. `build-frame.mjs --preset capsule --tokens` 用品牌 token 重混字体 → **Noto Sans SC**（官方字体缓存已有 909 个文件、覆盖中文；preset 原字体 Bodoni Moda / Space Grotesk 不在官方缓存也不在自动解析清单里，会导致字体缺失）。
2. 充实 `STORYBOARD.md`（`duration` / `status` / `src` / `scene` / `focal` / `roles` / 时间轴场景序列）。
3. `inject-audio-meta.mjs` 重新派生注入绑定（真实时长 1.861s / 1.525s）。
4. 官方 `frame-packets.mjs` 生成 `_role.md` + 每帧 packet → 按官方 DISPATCH 合同派发 frame-worker 子智能体建帧（首次派发因 `stream interrupted` 失败，按官方 WAIT 合同重派一次成功）。
5. 官方 `assemble-index.mjs` → `transitions.mjs inject/verify` → 官方 captions → `check --strict` → `render`。

途中还撞到一条**官方 `--strict` 的语义细节**（`dist/cli.js` 的 `buildReport`）：

```js
ok: errorCount === 0 && (!options.strict || warningCount === 0)
```

即 `--strict` 下**lint 的 warning 也算失败**。本段帧的 4 个 `studio_missing_editable_id` warning（时间轴可见的 `class="clip"` 容器缺稳定 id）曾导致 `Check failed`；给 4 个 clip 容器补上 `id` 后转绿。这是**内容层修复**，不是平台差异。

过程中查清的一件**可生产性风险**（与渲染能否跑无关，但影响生产排期）：

- 首次渲染会触发官方 `browser ensure`，从 Google 的 Chrome-for-Testing CDN 下载约 **119 MB** 的 `chrome-headless-shell`。
- 官方自带下载器在本机只有 **~13 KB/s**（实测 13.1 KB/s，剩余 107 MB 需 **132 分钟**），且**下载期间终端没有任何进度输出**——看起来像卡死。
- 网络本身没问题：同一 URL 直连/经代理的分段 GET 都正常（1 MB 分别 3.4s / 2.7s）。用 `curl` 断点续传下载同样的文件只用了约 1 分钟。
- 本机缓存里已有一份**旧版** headless shell（`win64-131.0.6778.85`，完整），但 CLI 锁定 152.0.7977.30，**旧版不会被复用**。
- 下载会创建 `%USERPROFILE%\.cache\hyperframes\.chrome.install.lock` 并独占（读它会 `Access denied`），这是正常的安装锁。

**给生产的建议**：首次渲染前先在**联网窗口**跑一次 `hyperframes browser ensure`，把 119MB 的下载与生产渲染分开；不要在生产主链里等它。

已覆盖的部分：ffmpeg concat 由测试套件「state/gate/finalize 全链」用真 ffmpeg 通过；官方 `check --strict` 在 Windows 上完整执行（Lint / Runtime / Layout / Motion / Contrast 全部跑通）；真实内容成片已产出（见上）。

### 6.3 OneDrive 重定向

本机「文档」未被重定向（注册表 `Personal` = `%USERPROFILE%\Documents`），代码按真实值解析的逻辑已就位，但**重定向场景未实测**。

### 6.4 真实 `git clone` 冷启动

已用**等效路径**验证：分发包（不含 `node_modules` / `vendor`）→ `bootstrap` → `doctor` 全绿。但 `.gitattributes` 的行尾策略在**全新 clone** 上是否生效，未实测。

### 6.5 macOS / Linux 回归

本轮所有修改都改了**跨平台共享代码**（`harness.mjs` / `gate.mjs` / `state.mjs` / 3 个 Python 脚本 / CI 配置 / 文档）。这些只在 **Windows 侧**验证过；macOS / Linux 需现有 CI 的 `test` job 复核。

### 6.6 `~/.mmx/config.json` 是否作为第三凭证源

**本轮明确未做**（需用户拍板）。理由：违反「不引入新的密钥形态」这一跨文档安全不变量。已改为把 key 注入**已获许可的环境变量通道**（用户级 `MINIMAX_API_KEY`），密钥值未打印、未入仓、未入日志。

---

## 7. 后续建议（按优先级）

1. **先在 CI 上跑一次 `test-windows`**，把 runner 实测结果回填 §6.1，删除该未验证项。
2. **把渲染前的 Chrome 预热写进 P0 清单**：官方 `browser ensure` 在本机只有 ~13 KB/s 且无进度输出（§6.2）。P0 阶段把它做完，生产阶段就不碰网络。
3. **决定 `~/.mmx/config.json` 是否入列凭证源**（§6.6）——这是策略变更，需要明确授权。
4. **决定是否把 Windows 补丁上提上游 HyperFrames**：`.gitattributes`、junction 链接器、`hfCliEntry` 这类属本仓管理层，不必上游化；但上游若能提供跨平台的 CLI 入口解析、skills 分发、以及**官方 doctor 恒 exit 0 时的可判定输出**，本仓可退回更薄的实现。
5. **考虑在 `doctor.sh` 里加一条 Windows 专项检查**：检测 PATH 上的 `hf` 是否为 HuggingFace Hub CLI（撞名），给出明确警告——这是本仓唯一无法在代码层消除的 Windows 陷阱。
6. **考虑给官方 `doctor` 的 Chrome 探测提一个 upstream issue**：Windows 上 `chrome.exe --version` 必然挂到超时，官方因此把「Chrome」判成 FAIL。改成读版本文件 / 走 CDP 的 `Browser.getVersion` 即可（CDP 本来就拿得到版本）。
7. ~~**正式交付一支完整视频**~~ → **已完成**（§6.2）：按官方 Step 2–6 补齐真实内容后产出有画面 + 有声音的成片。**留下的生产规则**：官方 `init` 铺的是 0 clip 的空壳，渲染前必须确认 `index.html` 里 `data-composition-src` 的帧数 > 0 且 `audioCount > 0`，否则必然交黑屏片（§6.2.1）。
8. ~~**把「黑屏/无声」做成机器门禁**~~ → **已完成**（§2.2 末节）：新增 `scripts/lib/media-probe.mjs`，`gate mp4` 与 `set-mp4` 双点 fail-closed（有视频轨 + 有音频轨 + 音频非静音 + 无持续 ≥1s 的全黑区间），配套 8 条用例。
9. **剩下的待办不变**：CI 上跑一次 `test-windows`（§6.1）；macOS / Linux 回归（§6.5）；`~/.mmx/config.json` 是否作第三凭证源（§6.6）；是否把 Windows 补丁上提上游（§7 第 4 条）。
