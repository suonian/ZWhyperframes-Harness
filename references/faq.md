# 常见问题、错误索引与反模式

> 本文件是分发包内的排障入口。规范本身仍以 `AGENTS.md` 与 `docs/rules/` 为唯一所有者；这里只回答“遇到这个症状先查什么”。

## 0. 30 秒索引

| 症状 | 先看 |
| --- | --- |
| `[hf-env] HF CLI 缺失或版本不符` | §1.1 |
| `bootstrap` 卡住、LFS 报错、GitHub 取回失败 | §1.2 |
| `bootstrap` 中途 Ctrl-C/断网 | §1.6 |
| `npm run bootstrap` 没有走国内镜像 | §1.3 |
| `hyperframes skills update` / `npx skills add` 失败 | §1.4 |
| 包内没有 `tests/`，`npm test` 退出 1 | §1.5 |
| `init` 报“需要 --source”或留下半成品 | §2.1 |
| `segment` 报计划哈希不一致 / 不连续 | §2.2 |
| 改动锁稿后 `gate verify` 失败 | §2.3 |
| TTS 显示“复用”但注入报哈希漂移 | §3.1 |
| `captions-zh verify` 不一致 | §3.2 |
| `final-look` 前置检查失败 | §4.1 |
| `animation-map.json` 为空 / 缺失 | §4.2 |
| `layout-guard` 报 28px 或“无法判定” | §4.3 |
| `master final-look` / `close` 被拒绝 | §4.4 |
| 官方 `check --strict` 报 `content_overlap` / `text_occluded` / `panel_out_of_canvas` | §4.5 |
| `approve --kind start` 报「前序段无 MP4 或 final look 授权」 | §4.6 |
| `set-mp4` / `render-ready` 报「渲染前复核未通过」 | §4.7 |
| 中国大陆网络下 GitHub 取回慢 | §5.1 |
| 不确定命令参数/成功输出 | `references/commands.md` |
| 不确定哪些能力真的有门禁 | §6 |

## 1. 安装与自举

### 1.1 `hf-env` 报 HF CLI 缺失或版本不符

**原因**：`node_modules` 未安装，或安装到的 HyperFrames 不是锁定的 `0.8.36`。

```bash
npm run bootstrap
node node_modules/.bin/hyperframes --version   # 必须输出 0.8.36
source ./hf-env.sh
```

`hf()` 在版本不符时会拒绝执行；这是有意的 fail-closed，不是环境误报。

### 1.2 `bootstrap` 取回官方 skills 失败

先区分失败阶段：

- **GitHub 不可达 / 超时**：设置 `HARNESS_PROXY=<地址>`，或让 `HF_SKILLS_REPO_URL` 指向可用的 SSH/镜像地址：
  ```bash
  HF_SKILLS_REPO_URL=git@github.com:heygen-com/hyperframes.git npm run bootstrap
  ```
- **LFS smudge 失败**：`bootstrap` 已使用 non-cone sparse-checkout 精确锚定 `/skills/`，并设置 `GIT_LFS_SKIP_SMUDGE=1`；若仍失败，说明上游结构或网络通路变化，按“合同审计”处理，不要跳过。
- **取回的 commit 不符**：脚本会用 `git rev-parse FETCH_HEAD^{commit}` 校验；失败即停止，不会把错误版本写进 `vendor/`。
- **vendor 内容哈希不一致**：下次 bootstrap 会自动重新取回；这是防“手工改过 vendor 却被当成锁定版本”。

失败时旧 `vendor/skills` 会由 cleanup trap 恢复，不会出现“旧的已删除、新的没落地”。

### 1.3 `npm run bootstrap` 没走国内 npm 镜像

`net-env.sh` 默认把 `npm_config_registry` 设为 `https://registry.npmmirror.com`，即使 npm 在 lifecycle 中注入了自己的值。需要改回官方源或私有源时显式设置：

```bash
HARNESS_NPM_REGISTRY=https://registry.npmjs.org npm run bootstrap
```

代理开关见 `HARNESS_NO_PROXY` / `HARNESS_PROXY`；MiniMax 走 `api.minimaxi.com` 直连豁免。

### 1.4 为什么不能用 `hyperframes skills update` / `npx skills add`

两者都无法真正固定在锁定 commit：

- CLI 的 `latest` 指向上游 main 实时 HEAD，且会移除已退役 skill；
- `npx skills add owner/repo@<sha>` 实测只在发现阶段认 SHA，装出的内容仍可能是 main HEAD。

