# ZWhyperframes-Harness 审计报告

- 审计对象：`~/Documents/ZWhyperframes-Harness`，HEAD `d5b5a5f`（= `origin/main`），工作区干净。
- 审计日期：2026-10-24。
- 基线：审计时 `npm test` **59/59 通过、0 失败、0 跳过**；修复后 **68/68 通过**。`node --check`、`bash -n`、`python3 -m py_compile` 全部通过。
- 方法：通读全部非 `vendor/` 源码与文档；交叉比对 AGENTS / SKILL / README / docs/rules / CHANGELOG / RELEASE-HANDBOOK / packaging 脚本；运行测试、打包、发布干跑；并在临时目录复现关键路径（不修改仓库）。

> 结论先行：这个仓库的**代码质量与测试基线是好的**，版本号、相对链接、打包排除 `vendor/`、bootstrap 的 sparse-checkout 等基础项都经得起检查。真正的问题集中在两处：
> 1. **门禁没有编排，核心承诺“不按就过不去”并不成立**——审计时 `gate.mjs` 的 10 个命令没有被任何生产脚本调用，授权由 `state.mjs` 直接写入；`final-look` 既可在空脚手架上通过，也可先授权再补 check。**修复后**新增 `preflight`（共 11 个命令），`state approve final-look` 强制先跑 preflight 并绑定 receipt。
> 2. **分发包与它自己的文档不一致**——审计时本地专用的 `RELEASE-HANDBOOK.md` 会被打进技能包；`tests/` 被排除但 README/SKILL 声称包含；包内有 22 处相对死链（13 个不同目标）+ 1 张破图；在包内跑 `npm test` 会“0 用例、退出码 0”式地假绿。**修复后**包内 README 使用 `README.package.md` 映射、排除本地手册/审计报告，死链 0，`npm test` 缺 tests 时非零退出。

**统计**：功能/一致性发现 27 项（P0 6 / P1 21），文档与代码冲突 29 条，重复 8 组，次要/健壮性项 32 条。

### 修复进展（2026-10-24）

| 范围 | 状态 |
| --- | --- |
| P0（F-01/02/03/04/15/16） | **已修**：gate preflight + state 强制 receipt、verify 默认严格、master candidate/close 冻结、发布包排除本地手册、README.package 映射、npm test 缺 tests 非零退出 |
| P1 核心（F-05/05b/06/07/08/09/10/10b/11/12/13/14/14b） | **已修**：animation-map 非空校验、mp4 强制绑定、layout 竖屏/`clamp/rem/vw`、captions verify 进 preflight、plan 双哈希、TTS 复用哈希、init 原子/`--source` 必填、官方 Stage 映射、storyboard `---`、连续标点 |
| P1 分发/环境（F-17/17b/18/18b/19/20/21/22） | **已修**：包内死链 0、UA 读版本、移除 pnpm 字段、13 项 bootstrap 清单、annotated tag `^{commit}`、caption-overrides shim |
| 冲突 C-01…C-29 | **大部分已修**；历史 CHANGELOG 中 21 目录/10 产物等条目保留原貌，新增 `[未发布]` 说明 |
| 次要 M | 高价值项已修（timeout、原子写、approval shape、UTF-8 路径、vendor hash、install 暂存、publish 清理、CI 检查）；M-07 隐藏元素误报、M-12 空格保留、M-31 BGM 幂等仍为已知限制 |
| 验证 | `npm test` **68/68**；打包 42 文件 / 324.8KB / 请求体 338.1KB；包内相对死链 0；`npm run publish-skill -- --dry-run` 通过。另在 现有产品的一个段副本上重建注入/字幕后 `gate preflight` 与 `state approve final-look` + `gate final-look` 通过；旧 v1 注入、旧字幕 HTML、24px 字号分别被 preflight 正确阻断 |

> 本报告正文保留审计时的原始证据与严重度；上面这一节记录修复后的状态，避免“报告说的问题早已修掉”造成误读。

**如果只看 8 条，按这个顺序修：**

1. **F-01/F-02/F-03**：门禁没有编排；`final-look` 可在空脚手架上通过；`state approve` 先于 check 写入授权；`verify` 对缺失/损坏绑定放行。
2. **F-04**：`master final-look` 不绑定 candidate；`close` 之后 candidate 仍可被 `finalize-master`/`set-mp4` 替换。
3. **F-15**：本地专用 `RELEASE-HANDBOOK.md` 被打进公开技能包。
4. **F-16**：包内没有 `tests/`，但文档声称有；包内 `npm test` 0 用例且退出 0。
5. **F-09**：`minimax-tts` 复用忽略 audio/titles/manifest 哈希，TTS 漂移后无法通过“重跑”修复。
6. **F-10b**：漏写 `--source` 会把整个当前目录复制进产品资料包。
7. **F-11**：`capture`/`frame.md`/BRIEF 的官方 Stage 映射错误。
8. **F-13**：全片离线声明与 TTS 在线主链冲突。

---

## 1. 审计范围与验证基线

| 项 | 结果 |
| --- | --- |
| 仓库自有文件 | 约 80 个（不含 `vendor/`、`node_modules/`） |
| `vendor/skills` | 20 个 skill 目录 + 1 个散落测试文件 = 21 个条目；锁定 commit `f86aae6` |
| `npm test` | 59 pass / 0 fail / 0 skipped（25.3s） |
| 版本号 | `package.json` / `package-lock.json`（两处）/ `CITATION.cff` / `SKILL.md` 均为 `0.2.3` |
| 打包干跑 | 40 个文件 / 331.3 KB / 请求体 344.2 KB / changelog 2995 字符 |
| 包内 `npm test` | `tests 0`、`pass 0`、退出码 0（静默空转） |
| bootstrap sparse-checkout | 本地用临时 git 仓库复现：只检出 `skills/`，未拉入 `.agents/skills/` |
| 官方合同路径 | `hyperframes-core/references/*`、`hyperframes/references/pitch-round.md`、`faceless-explainer/*` 均存在 |

---

## 2. P0：必须先修的问题

### F-01 门禁没有编排：10 个 gate 命令没有任何生产脚本调用

**位置**：`scripts/gate.mjs:224-241`；`scripts/state.mjs:38-66`；`scripts/finalize-master.mjs:21-32`；`scripts/new-video.mjs:196-201`。

`scripts/` 下的生产脚本里，只有 `gate.mjs` 自身提到 gate；`state.mjs`、`new-video.mjs`、`finalize-master.mjs` 都不调用它（只有 `tests/` 会为了测试而调用）。`state.mjs` 是文档声明的“状态与授权记录的唯一写入入口”（README:202），但 `approve --kind final-look` 只检查“已有 start 授权”，不跑 `check --strict`，也不要求 `verify` / `layout-guard` / `animation-map` / `captions-zh verify` 任一通过。

**影响**：§3.1 的“缺一项即 fail-closed”只是命令清单，不是流水线。主智能体完全可以：
- 不跑 `pitch-round` 就开案；
- 不跑 `animation-map` 就标 `animated`；
- 不跑 `verify` 就进入 final look；
- 先 `state approve final-look`，再（甚至不）跑 `gate final-look`；
- 不跑 `gate mp4` 就进入下一段。

此外，`gate` 对授权的判断只是 truthy（`entry.approvals?.final_look` / `?.start`），没有 schema 校验；手工把 `state.json` 写成 `"start": true` 也能通过 `gate authorized` / `gate final-look` 的存在性检查。

这与 AGENTS“不通过就卡住”、README“不按就过不去”的定位直接冲突。

**证据（复现）**：
1. 临时项目执行 `state approve --kind start`，再执行 `state approve --kind final-look`，直接成功；此时段内没有任何帧、没有 TTS、没有 check。
2. 随后 `gate final-look` 仍然通过（见 F-02）。

**建议**：新增单一入口（如 `gate pipeline --project … --segment …`），按固定顺序跑完 §3.1 + 校验链；把 `state approve` 改为必须携带 gate receipt（含各 gate 产物哈希），否则拒绝写入；或在 `state` 内直接调用同一编排函数。

---

### F-02 `final-look` 可在空脚手架上通过，渲染授权实际可绕过 check

**位置**：`scripts/gate.mjs:102-113`；`scripts/state.mjs:44-63`；`docs/rules/production-workflow-rules.md:42,78-81`；`README.md:105`。

`gate final-look` 只做两件事：`entry.approvals?.final_look` 存在 + 在段目录跑 `hyperframes check --strict`。它对“段里有没有帧、有没有 index.html、有没有 audio_meta、有没有 captions、有没有 animation-map”一概不检查。

**复现**：对 `hyperframes init --example=blank` 生成的空项目（没有 `compositions/frames`）运行 `hyperframes check --strict`，输出：

```
0 errors, 0 warnings
Layout: 0 issues across 9 sample(s)
Contrast: 0/0 text checks pass WCAG AA
Check passed
```

因此 `gate final-look` 在“空项目 + 已写入 final_look”时也会报“已获 final look 授权（且官方 check --strict 通过）”。而 `state approve` 又能先写入授权——**“渲染授权不可绕过 check”是假的**：授权确实可以先于 check 发生，check 也可以通过一个没有任何内容的项目。

**影响**：这是本仓最核心的“门禁即证据”承诺，当前实现不能支撑。规则文档 §3.1 与 CHANGELOG 0.2.0 的“渲染授权不可绕过检查”应降级表述，或把授权写入与 check 绑定。

**建议**：`final-look` 至少断言：`compositions/frames/*.html` 非空、`index.html` 存在、`audio_meta.json` 与 `injection-binding` 存在且哈希一致、`caption_groups.json` 与 `captions.html` 存在且 `captions-zh verify` 通过、`animation-map.json` 非空；任一缺失即失败。并把 `state approve final-look` 改为只能消费 `gate final-look` 的 receipt。

---

### F-03 `verify` 对缺失绑定 fail-open，且 e2e 把它当作正确行为

**位置**：`scripts/gate.mjs:59-92`；`tests/pipeline-e2e.test.mjs:285-307`（尤其 294）。

`runVerify` 的逻辑是：

```js
const binding = readJsonIfPresent(...);
if (binding) { ... }
const injection = readJsonIfPresent(...);
if (injection) { ... }
```

两个文件缺失时直接跳过，不报错。更糟的是 `readJsonIfPresent`（`scripts/lib/harness.mjs:41-48`）会把 **JSON 损坏**也吞成 `null`：把 `tts-binding.json` 写成 `not-json`，`gate verify` 仍退出 0。e2e 在段脚手架完成后、创建任何音频之前就断言 `gate verify` 退出 0（`tests/pipeline-e2e.test.mjs:294`）。这意味着“锁稿 → TTS → 注入绑定 → MP4”的链只在**已经存在且可解析**时才被检查；链不存在时，门禁是绿的。

**影响**：README:93 “帧口播必须与锁稿归一化后全等才放行”、§3.1 “缺一项即 fail-closed”都只能靠流程自觉。`final-look` 又不调用 `verify`，所以“没有 TTS/注入”的项目可以一路走到 final look。

**建议**：拆成 `verify-inputs`（要求 binding）与 `verify-optional`（早期阶段）；或者在 `final-look` 中强制要求 `injection-binding.json` 存在且 schema 当前、所有哈希一致。

---

### F-04 master final-look 不绑定 candidate；close 之后 candidate 仍可被替换

**位置**：`scripts/state.mjs:93-98`（final-look 不检查 candidate）；`scripts/state.mjs:99-113`（close 只校验“当前 candidate”）；`scripts/finalize-master.mjs:21-61`（无 close 检查）。

复现（临时项目，已渲染 1s MP4）：

1. 只做 `state approve final-look`（段级）→ `state master --kind final-look`：**成功**，此时 `master.candidate` 仍是 `null`。
2. `finalize-master.mjs` 生成 candidate → `state master --kind close`：成功。
3. 重新渲染一个不同颜色的 MP4 → `state set-mp4` → `finalize-master.mjs`：**再次成功**，`state.master.candidate.sha256` 从 `eb7dea…` 变成 `2ca01f…`，而 `state.master.approvals.close` 仍为 `true`。

**影响**：
- “master final look（候选预览授权）”在候选还不存在时就能被记录，授权对象不可考；
- “收尾审批（绑定 exact 候选哈希）”只在 close 当时的瞬间成立；close 之后 `finalize-master` / `set-mp4` 仍可改变 candidate，审批记录不会失效；
- 段级 `state set-mp4` 只替换 MP4/哈希并把状态置 `rendered`，**不清除** `approvals.final_look`；把一段的 MP4 换成另一段 2s 视频后，final-look 仍是 ✓，不同 cut 可复用旧授权；
- `finalize-master` 注释“concat 后写不可变 candidate”不成立（候选名只到秒级精度、`-y` 会覆盖同名文件，重跑会覆盖状态）。

**建议**：`master final-look` 必须要求 `master.candidate` 存在，并把 candidate 的 `sha256` 写入 approval record；`close` 后设置 project 级 `closed` 状态，`finalize-master` / `set-mp4` / `approve` 在该状态下必须拒绝；`set-mp4` 变更 MP4 时清除该段 `final_look`（或要求重新授权）；candidate 文件名加入高精度时间或哈希，避免覆盖。

---

### F-15 本地专用 `RELEASE-HANDBOOK.md` 被打进技能包

**位置**：`RELEASE-HANDBOOK.md:3-6`；`scripts/build-skill-package.mjs:53-61`；打包实测。

`RELEASE-HANDBOOK.md` 明确写着：

> 本文件不在版本控制内，仅存在于本机工作副本……排除方式为 `.git/info/exclude`。

但 `build-skill-package.mjs` 只排除了 `tests`、`docs/architecture`、`docs/plans` 和一组固定文件名，**没有排除它**。`node scripts/build-skill-package.mjs --root . --out <tmp>` 的实际产物顶层包含 `RELEASE-HANDBOOK.md`；`npm run publish-skill -- --dry-run` 也把它计入 40 个文件 / 331.3 KB。

**影响**：一旦执行发布，这个“仅本机”的手册会公开到 SkillHub，其中包含：
- 本机绝对路径（用户主目录下的工作副本）；
- SkillHub 用户命名空间（具体值已隐去）；
- `~/.skillhub/credentials.json` 的路径与字段说明；
- 某 API Key 的轮换备注。

这是本报告里最直接的安全/分发问题。

**建议**：在 `CONTENT_EXCLUDE_FILES` 加入 `RELEASE-HANDBOOK.md`；更稳妥的是把所有非 `SKILL.md`/`README.md` 的根级 `.md` 默认排除，只允许显式白名单进入发布包。

---

### F-16 `tests/` 被排除，但 README/SKILL 声称包含；包内 `npm test` 0 用例假绿

**位置**：`scripts/build-skill-package.mjs:53`；`README.md:149`；`README.en.md:149`；`SKILL.md:82`；`package.json:8`。

`CONTENT_EXCLUDE_DIRS` 明确包含 `"tests"`，但两份 README 都写：

> 两种方式装出的内容一致：`SKILL.md`、`AGENTS.md`、四份 `docs/rules/`、`scripts/`、`tests/`、`tools/`。

`SKILL.md:82` 还写 `npm test # 59 项测试`。实际安装后的包内没有 `tests/`；执行 `npm test` 时 Node 的 glob 匹配不到文件，输出 `tests 0 / pass 0` 并**以 0 退出**——这不是通过，是空转。

**影响**：技能包用户按 SKILL.md 的快速开始跑测试，会得到一个“绿色”的空结果；贡献者/用户无法验证安装包。这也违背 CONTRIBUTING “测试必须非空转”的纪律。

**建议**：二选一——把 `tests/` 纳入包（注意 460KB 体积上限），或在 `SKILL.md`/README 明确写“分发包不含测试，测试只在仓库运行”，并把 `package.json` 的 `test` 改成在 `tests/` 缺失时非零退出（例如 `node -e` 检查存在性后再跑）。

---

## 3. P1：正确性与一致性

### F-05 `animation-map` 只查“文件存在”，`{}` 也能过

**位置**：`scripts/gate.mjs:142-152`；`tests/pipeline-e2e.test.mjs:372-377`。

门禁只 `existsSync`，不校验 JSON 是否可解析、是否包含帧/时间线/采样数据。e2e 甚至写入 `"{}"` 并断言通过。

**影响**：无法证明 animation-map 真的被生成过；与“留下可校验产物”的定位不符。

**建议**：校验 JSON 可解析且至少包含官方脚本输出的顶层字段（如 `report`/`frames`/`timeline` 中实际存在的键），并记录生成命令与输入 composition 的哈希。

---

### F-05b `mp4` 门禁在“状态无绑定”时回退到任意 `renders/video.mp4`，0.2 秒也能过

**位置**：`scripts/gate.mjs:162-173`。

```js
const mp4 = entry.mp4?.path ?? join(segmentDir, "renders", "video.mp4");
...
const duration = Number(probe.stdout.trim());
if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) fail(...)
if (entry.mp4 && entry.mp4.sha256 !== sha256File(mp4)) fail(...)
```