正确路径只有 `scripts/bootstrap.sh` 的 git 按 SHA 取回。详见 [上游合同审计](https://github.com/suonian/ZWhyperframes-Harness/blob/main/docs/architecture/hf-contract-audit-2026-10-21.md)。

### 1.5 分发包没有 `tests/`

这是有意的：测试依赖完整仓库、`vendor/` 与开发依赖，只在 GitHub 仓库运行。包内执行 `npm test` 会明确失败：

```
[test] 缺少 tests/ 目录：分发包不包含测试，测试只能在仓库中运行。
```

不要在分发包里伪造 `tests/` 或把 `npm test` 改成空转。

### 1.6 `bootstrap` 中途 Ctrl-C / 断网

直接重跑即可。`bootstrap` 的 cleanup trap 会在失败时：

- 删除本次临时目录；
- 如果已经挪走旧 `vendor/skills` 而新内容没落地，先把半成品清掉，再把旧目录放回；
- 不把失败状态写进 commit stamp 或内容哈希。

如果是在 `npm install` 阶段中断，重跑会复用 npm 缓存；如果是在 `git fetch` 阶段中断，重跑会重新 fetch。不要在失败后手工创建 `vendor/.skills-commit` 或 `vendor/.skills-content-sha256` 来“跳过检查”。

## 2. 项目输入与分段

### 2.1 `init` 报“需要 --source”/目录非空

`--source` 现在是必填项；缺省会拒绝，避免把整个当前目录误归档。项目目录非空也会拒绝覆盖。

```bash
node scripts/new-video.mjs init \
  --project ~/Documents/ZWhyperframes-products/<project> \
  --source <资料包文件或目录>
```

若上次 `init` 失败，当前版本会清理本次创建的项目目录（原本不存在时）或至少不创建锁稿目录；先检查 `00-项目总控/state.json` 是否存在，再决定是否手工清理。

### 2.2 `segment` 报计划哈希不一致 / 行范围不连续

`segment-plan.json` 必须包含：

- `locked_script_sha256`：与当前锁稿全文哈希一致；
- 每段 `text_sha256`：与锁稿该段行区间正文一致（接受带/不带末尾换行两种规范形式）；
- 连续、完整覆盖全稿的 `lines`。

计划首次被接受后，其文件哈希写入 `state.json`；之后改计划会失败，除非显式重新初始化/迁移。

### 2.3 改了锁稿或段稿后门禁失败

锁定稿是内容真源，段稿是其冻结片段。改段稿必须重跑 TTS；改锁稿属于违约事件，必须评估受影响段并重新冻结/重跑，不能只刷哈希。

`gate verify` 会检查：

- 锁稿全文哈希与 `state.json`；
- `segment-manifest.json` 的行区间与哈希；
- `user_script.txt` 是否等于当前锁稿的该段行区间；
- TTS 三件套（mp3/titles/manifest）与注入绑定。

早期阶段（尚未生成音频）使用：

```bash
node scripts/gate.mjs verify --project <root> --segment <NN> --allow-missing
```

最终 preflight 不允许 `--allow-missing`。

## 3. TTS 与字幕

### 3.1 “TTS 复用”后注入报 audio/titles 哈希漂移

复用只在 **文本哈希 + mp3 + titles + manifest** 四项全部一致时发生。任一文件被改、被截断或换音色，都会重新生成。若仍报漂移：

```bash
rm -rf <段目录>/audio
node scripts/minimax-tts.mjs --segment <段目录>
node scripts/inject-audio-meta.mjs --segment <段目录>
```

不要手工改 `tts-binding.json` 或 `injection-binding.json`。

### 3.2 `captions-zh verify` 不一致

`caption_groups.json` / `compositions/captions.html` 只能由本仓脚本确定性生成。常见原因：

- 官方 `captions.mjs build` 在 harness build 之后运行，覆盖了同一组路径；
- 手改了字幕分组或 HTML；
- 画布尺寸/STORYBOARD 在 build 后变化；
- 使用了旧版脚本生成的数据。

正确做法是重新跑：

```bash
node scripts/captions-zh.mjs build --segment <段目录>
node scripts/captions-zh.mjs verify --segment <段目录>
```

`caption-overrides.json` 会写成官方空 shim；不要把自定义分组写进官方渲染器。

### 3.3 字幕行首尾出现空格/空标点行

当前合同按语块生成单行字幕，会 trim 语块首尾空白；连续终止标点（`？！`）会合并到同一语块。若发现异常，先确认是否手工改过 `caption_groups.json`，再重跑 `captions-zh build`。

## 4. 门禁与交付

### 4.1 `final-look` 前置检查失败

`state approve --kind final-look` 会先运行 `gate preflight`，要求：

- `compositions/frames/*.html` 非空；
- `index.html`、`audio_meta.json`、`audio/injection-binding.json` 存在；
- `caption_groups.json` 与 `compositions/captions.html` 存在且可复算；
- `animation-map.json` 非空；
- 可见字号 ≥28px（px/cqw/vw/rem/em/clamp 下界，竖屏按真实画布宽度换算）；
- 官方 `check --strict` 通过（含字幕带 keep-out）。

先逐项看 `[gate]` 输出，再修复；不要先写授权再补检查。

### 4.2 `animation-map.json` 为空/缺失

官方 `animation-map.mjs` 对每个 composition 产出一份 map。默认路径：

```
<段目录>/.hyperframes/anim-map/animation-map.json
```

门禁要求 JSON 可解析且非空；`{}` 不算。逐页生成时使用 `--out` 指定目录，并在 receipt/state 中登记，不要只保留最后一页。

脚本的 `--out` 是**相对当前工作目录**解析的：在段目录里跑才会落到 `<段目录>/.hyperframes/anim-map/`，否则会掉进仓库根目录。首次运行它还会按需拉取 `@hyperframes/producer` 与 `@hyperframes/core`——两者版本号与 CLI 对齐，需固定时设 `HYPERFRAMES_SKILL_PKG_VERSION=0.8.36`，允许一次性引导安装时再设 `HYPERFRAMES_SKILL_BOOTSTRAP_DEPS=1`（引导走 `npm install --ignore-scripts --no-save`，不改 `package.json`）。

### 4.3 `layout-guard` 报 28px 或“无法判定”

- `px` 直接比较；`cqw`/`vw` 按 STORYBOARD `format` 的真实宽度换算；`rem`/`em` 按 16px 估算；`clamp()` 取下界。
- `var()`/`calc()` 等动态值无法静态判定，按 fail-closed 报错。
- 隐藏元素也可能被扫到；这是已知的保守误报，必要时人工确认后调整元素，而不是放宽门禁。

### 4.4 `master final-look` / `close` 被拒绝

- `master final-look` 必须已有 `finalize-master.mjs` 生成的 candidate，且 candidate 哈希未漂移。
- `close` 前必须有 master final-look；candidate 的段列表与输入快照必须与当前 state 一致。
- master 批准/收尾后，不能再 `set-mp4`、重新 `finalize` 或写段授权；这是防止“批准后换片”。
- 需要返工时，必须显式重置 master 审批，而不是手工删一个字段继续。

### 4.5 官方 `check --strict` 报 layout 类的码（`content_overlap` / `text_occluded` / `panel_out_of_canvas` / …）

**先确认 CLI 版本。** `npx hyperframes` 在**项目目录**（不是 harness 仓）会去 registry 拉最新 CLI，版本与锁定版不同、判定口径也不同，结论不可用。一律用 `source ./hf-env.sh` 之后的 `hf`（锁定 0.8.36），或 `node <harness>/node_modules/.bin/hyperframes`。

**`--strict` = warning 也会 exit 1。** 门禁要求 **0 error 且 0 warning**（info 不阻断）。已完成的第 1 集在锁定版下是 `0 error(s), 0 warning(s), 1 info(s)` → Check passed。

**锁定版 0.8.36 的 layout 审计产出这 11 个码**（已在 `node_modules/hyperframes/dist/commands/layout-audit.browser.js` 逐条核对）：

| 码 | 级别 | 含义 |
| --- | --- | --- |
| `clipped_text` | **error** | 文字被容器裁掉（容器需 `overflow: visible` 或把容器放大） |
| `text_box_overflow` | **error** | 文字盒溢出容器 |
| `text_not_painted` | **error** | 文字根本没画出来（出画、零尺寸、被透明化） |
| `text_occluded` | **error** | 文字被不透明元素盖住 |
| `content_overlap` | warning | 两块文字墨迹盒互相重叠 |
| `container_overflow` | warning | 容器内容溢出 |
| `escaped_container` | warning | 元素跑出自己的容器 |
| `panel_out_of_canvas` | warning / info | 元素超出画布；**面积 ≥ 画布 10%（`PANEL_HERO_AREA_FRACTION`）的主体算 info，其余算 warning** |
| `canvas_overflow` | info | 画布级溢出 |
| `connector_detached` | warning | 连接线脱离宿主（本片禁连线，正常不触发） |
| `connector_orphan` | warning | 连接线没有宿主（同上） |

**它不产出 `line_unread`，也不产出 `text_below_floor`** —— 这两个码属于更新版 CLI（0.8.188）或本仓自有门禁。**不要把自查结论写成「官方 check 报了这个码」。**

**`text_occluded` 是最容易被忽略的 error**（本片「一个硬块砸下来盖住上一帧内容」的镜头必踩）：

- 判定：对每个可见文字元素的 client rects 打 **9 个 x 探针 × 3 个 y 探针**，用 `elementsFromPoint` 找它**上面**的不透明元素。
- **短标签（≤16 字且不含空格）命中任意一个探针就报错**；长句（散文）需要被覆盖比例 ≥ 0.15 才报。
- **`data-layout-allow-overlap` 豁免不了它** —— 该标记只作用于 `isSolidTextBlock`（文字之间的空间竞争），`occludedTextIssue` 这条路径不查它。`data-layout-ignore` 则会让整个子树被跳过（别拿它遮丑）。
- **但官方另有一个遮挡专用标记：`data-layout-allow-occlusion`**（官方 `lint-validate-inspect.md`：「an element is meant to cover text」）。审计里的 `hasAllowOcclusionFlag(element)` 走 `element.closest("[data-layout-allow-occlusion]")`，即**标在元素上，该元素及其后代被豁免**。
  → **纪律**：优先**改设计**（让被盖内容没有文字），因为「元素就是要盖住这段文字」是极少数镜头才成立的意图；确有此意图时才加标记，且**必须标在那个具体的遮挡元素上**，不要标在 scene / root 包裹层上，否则会把一片无关的层级问题一起豁免掉。
- **正解是让被盖住的元素里没有文字**：需要「盖住上一帧内容」时，保留被盖内容的**形状**，但把它的**文字拿掉**（硬切场景里观众不会察觉），或者让判决块只盖住没有文字的区域。
- 顺带：`pointer-events:none` 的元素不会被 `elementsFromPoint` 命中，所以它**不会被判为遮挡者**——但这是拿实现细节绕检查，别依赖它。

**`content_overlap` 用的是文字墨迹盒（Range 的 `getBoundingClientRect`），不是元素盒子。**

- 中文 Noto Sans SC 的 Range 盒高 ≈ **1.448em**（ascent 1.16em + descent 0.288em），**与 `line-height` 无关**；拉丁 Space Grotesk ≈ 1.27em。
- 所以 `line-height < 1.448` 时墨迹会向上/向下各溢出盒子 (1.448−L)/2 em。
- **相邻中文行的行距必须 ≥ 1.5em。** 拉丁数字不吃这个约束。
- 两行大字连同上下标签放不进原容器时，正确做法是**缩小字号或加大容器**，不是压缩行距。
- 判定还有「重叠面积 > 较小块的 20%」的阈值，零星几像素不报。

**`panel_out_of_canvas`**：元素超出画布边界即报；**主体（≥画布 10%）超界只算 info，普通元素超界算 warning → `--strict` 会失败**。所以入画动画若把元素从画外位移进来，要么让位移幅度小于画布余量（元素仍有一截留在画内），要么让那个元素大到算主体（info），要么保证它的移动窗口不与采样点重叠。

**下面两条是本仓/本项目的门槛，不是官方 CLI 的报错码** —— 照做是因为它们确实是质量底线，但**不要**在报告里写成「官方 check 报了 X」：

**可读窗口（对应新版的 `line_unread`）**：元素 opacity ≥ 0.8 才算「可读」，要求在离开或变化前保持 **0.5s + 0.3s/词**（2 个词 → 1.10s）。做法是让文字**更早落位**并在帧尾留出这段静止读停，而不是把它塞进最后半秒；不得改 `data-duration`。

**可见字号下限（对应新版的 `text_below_floor`）**：可见文字 < 28px 且停留 ≥0.5s 即不合格。`cqw` 换算 1cqw = 19.2px@1920 → 用 ≥1.5cqw。**这一条由本仓 `gate layout-guard` 机器强制**（见 §4.3）：它在帧 HTML 上静态扫 `font-size`，`cqw`/`vw` 按 1920 基准换算、`rem`/`em` 按 16px 根字号保守估算，**无法静态判定即 fail-closed**。

**`gsap_repeated_fromto_without_baseline`**：同一元素有多个 `fromTo` 时，靠前的要 `immediateRender: false`；更稳的是先用 `tl.set(el, {...}, 0)` 钉住静止基线（渲染零变化）。

**`overlapping_gsap_tweens`**：同一属性的两个 tween 边界相接（如 3.34s–3.34s）也会报——把后一个推后一帧，或改用 `tl.set` 建基线。

**底线**：不要用 `data-layout-ignore` 绕过字号；不要用 `data-layout-allow-overlap` 掩盖两段静止文字互压——只有**刻意的交叉叠化**才允许（先例：第 1 集 `04-headcount-math.html` 的数字柱）；**`data-layout-allow-overlap` 也豁免不了 `text_occluded`**——遮挡要走 `data-layout-allow-occlusion`，而那更应该先用「改设计」解决。另：`data-layout-allow-overflow` 是官方认可的**出画位移**豁免（入场/出场 travel 用），把它标在承载位移的世界层上是正当用法（先例：段 04 的 `08-pushed-to-utility.html` 把整张桌面包在超宽的世界层里做推移）。

### 4.6 `approve --kind start` 报「前序段 NN 无 MP4 或 final look 授权」

先看前序段的 `state.json`：下一段的开始授权会**机械确认**前序段，前序段必须同时具备 MP4 绑定和 final-look 授权。

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 前序段 `mp4` 为 null | 还没跑 `set-mp4` | 先渲染并 `set-mp4` |
| 有 `mp4` 但 `approvals.final_look` 缺失 | `final_look` 被作废过（字段 `final_look_revoked_at`） | 真正换片过，必须重新送审：重跑 `state.mjs approve --kind final-look`（内部会先跑 preflight）；重审通过后 `final_look_revoked_at` 会被清掉 |

**作废规则**：`set-mp4` 只在「本段此前已绑定过 MP4，且这次绑的不是同一片（路径或 SHA-256 变了）」时作废旧 final-look。首次绑定与同一片重绑都保留授权——官方顺序是「final-look 授权 → 渲染 → set-mp4」，首次绑定正是那次授权的正常收尾。

**不要手工改 `state.json` 去补授权**；用 `state.mjs approve` 重跑，让 preflight 重新验证并重新绑定 gate receipt 哈希。

### 4.7 `set-mp4` / `render-ready` 报「渲染前复核未通过」

**症状**：盘上产物已不是 preflight 验证过的那份——报错会逐项点名（`index.html：内容已变化` / `assets/voice/：内容已变化` / `帧集合：内容已变化` …）。

**根因**：`preflight` 只在**授权那一刻**跑一次，而渲染发生在授权**之后**。中间任何一次改写都会让渲染用的字节 ≠ 验证过的字节。生产上最常见的元凶是**官方 Studio preview**——它在运行时重写 `compositions/captions.html` 与 `index.html`。receipt v3 起还钉住了渲染真正读取的四个资产目录：`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/`（这些目录不进任何单文件绑定，此前完全在门禁视野之外——换掉一个 wav、改一个字体、换一条配乐，门禁都不会响）。

**处理**（顺序不能颠倒）：

1. **停掉 Studio preview**（它会随时再写一次）；
2. 重跑 `captions-zh build` → `captions-zh verify` → 官方 `assemble-index.mjs` → 官方 `transitions.mjs inject`；
3. 重跑 `node scripts/gate.mjs preflight --project <root> --segment <NN>` 重新派生 receipt；
4. **重新取得 final look 授权**（`state.mjs approve --kind final-look`）——授权绑定 receipt 哈希，receipt 变了授权就失效；
5. 重新渲染，再 `set-mp4`。

**不要**去改 receipt 里的哈希「对齐」盘上文件：那是伪造一次从未发生过的验证。

**receipt 版本过旧（v1 / v2）**：v1 没绑定任何资产目录，v2 绑了语音/字体但漏了 BGM/音效、且目录摘要用的是扩展名白名单（未知扩展名看不见）。两者都会被 `render-ready` 直接拒绝并要求重跑 preflight——这是实话，不是故障。

**对存量项目的影响面**：`render-ready` 只在 `set-mp4`（绑定 MP4）时触发。**已经绑定过 MP4 的段落不受影响**——`state.json` 里的 MP4 记录与授权记录原样保留，已收尾（`master.closed=true`）的项目也不需要回补。只有当你要**重新绑定**某段的 MP4（返工重渲）时，v1 receipt 才会挡住；此时按上面 5 步重跑 preflight 并重新取得授权即可——注意返工重渲后 MP4 变了，旧 final-look 会自动作废，这是设计意图。

**目录型绑定的语义**：`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/` 是目录，receipt 记的是「目录内全部文件的聚合摘要」（除 `.DS_Store` / `Thumbs.db` 这类 OS 噪音外一律纳入——用扩展名白名单会漏掉未知扩展名，而渲染可能照样读它）。若某段**本来就没有本地字体**（只用系统字体）、或没有 BGM，receipt 把该目录记为 `null`——这不是缺陷，`render-ready` 也不会因此判漂移：语义是「preflight 当时不存在 ⇒ 现在也不该存在」，只有**凭空多出**一个目录才算漂移（那意味着渲染会多读一批没被验证过的字节）。

## 5. 网络、代理与密钥

### 5.1 中国大陆网络

```bash
# npm 默认已走 npmmirror；需要覆盖时：
HARNESS_NPM_REGISTRY=https://registry.npmmirror.com npm run bootstrap

# GitHub 代理不可达时直连；显式指定：
HARNESS_PROXY=http://127.0.0.1:7890 npm run bootstrap

# 强制关闭代理：
HARNESS_NO_PROXY=1 npm run bootstrap
```

官方 skills 必须从 GitHub 按锁定 commit 取回；如果网络完全不可达，这是 P0 环境准备问题，不是生产脚本能绕过的。生产中途的离线范围见 README/SKILL：脚手架、字幕、装配、check、render 可离线；TTS/BGM 检索需要联网窗口或 P0 预生成。

### 5.2 离线 P0 缓存（同 OS/架构）

如果生产机不能访问 GitHub，可在一台可联网、**同 OS/同 CPU 架构/同 Node 大版本**的准备机上：

```bash
npm ci
npm run bootstrap
tar -czf harness-p0.tgz node_modules vendor
```

在离线机解压到技能目录后再跑 `npm run doctor`。不要跨 macOS/Linux 或跨 Node ABI 复用 `node_modules`；`vendor/` 也应在同一锁定 commit 下生成。缓存包不进入仓库，也不进入 SkillHub 分发包。

### 5.3 MiniMax Key

只从环境变量或 macOS Keychain 读取：

```bash
export MINIMAX_API_KEY="..."
# 或
security add-generic-password -a minimax -s MINIMAX_API_KEY -w '...'
```

脚本不会把 Key 写进绑定、manifest 或日志。`MINIMAX_PYTHON` 可指定解释器（默认 `python3`）。

## 6. 反模式清单

| 反模式 | 为什么错 | 正确做法 |
| --- | --- | --- |
| 先 `state approve final-look`，再补 check | 授权已写入，check 不再是前置 | 让 `state approve` 自己跑 preflight，失败就修产物 |
| 手工改 `state.json` 的 `approvals` / 哈希 | 证据链失去意义 | 重跑对应命令重新派生 |
| 用 `npx hyperframes` 或全局 CLI | 版本可能漂移，离线不可控 | `source ./hf-env.sh` 后用 `hf`，或 `node node_modules/.bin/hyperframes` |
| 用 `hyperframes skills update` 取官方 skills | 拉 main 实时 HEAD，且会删退役 skill | `npm run bootstrap` 按锁定 commit 取回 |
| 在 harness 生成字幕后跑官方 `captions.mjs build` | 覆盖 `caption_groups.json` / `captions.html` | 只跑 `captions-zh build` + `verify` |
| 改段稿后只更新哈希 | TTS 与字幕时间不再对应 | 重跑 TTS → inject → captions |
| 只保留最后一页 animation-map | 其他页没有动效审计证据 | 每页 `--out` 或统一生成并登记 |
| master 批准后再换段 MP4 | 批准对象已变化 | 先重置 master 审批，再重新 finalize |
| 把 `RELEASE-HANDBOOK.md` 或本机文件打进包 | 泄露本机上下文/发布操作 | 包只通过 `build-skill-package.mjs` 生成 |
| 在分发包里补 `tests/` 伪装 `npm test` | 测试依赖完整仓库 | 在仓库跑测试；包内明确失败 |

## 7. 仍然无法解决

收集以下信息后再报问题（不要粘贴 API Key）：

```bash
hf --version
node --version
ffmpeg -version | head -1
npm test
node scripts/gate.mjs verify --project <root> --segment <NN>
node scripts/gate.mjs preflight --project <root> --segment <NN>
```

完整规范见 `docs/rules/`；架构审计与变更历史只在 GitHub 仓库提供。