当 `state.json` 里没有 `mp4` 绑定时，门禁直接信任 `renders/video.mp4`，只检查“文件存在、非空、ffprobe 时长 >0”；没有与 STORYBOARD/audio 的时长对照，也没有“这是本段渲染”的证明。实测 0.2 秒的测试 MP4 也能通过。哈希绑定只在 `entry.mp4` 存在时执行。

**影响**：`gate mp4` 的“段 MP4 校验”可以是一个任意短视频；`finalize-master` 的 candidate 时长只与 state 的 `duration_s` 相加比较，若 state 也被 `set-mp4` 成这些短视频，整条 master 仍能通过。

**建议**：`mp4` 必须要求 `entry.mp4` 存在（先 `set-mp4`）；将 `duration_s` 与 STORYBOARD 总时长/音频时长对照（容差可配置）；解码校验容器/分辨率/音频轨；不要回退到未绑定的默认路径。

---

### F-06 `layout-guard` 只识别 `px`/`cqw`，且 `cqw` 固定按 1920 宽换算

**位置**：`scripts/gate.mjs:204-221`（214 正则，216 换算）。

- 只匹配 `font-size: <数字>px|cqw`；`clamp()`、`var()`、`rem`、`em`、`vw` 全部漏检。官方 presets 中就有 `font-size: clamp(16px, 1.5vw, 22px)`、`0.95rem` 这类写法。
- `cqw` 固定乘 `19.2`（假定 1920 宽）。对 `1080x1920` 竖屏，`1cqw = 10.8px`；`1.5cqw` 实际 16.2px，门禁却算成 28.8px 并通过。

**复现**：`1080x1920` 项目 + `font-size: 1.5cqw`，`gate layout-guard` 输出“✓ 帧内可见字号均 ≥ 28px”。

**影响**：28px 底线在竖屏/方形/`clamp`/`rem` 场景下是假的；同时它会把官方 preset 中 12–24px 的装饰性小字当成违规，产生误报。

**建议**：从 STORYBOARD `format` 读取画布宽高；解析 `clamp()`（取下界）与 `rem/em`（按根字号）；或直接把字号检查交给官方 `check` 的 layout 规则，并只对“可见文本节点”做人工/机器复核。

---

### F-07 `captions-zh verify` 没有任何门禁调用；官方 `captions.mjs` 会写同一组路径

**位置**：`scripts/captions-zh.mjs:319-344`；`vendor/skills/faceless-explainer/scripts/captions.mjs:67-72,166-205`；`docs/rules/captions-contract.md:16-17`。

- `captions-zh.mjs` 写入 `caption_groups.json` 与 `compositions/captions.html`；
- 官方 `captions.mjs build` **默认也写这两个路径**；
- 官方 Step 5/6 的说明会让主智能体运行官方 `captions.mjs build`；
- 没有 gate/脚本在 final look 前运行 `captions-zh verify`。

**影响**：只要官方 `captions.mjs build` 在 harness build 之后运行一次，字幕合同分组就被官方“按词数/静音”分组静默覆盖；`gate` 不会发现。`captions-contract.md` 承诺的“机器合同……不一致即阻断”没有落地。

**建议**：在 `final-look` 中强制 `captions-zh verify`；给 harness 产物加标记（例如 `caption_groups.json` 写入 `producer: "harness"` + 输入哈希），或让 harness 写到独立路径并在 assemble 时显式选用；禁止在同一项目里同时运行两种 captions build。

---

### F-08 分段计划的 SHA-256 完全未被校验

**位置**：`scripts/new-video.mjs:128-142`；现有产品的 `00-项目总控/segment-plan.json` 实际含 `locked_script_sha256` 与每段 `text_sha256`。

`validateSegmentPlan` 只检查 `segments` 非空、行范围连续、覆盖全文；**不读** `locked_script_sha256`，也不读每段 `text_sha256`，更不把 plan 哈希写入 `state.json`。

**复现**：把 `segment-plan.json` 的 `locked_script_sha256` 和 `text_sha256` 全部改成 64 个 `0`，`new-video.mjs segment` 仍以 0 退出。

**影响**：`segment-production-rules.md:13` “分段计划锁定全文、每段正文与范围的 SHA-256；脚手架只接受已锁定计划”未实现。换一份行范围相同但正文不同的计划，脚手架会接受。

**建议**：`validateSegmentPlan` 校验 `plan.locked_script_sha256 === state.locked_script.sha256`、每段 `text_sha256 === sha256(锁稿行区间)`；`state.json` 增加 `segment_plan.sha256`，`gate verify` 再校验一次。

---

### F-09 `minimax-tts` 的“复用”忽略音频/字幕/ manifest 哈希，会把用户锁进死循环

**位置**：`scripts/minimax-tts.mjs:29-34`；`scripts/inject-audio-meta.mjs:34-37`。

复用条件只有：

```js
const audioOk = existsSync(audioPath) && existsSync(titlesPath) && existsSync(manifestPath);
if (audioOk && previous?.text_sha256 === textSha) { 复用; exit 0; }
```

不校验 `previous.audio_sha256` / `titles_sha256` / `manifest_sha256`，也不校验 voice_id / speed。如果音频被截断/替换但文件仍在：

1. `minimax-tts` 打印“TTS 复用（文本未漂移）”并退出 0；
2. `inject-audio-meta` 检测到 `binding.audio_sha256 !== sha256File(...)`，报“请重新运行 minimax-tts.mjs”；
3. 再运行 `minimax-tts`，仍然复用——永远修不好。

**复现**：临时段目录写入 `narration.mp3`/`.titles`/`.manifest.json` 与匹配的 binding，然后篡改 mp3；运行 `minimax-tts` 仍输出“TTS 复用”，退出 0；binding 中的 audio sha 与真实文件已不同。

**建议**：复用条件加上三项哈希全部相等；不一致时删除/重生成，或在错误信息中给出“删除 audio/ 或加 --force”。

---

### F-10 `new-video init` 失败会留下不可重试的半成品目录

**位置**：`scripts/new-video.mjs:96-108`。

`init` 先 `mkdir` + `cpSync` 归档资料，再 `extractLockedScript`。若提取失败（没有标记、多个标记、空文件），项目目录里已经留下 `00-项目总控/资料包`，但 `state.json` 尚未写入。下一次 `init` 命中“目标目录非空，拒绝覆盖”，用户只能手工删目录。

**复现**：对一个没有锁定标记的文件执行 `init` → 失败；目录内留下 `00-项目总控`；再次执行同命令 → “目标目录非空，拒绝覆盖”。

**影响**：违反“脚本单步、幂等”的硬边界；失败不可恢复。

**建议**：先提取/校验到内存，成功后再创建目录；或失败时清理本次创建的内容（记录 created paths）；至少让 `init` 在 `state.json` 不存在且目录只含本次产物时允许重试。

---

### F-10b 缺少 `--source` 时会把整个当前工作目录当作资料包归档

**位置**：`scripts/new-video.mjs:88-105`。

```js
const source = resolve(get("source") ?? "");
if (!existsSync(source)) throw ...
...
if (statSync(source).isDirectory()) cpSync(source, join(controlDir, "资料包"), { recursive: true });
```

`resolve("")` 等于 `process.cwd()`。如果用户漏写 `--source`，脚本不会报“缺少参数”，而是把**当前目录整棵树**复制进 `00-项目总控/资料包`，然后才在提取锁稿时失败。

**复现**：在一个含 `sub/x.md`、`y.txt` 的临时目录里运行 `new-video.mjs init --project <外部目录> --allow-outside-products-root`（不带 `--source`）：项目里出现 `资料包/sub/x.md`、`资料包/y.txt`，随后报“未找到锁定口播”。

**影响**：可能把整个仓库/家目录/含密钥的工作目录复制进产品目录；再叠加 F-10，留下不可重试的半成品。既是数据泄漏风险，也可能是磁盘灾难。

**建议**：`--source` 必填，缺失即 `throw new Error("init 需要 --source")`；不要把空字符串 resolve 成 cwd。`--project` 同理，建议必填或显式要求 `--here`。

---

### F-11 官方 Stage 映射错误：`capture`、`frame.md` 与 BRIEF 位置

**位置**：`docs/rules/production-workflow-rules.md:21-22,50`；`scripts/new-video.mjs:201`；锁定官方 `vendor/skills/faceless-explainer/SKILL.md:47-58`。

官方锁定合同的 Step 1 标题是 **“Brief (no capture)”**，正文明确写：

> Do not run `npx hyperframes capture` (there is no URL).

但 harness 文档写：

- §2 “Step 0–2 | init、**capture**、官方 preset 选择”；
- `new-video.mjs` 脚手架完成后提示“BRIEF.md（官方 Step 0，init 之后）→ **capture（Step 1）** → 官方 preset（Step 2）”。

另外：

- §3.2 #2 写“官方 frame preset | **`hyperframes init` 落地的 `frame.md`**”；实际 `init` 不生成 `frame.md`（我实测空项目只有 `AGENTS.md`/`CLAUDE.md`/`hyperframes.json`/`index.html`/`meta.json`/`package.json`），官方 Step 2 才用 `build-frame.mjs --preset` 生成。
- 官方 Step 0 要求 `init` 之后立即写 `BRIEF.md`（在**段项目内**）；`gate pitch-round` 校验的是**项目根** `BRIEF.md`（`gate.mjs:118-126`）。多段项目里两者不是同一位置，规则未说明以哪个为准；`new-video` 的提示又指向段内。

**影响**：主智能体按 harness 文档会去跑一个官方明确说“不要跑”的 capture；会以为 `init` 已生成 `frame.md`；会在段内写 BRIEF 而被项目根 gate 判失败。这是“规则自称以官方合同为唯一真源，却与官方合同相反”的典型。

**建议**：把 §2 与脚手架提示改为官方措辞（Step 0 setup → Step 1 brief（无 capture）→ Step 2 design/preset）；明确 BRIEF 是每段一份还是项目根一份，并让 gate 与脚手架一致；§3.2 #2 改为 `build-frame.mjs --preset`。

---

### F-12 `animation-map` 的“每页”与官方实际“单文件”冲突

**位置**：`docs/rules/production-workflow-rules.md:26,41`；`scripts/gate.mjs:138-152`。

规则 §2 Step 5 写“**每页** animation-map 供主审”；§3.1 的产物却是“段内 `.hyperframes/anim-map/animation-map.json` 存在”（单文件）。`gate.mjs` 注释也承认：“官方每个 composition 产出**一个** animation-map.json（覆盖全时间线），不是‘每页一个’——原规则表述不准确，此处按官方实际契约校验。”

**影响**：规则没有随 gate 的修正更新；主智能体可能为每页跑一次并写到不同 `--out`，导致默认路径不存在而被 gate 判失败；或者只跑最后一页，gate 仍通过。

**建议**：统一为“每 composition 一份，默认路径唯一；如需逐页，`--out` 必须进 state/ receipt，并由 gate 逐页校验”；修改 §2 的“每页”。

---

### F-13 “全片离线可跑”与 TTS 的在线主链冲突

**位置**：`AGENTS.md:38-40`；`docs/rules/production-workflow-rules.md:13-14`；`README.md:42`；`scripts/minimax-tts.mjs:42-51`；`tests/pipeline-e2e.test.mjs:184-203`。

文档说“P0 一次性准备完成后，生产中途不联网也必须能把片子做完”，并把“唯一强制点”归为官方 `init` 的 skills 联网检查。但：

- 每段 `minimax-tts.mjs` 都要调用 MiniMax API（`tools/minimax/scripts/minimax_tts.py`），这是生产主链上的网络依赖；
- 唯一机器验证的离线用例是“init + 段脚手架”，测试名就写着 `init + 段脚手架仍可完成`，并不覆盖 TTS、注入、BGM 检索、渲染；
- 如果 P0 没有预生成**所有段的 TTS**，中途断网就无法完成新段。

**影响**：这是 README/AGENTS 级别的能力声明过宽。项目自己批评“把写在规则里当成已经强制”，这里同样把“脚手架离线”说成了“全片离线”。

**建议**：要么在 P0 明确“预生成全部段 TTS”，并把该步骤纳入离线用例；要么把声明改为“脚手架、字幕、装配、check、render 可离线；TTS 需在联网窗口完成”。

---

### F-14 自建 storyboard parser 与“明确不包含自建 parser”冲突；`---` 会吞帧

**位置**：`docs/plans/project-launch-design.md:70`；`scripts/lib/storyboard.mjs:1-62`；`docs/architecture/hf-0.8.36-capability-audit.md:23`。

设计文档“明确不包含：……自建 storyboard parser”，但仓库有 `scripts/lib/storyboard.mjs`，并被 `inject-audio-meta.mjs` 与 `captions-zh.mjs` 用于**关键校验**（帧 voiceover 覆盖、duration）。审计文档也说“读官方 parser；harness 门禁消费解析结果”，实际没有使用官方 parser。

parser 还有一个可复现 bug：`if (line.trim() === "---" && frames.length === 0 && current === null)` 会在第一个帧之前把任意 `---` 当作 frontmatter 开关。输入：

```md
---
format: 1920x1080
---

---

## Frame 1 — Hook
- voiceover: "hello"
```

解析结果 `frames: 0`，后续 `inject` 会报“STORYBOARD.md 无帧”。

**影响**：既违反“不重造轮子”的边界，又把一个非官方 parser 放在证据链的关键路径上；`---` 分隔线（常见 Markdown 写法）会让生产直接失败。

**建议**：改用官方 `@hyperframes/core/storyboard` parser（或至少只在官方 parser 之上做只读投影）；如果必须保留轻量 parser，修 `---` 逻辑（只在文件头第一个 `---` 与下一个 `---` 之间解析 frontmatter），并补 `---` 分隔线用例。

---

### F-14b 连续终止标点会产出“以标点开端”的独立字幕行

**位置**：`scripts/captions-zh.mjs:37-59`；`docs/rules/captions-contract.md:8-9`。

合同要求“不得以标点开端”“每条以终止它的原始标点结尾”。但 `splitClauses` 在遇到连续终止标点时，会把第二个标点当成新语块：

```
什么？！真的。 => [ '什么？', '！', '真的。' ]
真的！？好吧。 => [ '真的！', '？', '好吧。' ]
```

`planLines` 会把 `！` / `？` 单独成行；`buildGroups` 的纯标点吸收逻辑在“整行只有一个 span”时也不会把它并入前一行（`spans.length > 1` 分支不成立）。最终会出现一行只有一个标点的字幕。

**影响**：直接违反字幕合同第 3 条；中文里 `？！` / `！？` 并不罕见。现有单测只覆盖单标点样本，没抓到这个分支。

**建议**：在 `splitClauses` 中把连续的终止标点（`。！？` 以及紧跟的 `，、；：`？至少 `。！？`）合并到同一语块；或在 `planLines`/`buildGroups` 中把纯标点行并入前一行，并补 `？！` / `！？` 用例。

---

### F-17 分发包内有 22 处相对死链（13 个不同目标）+ 1 张破图

**位置**：`scripts/build-skill-package.mjs:53-61`；打包产物。

`docs/architecture`、`docs/plans`、`tests`、`CHANGELOG*`、`SECURITY*`、`CONTRIBUTING*`、`CODE_OF_CONDUCT*`、`README.en.md`、`LICENSE`、`NOTICE`、`CITATION.cff`、`assets/wechat-qr.jpg` 都不在包内；但包内的 `README.md`、`DISCLAIMER*.md`、`SKILL.md` 仍然引用它们。对打包产物做相对链接扫描，得到 **22 处死链（13 个不同目标）**，另有 1 张破图（`README.md → assets/wechat-qr.jpg`）。例如：

- `README.md → README.en.md`
- `README.md → CONTRIBUTING.md`
- `README.md → SECURITY.md`
- `README.md → CHANGELOG.md`
- `README.md → LICENSE` / `NOTICE` / `CITATION.cff`
- `README.md → .github/ISSUE_TEMPLATE/feature_request.md`
- `DISCLAIMER.md → LICENSE` / `NOTICE`

另外 `README.md` 的 `<img src="assets/wechat-qr.jpg">` 在包内也是坏图。

**影响**：SkillHub 用户拿到的包，其 README/免责声明大面积指向不存在的文件；`SKILL.md:45` 还声称参考资料放在 `docs/architecture/`，但该目录被排除；`SKILL.md:87` 引用的审计文档也不在包内。

**建议**：为分发包单独生成一个 `README.package.md`（只链接包内文件），或把被引用的治理文档纳入包；在 `tests/packaging.test.mjs` 增加“对打包产物做相对链接扫描”的用例。

---

### F-17b `SKILL.md` 对 `package-manifest.json` 的位置描述与实现/测试相反

**位置**：`SKILL.md:65`；`scripts/build-skill-package.mjs:141-144`；`tests/packaging.test.mjs:54-60`。

`SKILL.md` 说脚本“产出含每个文件 SHA-256 的 `package-manifest.json`”，读者会理解为包内文件。实际实现把它写到**包目录同级**的 `<out>.manifest.json`，且 `tests/packaging.test.mjs:56` 明确断言“清单不应打进包内”。

**影响**：维护者按 SKILL.md 去包内找清单会找不到；文档与一条已通过的测试直接矛盾。

**建议**：SKILL.md 改为“包目录同级的 `<out>.manifest.json`”，并给出示例路径；或把清单同时写一份包内摘要（若平台允许）。

---

### F-18 发布脚本 `User-Agent` 硬编码 `0.2.2`

**位置**：`scripts/publish-skillhub.mjs:205`；`package.json:3`；`tests/docs-links.test.mjs:64-78`。

```js
"User-Agent": "zwhyperframes-harness/0.2.2 (skillhub-publish)",
```

当前版本是 `0.2.3`。docs-links 的“版本号在四处声明中一致”只检查 `package.json` / `package-lock.json` / `CITATION.cff` / `SKILL.md`，不检查这里。

**影响**：发布请求自称 0.2.2；这是版本漂移，也说明“版本号门禁”覆盖不全。若平台按 UA 做统计/诊断，会归错版本。

**建议**：从 `package.json` 读取版本，或把 UA 纳入 docs-links 的版本一致性断言。

---

### F-18b “本地安装改完代码即时生效”与 `install-skill.sh` 的实际行为相反

**位置**：`README.md:145`；`README.en.md:145`；`scripts/install-skill.sh:52-72`。

两份 README 都写“从本地仓库安装（改完代码即时生效，不必等平台发版）”。但 `install-skill.sh` 的行为是：

1. 调 `build-skill-package.mjs` 在临时目录重新打一个包；
2. `rm -rf "$DEST"`，`cp -R` 到发现目录。

它**不会**在仓库文件变化后自动同步；改完代码不重跑 `npm run install-skill`，发现目录里仍是旧副本。

**影响**：开发者按 README 的“即时生效”理解，会调试到旧版本；这与本仓“证据/版本一致”的敏感度不匹配。

**建议**：改为“改动后重跑 `npm run install-skill` 生效”，或安装时用软链指向仓库（开发模式专用），并在文档里区分。

---

### F-19 `packageManager: pnpm` 与 npm 锁文件/CI/文档冲突

**位置**：`package.json:21`；`scripts/bootstrap.sh:51-52`；`.github/workflows/ci.yml:44`；`README.md:125`。

`package.json` 声明 `packageManager: pnpm@10.33.2`，但：

- 仓库只有 `package-lock.json`，没有 `pnpm-lock.yaml`；
- `bootstrap.sh` 用 `npm install`，并注释“固定 npm……bun 会另生成 bun.lock”；
- CI 用 `npm ci`；
- README/快速开始全部用 `npm`。

**影响**：Corepack 用户可能按 `packageManager` 走 pnpm，生成第二套锁文件；与“锁文件固定、CI 可复现”的目标冲突。

**建议**：删除 `packageManager`，或改为 `npm@<version>`；若要支持 pnpm，补齐 `pnpm-lock.yaml` 并统一所有入口。

---

### F-20 bootstrap 的“10 个官方产物”清单不完整

**位置**：`scripts/bootstrap.sh:32-41`；`scripts/captions-zh.mjs:231-236`；`scripts/inject-audio-meta.mjs:132-138`；`scripts/doctor.sh:21-22`。

bootstrap 校验的 10 个产物包括 `faceless-explainer/scripts/captions.mjs`、`audio.mjs`、`build-frame.mjs`、`frame-packets.mjs`、5 份 core references、`pitch-round.md`。但代码实际还依赖：

- `faceless-explainer/scripts/lib/tokens.mjs`（captions-zh 动态 import）
- `faceless-explainer/scripts/lib/dimensions.mjs`（captions-zh 动态 import）
- `media-use/audio/scripts/audio.mjs`（inject 的 BGM 引擎）

`doctor.sh` 检查了前两个（4 个文件里包含 tokens/dimensions），但没有检查 `media-use` 的 BGM 引擎。bootstrap 的清单则三个都没有。

**影响**：bootstrap 可以在 media-use 缺失时“成功”，doctor 也可能全绿，直到 `inject-audio-meta` 运行才失败；与“逐项 fail-closed”不符。README:131 “10 个官方产物”因此也不准确。

**建议**：把上述 3 个文件加入 `HF_REQUIRED_ARTIFACTS`，并让 `doctor` 检查 `media-use/audio/scripts/audio.mjs`；把“10 个”改为实际数量，或从单一清单生成 bootstrap/doctor 的检查项。

---

### F-21 bootstrap 的“按 tag 取回”对 annotated tag 失效

**位置**：`scripts/bootstrap.sh:112-124`。

循环里的校验是：

```bash
CANDIDATE="$(git -C "$TMP" rev-parse FETCH_HEAD)"
if [ "$CANDIDATE" = "$HF_SKILLS_COMMIT" ]; then ...
```

对于 annotated tag，`git rev-parse FETCH_HEAD` 返回的是 **tag object**，不是 commit。本地复现：

```
commit=08fc5f7...
tagobj=e8e9e7c...
FETCH_HEAD=e8e9e7c...
FETCH_HEAD^{commit}=08fc5f7...
```

因此当“按 SHA fetch”被服务端拒绝、退回“按 tag”时，即使 tag 正确指向锁定 commit，也会被判“取回的是 …，与锁定值不符”，最终失败。

**影响**：脚本声称的“四种组合逐一尝试”实际只有“按 SHA”这一路可靠；tag 兜底在 annotated tag 上是坏的。GitHub 通常支持按 SHA，所以平时不暴露；一旦服务端拒绝 SHA，bootstrap 会误报合同审计信号。

**建议**：用 `git rev-parse "FETCH_HEAD^{commit}"`；checkout 也用 `FETCH_HEAD^{commit}`，并对 tag object 做 peeled 校验。

---

### F-22 `captions-zh` 不写 `caption-overrides.json`

**位置**：`scripts/captions-zh.mjs:319-329`；官方 `captions.mjs:10-13,199-207`。

官方注释写：

> `caption-overrides.json` — an empty `[]` shim (silences the captions runtime's validate-time fetch; only written when captions.html is).

`captions-zh build` 写 `compositions/captions.html`，但不写 `caption-overrides.json`。如果运行时在 validate 阶段 fetch 该文件，就会 404/警告，而官方路径不会有这个问题。

**影响**：harness 生成的字幕 composition 与官方生成的不完全等价；在 Studio/check 中可能出现额外噪声或失败。

**建议**：与官方一致，用 `writeFileSync(..., "[]\n", { flag: "wx" })` 创建 shim；`verify` 也把它纳入确定性检查。

---

## 4. 冲突清单（文档 ↔ 文档 / 文档 ↔ 代码）

| ID | 级别 | 位置 | 冲突 | 影响 |
| --- | --- | --- | --- | --- |
| C-01 | 高 | `docs/rules/production-workflow-rules.md:22` vs `vendor/skills/faceless-explainer/SKILL.md:47-58` | 规则说 Step 0–2 含 `capture`；官方 Step 1 是 “Brief (no capture)”，并明确不要跑 capture | 主智能体执行官方禁止的步骤 |
| C-02 | 高 | `docs/rules/production-workflow-rules.md:50` vs `docs/plans/project-launch-design.md:35`、`vendor/.../SKILL.md` Step 2 | 规则说 `hyperframes init` 落地 `frame.md`；实际 `init` 不生成，Step 2 才用 `build-frame.mjs --preset` | 误判产物已存在，跳过 Step 2 |
| C-03 | 高 | `docs/rules/production-workflow-rules.md:26` vs `scripts/gate.mjs:138-152` | 规则说“每页 animation-map”；gate 只校验段内单个文件，官方脚本一次只产出一个 | 逐页产物被覆盖或 gate 误判 |
| C-04 | 高 | `docs/rules/production-workflow-rules.md:13-14` / `README.md:42` vs `tests/pipeline-e2e.test.mjs:184-203` + `scripts/minimax-tts.mjs` | 宣称全片离线；唯一用例只覆盖 init+segment，TTS 仍需网络 | 离线底线被高估 |
| C-05 | 高 | `README.md:37` / `README.en.md:37` vs `scripts/new-video.mjs` + 实际产品 | 宣称“项目根 `frame.md`，一个文件即全片真源”；实际每段一个 `frame.md`，无同步机制 | “改一次全片生效”不成立 |
| C-06 | 高 | `docs/plans/project-launch-design.md:70` vs `scripts/lib/storyboard.mjs` | 设计“明确不包含自建 storyboard parser”；代码有并用于关键校验 | 违反自定边界；parser 漂移风险 |
| C-07 | 高 | `docs/architecture/hf-0.8.36-capability-audit.md:26,50` vs `docs/rules/captions-contract.md:8` | 前者写“单行 30 字待验证”，后者定为 ≤22 字 | 规格冲突，读者不知道哪个是准 |
| C-08 | 中 | `docs/architecture/hf-0.8.36-capability-audit.md:34` vs `docs/plans/project-launch-design.md:24` | 前者“保留 Ed25519”，后者“放弃 Ed25519” | 授权模型自相矛盾 |
| C-09 | 中 | `docs/architecture/hf-contract-audit-2026-10-21.md:50` vs `scripts/inject-audio-meta.mjs:132-138` | 前者称 `media-use` 新路径“兜底”；代码对 `faceless-explainer/scripts/audio.mjs` 无兜底，media-use 只用于 BGM | 故障时实际没有 fallback |
| C-10 | 高 | `tools/minimax/docs/HF_AUDIO_SUBTITLE_FORMAT.md:7,9` vs `docs/rules/captions-contract.md` + `scripts/captions-zh.mjs` | 前者引用不存在的 `docs/rules/hf-official-workflow-execution-rules.md`，并说“不再建立项目自定义平行字幕合同”；后者正是自定义分组合同 | 分发文档与现行架构直接相反 |
| C-11 | 中 | `tools/minimax/README.md:75,81` vs `scripts/minimax-tts.mjs:42-43` | 文档说“语音生产固定使用 `MINIMAX_PYTHON`，不得改用…”；wrapper 硬编码 `python3` | 自定义解释器被忽略 |
| C-12 | 中 | `tools/minimax/README.md:89` vs `scripts/minimax-tts.mjs:52-58` | README 说字幕“若 API 返回……会额外下载”（暗示可选）；wrapper 无 `narration.titles` 即失败 | API 未返回字幕时无法生产 |
| C-13 | 中 | `docs/architecture/new-window-handoff.md:15` vs `hf-env.sh:3-5` | 交接文档写“hf/npx hyperframes”；hf-env 注释明确“禁止全局 hyperframes / npx hyperframes 漂移版本” | `npx` 从段目录可能拉取未锁定版本 |
| C-14 | 中 | `docs/rules/visual-production-rulebook.md:18` vs `:23` | 前者说“本仓执行线提高到 28px”；后者说“机器只拦 <24px 显式 CSS” | 28px 的执行口径不一致 |
| C-15 | 中 | `CHANGELOG.md:61` vs `:119`（英文同） | 0.2.2 说合同在 `hyperframes-core/references/`，0.2.0 说在 `hyperframes/references/` 且反向指错 | 历史记录互相矛盾，无更正指针 |
| C-16 | 中 | `README.md:41,93` vs `scripts/lib/harness.mjs:87-90`、`scripts/state.mjs:20-23` | README 说“证据不可伪造 / 每个产物 SHA-256 绑定”；state 是明文 JSON、授权记录只有自由文本 `evidence`，无哈希/签名 | 证据可手工改写；与规则 §5“无密码学签名”也未对齐 |
| C-17 | 中 | `README.md:39` vs `scripts/gate.mjs:187-202` + `scripts/finalize-master.mjs:21-32` | README 说“无脚本间复制”；两处 master 输入校验几乎逐字重复 | 改一处漏一处 |
| C-18 | 中 | `README.md:39` vs `scripts/captions-zh.mjs:323-327` | README 说“字幕只产出分组数据”；脚本还写 `compositions/captions.html` | 产物边界描述不准 |
| C-19 | 中 | `docs/plans/project-launch-design.md:26` vs `:24`/AGENTS:46 | 设计写“每段两门 + master 两门 + 收尾一门”，与“四个决策门”不一致（收尾/ master 门重复计数） | 决策门数量口径混乱 |
| C-20 | 低 | `CITATION.cff:12-13` vs `CHANGELOG.md:14` | 版本 0.2.3，`date-released` 仍是 2026-10-08（0.2.0 日期） | 引用元数据过期 |
| C-21 | 低 | `NOTICE:4-5,16` vs `README.md`/`CHANGELOG.md` | NOTICE 仍称 “independent management layer”；仓库已改为“harness 工程”；“neither vendors”与 bootstrap 复制 `vendor/skills` 有张力 | 定位/法律措辞过时 |
| C-22 | 低 | `DISCLAIMER.md:13` / `.en.md:13` vs `scripts/bootstrap.sh` | 免责声明说“不下载任何第三方内容”；bootstrap 明确下载上游 skills | 法律陈述不准确 |
| C-23 | 低 | `docs/architecture/hf-0.8.36-capability-audit.md:24` vs `scripts/inject-audio-meta.mjs:85` | 前者写 `--only bgm,sfx` 合并；代码只 `--only bgm`，且 `audio_meta.sfx=[]` | 审计描述与实现不符 |
| C-24 | 低 | `docs/rules/production-workflow-rules.md:22,26` vs 官方 Step 5/6 | 规则把 lint/check 放在 Step 5、把 captions 放在 Step 6；官方 Step 5 建 captions/index，Step 6 才 lint/check/snapshot | 阶段归属混乱（与 C-01/C-03 同源） |
| C-25 | 低 | `README.en.md:218` vs `README.md:218` | 英文规则表只写 “Visual quality floor”；中文写“视觉质量底线（官方 worker 合同优先 + 项目要求）” | 英文读者丢失“官方合同优先”的裁决信息 |
| C-26 | 低 | `README.md:117` vs `SKILL.md:69` | README 写平台 macOS / Linux；SKILL.md 前置条件只写 macOS | Linux 支持范围口径不一致 |
| C-27 | 低 | `SECURITY.md:63` / `README.md:254` vs `docs/architecture/hf-contract-audit-2026-10-21.md:81` | 前者断言 `--skill=faceless-explainer` 会写入 `hyperframes.json`；后者说“需在下一支视频生产时实测” | 实际产品的 `hyperframes.json` 已有 `authoringSkill: faceless-explainer`，所以是审计文档未更新；但公开文档仍引用“待实测”作为依据 |
| C-28 | 高 | `AGENTS.md:14` vs `docs/rules/production-workflow-rules.md:46,50-55`、`README.md:105`、`SKILL.md:105` | AGENTS 把 presets / on-device catalog / carve 与 pitch-round 并列为“强制执行，不是建议”；规则 §3.2 明确这三项“本仓无机器门禁”，README/SKILL 说只有 3/12 有门禁 | 最高层入口与“诚实分层”自相矛盾；读者会以为这些能力会被门禁卡住 |
| C-29 | 中 | `README.md:114` vs `hf-env.sh:23-33` | README 写“HyperFrames 版本锁定，CLI 缺失或漂移即拒绝运行”；`hf-env.sh` 只 `echo` 警告，不返回非零/不阻断，`hf()` 仍可执行任意版本 | 版本锁在入口层不是硬门禁；`new-video init`/`state` 等不调用 `assertHfVersion` 的命令可继续跑 |

---

## 5. 重复清单

| ID | 位置 | 重复内容 | 影响 |
| --- | --- | --- | --- |
| D-01 | `scripts/gate.mjs:187-202` ↔ `scripts/finalize-master.mjs:21-32` | 逐字的“末段例外 + 前序 accepted + MP4 哈希”校验 | 两处逻辑已一致，但未来改一处会漂移；应抽到 `lib/harness.mjs` |
| D-02 | `scripts/gate.mjs:59-66` ↔ `scripts/inject-audio-meta.mjs:33-37` | TTS 三件套（mp3/titles/manifest）哈希校验 | 同一规则两处实现 |
| D-03 | `scripts/state.mjs:93-97` ↔ `scripts/gate.mjs:191-197` ↔ `scripts/finalize-master.mjs:21-27` | 末段 `rendered/accepted + final_look` 判定 | 三处重复 |
| D-04 | `hf-env.sh:7`、`scripts/bootstrap.sh:7`、`scripts/doctor.sh:12`、`scripts/lib/harness.mjs:12`、`.github/workflows/ci.yml:60`、`package.json:19` | HF 版本 `0.8.36` 6 处硬编码 | 升级需改 6 处；无单一常量源 |
| D-05 | `AGENTS.md:34`、`README.md:131`、`SKILL.md:70,85`、`docs/...` | 锁定 commit `f86aae6...` 多处复制 | 可接受（文档），但无测试校验一致性 |
| D-06 | `SKILL.md:109-116` ↔ `AGENTS.md:43-50`、`docs/rules/production-workflow-rules.md:76-85` | SKILL.md 声称“只做路由、不承载规范”，但复制了决策门/字幕/脚本边界等规范 | 第二信源漂移风险；docs-links 只检查一句“只负责路由” |
| D-07 | `CHANGELOG.md` ↔ `CHANGELOG.en.md` | 双语两份变更历史 | 设计如此；但本次审计发现 0.2.0 路径条目两边同样错误，说明双语同步不能防止事实错误 |
| D-08 | `README.md` ↔ `README.en.md` | 双语 README | 设计如此；需同步修 F-05/F-16 等相同错误 |

---

## 6. 一致性与元数据核对

### 6.1 已一致（通过）

- 版本号 `0.2.3`：`package.json`、`package-lock.json` 顶层与 `packages[""]`、`CITATION.cff`、`SKILL.md` 五处一致（docs-links 测试覆盖四处 + lock 两处）。
- 测试数 59：README 中英徽章/正文、SKILL.md、RELEASE-HANDBOOK 全部一致；实际 59。
- 仓库内 markdown 相对链接全部可解析（docs-links 测试）；README 中英目录锚点一致。
- 打包排除 `vendor/`；40 个文件、331.3 KB，低于 460KB 发布闸门；文件数 <100、单文件 <1MB。
- `bootstrap.sh` 的 sparse-checkout 逻辑本地复现成功：只检出 `skills/`，不拉 `.agents/skills/`；LFS 指针检测有效。
- `net-env.sh` 的 NO_PROXY 去重、大小写代理清理、`set -u`、zsh 兼容、1s 探测均有测试且通过。
- `state/gate/finalize` 的正常路径（授权 → set-mp4 → master 拼接）e2e 通过；哈希漂移会失败。
- `captions-zh` 的 build/verify 确定性、官方 skin 填充、篡改检测有测试且通过。
- `minimax` 固定语音档案（voice_id/speed 1.27/vol 1.16/44.1k/256k）在 Python、config example、VOICE_PROFILE、README 之间一致。

### 6.2 不一致（计数/元数据）

> 以下为审计时快照；修复后的当前值见顶部「修复进展」。

| 项 | 文档声明 | 实际 | 位置 |
| --- | --- | --- | --- |
| vendor skill 数 | “21 个目录” / “21 项” | 20 个目录 + 1 个散落 `python-encoding.test.mjs` | `CHANGELOG.md:35`、`RELEASE-HANDBOOK.md:221` |
| 发布包文件数 | 39 个 / 约 317KB / 请求体约 330KB | 40 个 / 331.3KB / 344.2KB | `RELEASE-HANDBOOK.md:174` |
| 官方依赖产物 | “10 个” | 代码实际 import/调用至少 13 个（缺 tokens/dimensions/media-use） | `README.md:131`、`bootstrap.sh:32-41` |
| 测试数 | 59 | 59（通过） | README/SKILL/RELEASE |
| `packageManager` | pnpm | npm 锁文件/CI/文档 | `package.json:21` |
| 发布 UA | 0.2.2 | 0.2.3 | `publish-skillhub.mjs:205` |
| CITATION 日期 | 2026-10-08 | 0.2.3 发布日 2026-10-24 | `CITATION.cff:13` |
| 包内测试 | README 说包含 `tests/` | 包内无 `tests/`，`npm test` 0 用例 | `README.md:149`、`build-skill-package.mjs:53` |

### 6.3 CHANGELOG 链接

`CHANGELOG.md:145-148` 只有 `[未发布]`、`[0.2.2]`、`[0.2.0]`、`[0.1.0]` 四个链接定义，缺少 `[0.2.3]`；`[未发布]` 的 compare 仍从 `v0.2.2...HEAD` 起算。属于 Keep a Changelog 的机械不一致，建议补 `[0.2.3]: ...compare/v0.2.2...v0.2.3`，并把 `[未发布]` 改为 `v0.2.3...HEAD`。

---

## 7. 次要代码缺陷与健壮性

| ID | 位置 | 问题 | 影响 |
| --- | --- | --- | --- |
| M-01 | `scripts/lib/harness.mjs:19-23`、`scripts/gate.mjs:108,157`、`new-video.mjs:168`、`finalize-master.mjs:48` | `spawnSync` 无超时（HF CLI / ffmpeg / ffprobe） | 生产可无限挂起；与 bootstrap/net-env 的硬超时纪律不一致 |
| M-02 | `scripts/lib/harness.mjs:50-53` | `writeJson` 直接覆盖写，无 tmp+rename | `state.json` 写一半崩溃会损坏证据链 |
| M-03 | `scripts/state.mjs:20-23` | `approvalRecord` 只存自由文本 `evidence`，不存产物 SHA-256 | 与规则 §5“时间戳、产物 SHA-256”不符；master 审批无法绑定候选 |
| M-04 | `scripts/state.mjs:44-63` | `approve final-look` 不要求 `start` 之外的任何产物；空白 `evidence` 也能通过（`trim()` 后为空） | 授权记录可为空/无对象 |
| M-05 | `scripts/state.mjs:52-58,68-83` | `approve start` 把前段标 `accepted` 时只检查 `prior.mp4` 真值，不检查文件存在/哈希；`set-mp4` 可跳过 `authorized`，可把 `accepted`/已 close 的段改回 `rendered`；不校验 MP4 与 STORYBOARD/audio 的关系 | 前段 MP4 被删/换仍可 accepted；状态机可被绕过；close 后仍可换片 |
| M-06 | `scripts/gate.mjs:162-173` | `readFileSync(mp4).length` 把整个 MP4 读入内存；只校验 >0 与 ffprobe 时长 | 大文件内存浪费；无法证明是正确段的渲染 |
| M-07 | `scripts/gate.mjs:204-221` | 对所有 `font-size` 命中（含注释/隐藏元素）一律判违规 | 官方 preset 的装饰性小字会误报 |
| M-08 | `scripts/captions-zh.mjs:281-299` | 只写 `--cap-*`/`--font-*` 语义 token，不写官方 `frameTokensCss` 的 raw color token | 自定义 skin 若用 `var(--cream)` 会失效（官方 presets 目前只用 `--cap-*`，故未暴露） |
| M-09 | `scripts/captions-zh.mjs:337-340` | `verify` 使用在盘 `width/height` 重建，不从 STORYBOARD 复算 | 画布尺寸被篡改时可能自洽通过 |
| M-10 | `scripts/captions-zh.mjs:256-258,306-310` | `format` 只接受 `WxH`；官方 `dimensions.parseFormat` 还支持 `landscape/portrait/square` 并带默认回退 | 写 `format: portrait` 时 harness 报错，官方可跑 |
| M-11 | `scripts/captions-zh.mjs:166` | 纯标点吸收正则不含 `」』)】］` 等收尾符 | 收尾引号/括号可能单独成一个高亮 span |
| M-12 | `scripts/captions-zh.mjs:28-35` | `makeClause` 去掉语块首尾空白 | 标点后空格不进入字幕，严格“逐字一致”在含空格文本上有偏差 |
| M-13 | `tools/minimax/scripts/minimax_tts.py:266-272` | 字幕 URL 后缀不是 `.title/.titles` 时写成 `<name>.subtitle.json`；wrapper 只认 `<name>.titles` | API 形状变化时 TTS 成功但 wrapper 报“产物不完整” |
| M-14 | `scripts/minimax-tts.mjs:43` | 硬编码 `python3` | 忽略文档规定的 `MINIMAX_PYTHON` |
| M-15 | `scripts/net-env.sh:23` | 保留外部已设的 `npm_config_registry`；npm 在 lifecycle 中会注入该变量 | `npm run bootstrap` 可能仍走 npmjs，而非声明的 npmmirror |
| M-16 | `scripts/bootstrap.sh:196-208` | 只对已存在的发现目录建链；文档说会链到三个目录 | `~/.agents/skills` 不存在时不会创建，用户以为已安装 |
| M-17 | `scripts/bootstrap.sh:203-207` | 把发现目录中的同名**真实目录**移走并最终删除 | 用户手工安装的其他版本会被静默清除 |
| M-18 | `scripts/install-skill.sh:19` | `--dir` 后无参数时 `$2` 在 `set -u` 下报错 | 用法错误提示不友好 |
| M-19 | `scripts/install-skill.sh:70-72` | `rm -rf "$DEST"` 后 `cp -R`，失败无回滚 | 安装失败会留下空/半目录 |
| M-20 | `scripts/publish-skillhub.mjs:27,54` | `rmSync` 等导入未使用；临时打包目录不清理 | 小量临时目录泄漏 |
| M-21 | `scripts/build-skill-package.mjs:25-28,65` | 构建允许 10MB，但发布闸门 460KB；扩展名白名单比注释多 `.toml/.html/.css/.csv` | 构建“通过”不代表可发布；白名单依据不清 |
| M-22 | `.github/ISSUE_TEMPLATE/bug_report.md:13`、`question.md:25` | 让用户运行全局 `hyperframes --version` | 与“只用锁定 hf”冲突，可能报错版本 |
| M-23 | `.github/workflows/ci.yml:64-67` | `bash -n` 漏 `scripts/install-skill.sh`；无 `py_compile` | CONTRIBUTING 声明的检查未在 CI 执行 |
| M-24 | `tests/pipeline-e2e.test.mjs:184-203` | 离线用例只覆盖 init+segment；未设置 `HYPERFRAMES_SKIP_SKILLS` | 开发者若导出 `0`，测试可能联网 |
| M-25 | `tests/captions-zh.test.mjs:80-141` | 未覆盖 `caption-overrides.json`、竖屏 `cqw`、`---` 分隔线、收尾引号 span、连续终止标点 | 上述缺陷无回归门禁 |
| M-26 | `tools/minimax/docs/STANDALONE_API_GUIDE.md:300,340` | 两处引用同目录 `API_SURVEY.md`，该文件不存在 | 随包分发的工具文档断链 |
| M-27 | `scripts/gate.mjs:108,157`；`visual-production-rulebook.md:17` | `check --strict` 未传 `--caption-zone` / `--frame-check`，官方 CLI 支持这两个参数 | 底部 17% 字幕带/画布边界没有机器校验，视觉规则书的安全边界只靠人工 |
| M-28 | `scripts/state.mjs:20-23` | `approvalRecord` 对 `"   "` 这类空白 evidence 也接受（先判 truthy 再 trim） | 可写入空证据的授权 |
| M-29 | `scripts/bootstrap.sh:66-71`；`.gitignore` 的 `vendor/` | 幂等跳过只比对 `.skills-commit` 文本，不校验 `vendor/skills` 内容哈希；vendor 不入 git | 手工/异常修改 vendor 后，bootstrap/doctor 都可能继续报“已锁定” |
| M-30 | `scripts/inject-audio-meta.mjs:33-43` | 只校验音频产物与 binding 的哈希，不校验 `binding.text_sha256` 是否等于当前 `user_script.txt` | 改稿未重跑 TTS 仍可派生 audio_meta；final-look 不跑 verify，改稿可蒙混过关 |
| M-31 | `scripts/inject-audio-meta.mjs:68-89` | BGM 阶段只看引擎退出码，不看 `neutral.bgm`；无凭证/检索失败时引擎只打日志、`bgm=null` 也算成功；每次重跑都重新检索 | 静默无 BGM 或换曲；重跑非幂等，离线行为不稳定 |
| M-32 | `scripts/finalize-master.mjs:28-52` | 先逐段 `sha256File` 校验，再交 `ffmpeg concat`；中间无锁、无二次校验（TOCTOU），候选快照记的是校验时的哈希 | 校验后替换输入，候选可能包含未验证内容，而 `inputs` 仍显示旧哈希 |

---

## 8. 覆盖缺口（测试）

- `gate.mjs` 的 `final-look`、`check`、`mp4`、`next-segment` 没有直接测试；`pipeline-e2e` 只覆盖 `authorized`、`master-inputs`、`verify`、`layout-guard`、`pitch-round`、`animation-map`。
- `minimax-tts.mjs` 零测试；`inject-audio-meta.mjs` 只有其纯逻辑库 `audio-inject` 的测试，没有端到端（临时音频/ffmpeg/engine）。
- `tests/pipeline-e2e.test.mjs:294` 把“无绑定也能 verify 通过”编码为期望，掩盖了 F-03。
- `tests/packaging.test.mjs` 只测 `vendor/` 排除，不测 `RELEASE-HANDBOOK`、`tests/`、死链、包内 `npm test`。
- `tests/docs-links.test.mjs` 只测仓库内链接，不测打包产物；只测四处版本，不测 UA。
- `tests/storyboard.test.mjs` 不测 `---` 分隔线；`tests/captions-zh.test.mjs` 不测 shim/竖屏。

---

## 9. 值得保留的部分

1. **测试基线扎实**：59 项、单线程、临时目录自动清理；离线 init+segment 用例有判别力（断言不出现 GitHub 检查）。
2. **哈希链设计正确**：锁稿 → TTS → injection → MP4 的字段齐全；`injection-binding` 的 schema v2 拒绝历史绑定回填，符合“证据不可伪造”的初衷。
3. **bootstrap 工程化程度高**：按 SHA 取回、四通路、硬超时、LFS 指针检测、幂等跳过、sparse-checkout 精确锚定；本地复现正确。
4. **net-env 的细节处理**：1s Python 探测、NO_PROXY 去重、大小写代理清理、zsh 兼容，都有测试。
5. **诚实披露**：README/SKILL/规则 §3 明确写“只有 3 项有机器门禁”，没有夸大成 12 项；这是很好的文化。本报告的建议是让这 3 项也真正“卡住”。
6. **打包/发布的安全意识**：460KB 闸门、gzip 不接受、凭据只读文件、manifest 外置；方向正确，只是内容清单需要修。

---

## 10. 修复优先级建议

### P0（在下一支视频/下一次发布前）

1. **门禁编排**：新增 `gate pipeline`；`state approve final-look` / `master final-look` 必须消费 gate receipt；`final-look` 强制 `verify` + `layout-guard` + `animation-map` + `captions-zh verify` + 非空帧/index；`verify` 对缺失/损坏绑定改为 fail-closed。
2. **master 证据链**：`master final-look` 必须要求 candidate；approval 写入 candidate sha；`close` 后禁止 `finalize-master`/`set-mp4`/再次 approve。
3. **发布包排除 `RELEASE-HANDBOOK.md`**；把“本地专用文件不得入包”做成测试。
4. **修复包内 `tests/`/文档矛盾**：二选一纳入 tests 或明确说明不含；把 `npm test` 在 tests 缺失时改为非零退出。
5. **修 `minimax-tts` 复用哈希**，避免 TTS/注入死循环。

### P1（本迭代）

6. `animation-map` 校验内容；`layout-guard` 支持竖屏/`clamp/rem`。
7. 分段计划 SHA 校验；`init` 失败可重试。
8. 官方 Stage 映射纠正（capture/preset/BRIEF/frame.md）。
9. 发布包死链/UA/packageManager/CITATION。
10. bootstrap 必需产物补全 + annotated tag `^{commit}`。
11. `captions-zh` 写 `caption-overrides.json`；接入 final-look。
12. 自定义 storyboard parser 的 `---` 修复，或改用官方 parser。

### P2（清理）

13. 统一 HF 版本常量；抽公共 master 校验；SKILL.md 去规范化复制。
14. 修 CHANGELOG 链接/21 vs 20/39 vs 40/30 vs 22/Ed25519 等陈旧文档。
15. NOTICE/DISCLAIMER 措辞；CI 补 `install-skill.sh` + `py_compile`。
16. 补测试：final-look/check/mp4/next-segment、TTS/inject、打包死链、竖屏 cqw、`---`。

---

## 11. 复现命令（审计时实际执行）

```bash
npm test
node --check scripts/*.mjs scripts/lib/*.mjs tests/*.mjs
bash -n hf-env.sh scripts/*.sh
python3 -m py_compile tools/minimax/scripts/*.py
node scripts/build-skill-package.mjs --root . --out /tmp/zw-pkg
npm run publish-skill -- --dry-run
```

关键复现（临时目录，未修改仓库）：

- 空 `hyperframes init` 项目 → `hyperframes check --strict` 退出 0；`gate final-look` 退出 0。
- `state approve --kind final-look` 在无 check/无帧时成功。
- `segment-plan.json` 的 `locked_script_sha256`/`text_sha256` 改成 0 → `new-video segment` 退出 0。
- `new-video init` 失败后重试 → “目标目录非空”。
- 篡改 `narration.mp3` 后 `minimax-tts` → “TTS 复用”退出 0。
- `master final-look` 在 candidate 为 null 时成功；`close` 后重新 `finalize` → candidate sha 改变、`close` 仍为 true。
- 1080×1920 帧 `font-size: 1.5cqw` → `layout-guard` 误判通过。
- 带 `---` 分隔线的 STORYBOARD → parser `frames: 0`。
- 打包产物相对链接扫描 → 22 处死链（13 个不同目标）+ 1 张破图；包内 `npm test` → `tests 0`、退出 0。
- 本地 annotated tag fetch → `FETCH_HEAD` 是 tag object，不是 commit。
- `npm_config_registry=https://registry.npmjs.org` source `net-env.sh` → 仍为 npmjs。

---

*本报告只读审计，未修改仓库文件。*
