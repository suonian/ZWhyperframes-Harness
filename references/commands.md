# 命令契约（参数、成功输出、失败含义）

> 目的：让调用方可预期地使用脚本，而不是靠读源码猜参数。所有命令**成功退出 0，失败退出 1**；失败信息写到 stderr，成功摘要写到 stdout。

## 0. 通用约定

| 项 | 约定 |
| --- | --- |
| 工作目录 | `--project`/`--segment` 接受绝对路径或相对当前目录的路径；不给时按各命令默认值 |
| 时间戳 | 由脚本 `nowIso()` 生成 ISO-8601；不是用户输入 |
| 哈希 | SHA-256（小写 hex）；绑定文件里存的是文件内容哈希 |
| 退出码 | `0` 成功；`1` 校验失败/缺少前置/外部命令失败 |
| 前缀 | `[gate]` 门禁、`[state]` 状态、`[new-video]` 脚手架、`[bootstrap]`/`[doctor]` 环境 |
| 授权 | 只能由 `state.mjs approve/master` 写入；`actor` 固定 `user`，必须有非空 `evidence` |

## 1. `new-video.mjs`

### `init`

```bash
node scripts/new-video.mjs init --project <dir> --source <file-or-dir> [--products-root <dir>]
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `--project` | 是 | 目标项目目录；必须位于产品根目录内，非空目录拒绝覆盖 |
| `--source` | 是 | 资料包文件或目录；必须含唯一 `script:start` / `script:end` 标记块 |
| `--products-root` | 否 | 默认 `~/Documents/ZWhyperframes-products` |

成功：写 `00-项目总控/锁定口播稿.md`、资料包副本与 `state.json`，并创建 `99-最终合成/renders/`；`state.harness` 记录版本、commit 与 dirty。stdout 打印下一步。
失败：缺 `--source`、目录越界/非空、标记缺失/重复、创建过程失败（新建目录会清理）。

### `segment`

```bash
node scripts/new-video.mjs segment --project <dir> --plan <segment-plan.json> --id <NN>
```

成功：官方 `hyperframes init` 段脚手架 + `user_script.txt` + `segment-manifest.json` + state 追加段记录。
失败：计划不存在/哈希漂移/行区间不连续/段 ID 越界/目标目录非空。

## 2. `gate.mjs`

所有 `gate` 子命令都接受：

```bash
node scripts/gate.mjs <command> --project <root> --segment <NN> [command-specific]
```

| 命令 | 额外参数 | 成功意味着 | 常见失败 |
| --- | --- | --- | --- |
| `verify` | `--allow-missing`（仅早期） | 锁稿/段稿/manifest/TTS/注入绑定同源 | 缺 `user_script.txt`、哈希漂移、TTS 未生成、旧 injection schema |
| `authorized` | — | 段「开始授权」存在 | 未批准、授权形状非法 |
| `preflight` | — | 帧/index/audio_meta/注入/字幕/animation-map/布局/官方 check 全部通过；写 `.hyperframes/final-look-receipt.json` | 缺产物、28px、check 失败 |
| `render-ready` | — | 拿 final-look receipt 重算盘上产物：7 项单文件 + 语音/字体/BGM/音效四个目录 + 帧集合**均未漂移** | receipt 缺失/过旧、任一产物被改写、无合法 final-look 授权 |
| `final-look` | — | 已有合法 final-look 授权且 receipt 哈希一致 | 未授权、receipt 变化、preflight 失败 |
| `pitch-round` | `--segment` 可选 | `BRIEF.md` 的 `## Intent` 非空 | 缺 BRIEF / Intent 空 |
| `animation-map` | `--out <dir>` 可选 | 指定目录的 `animation-map.json` 存在、可解析、非空 | 文件缺失/`{}`/数组 |
| `check` | — | 官方 `check --strict` + 字幕 keep-out 通过 | 官方 lint/布局失败 |
| `mp4` | — | 段 MP4 存在、非空、哈希与 state 一致、时长与 STORYBOARD 差 <1s | 未 set-mp4、哈希漂移、时长不符 |
| `next-segment` | — | 前序段全部 `accepted` | 前序未接受 |
| `master-inputs` | — | 前序 accepted + 末段 rendered/final-look + MP4 哈希一致 | 段状态不全 |
| `final-delivery` | — | close 后 `renders/final.mp4` 存在，SHA-256 与 candidate 完全相同，`final-render.json` 一致 | 缺 final、哈希漂移、manifest 缺失 |
| `layout-guard` | — | 帧内可见字号 ≥28px（或可换算下界） | 小字号/`var()`/`calc()` 无法静态判定 |

`preflight` 和 `final-look` 都会重新运行 check；`state approve --kind final-look` 内部调用 `preflight`，不要先写授权再补检查。

`render-ready` 是**渲染那一刻**的复核（零副作用、纯哈希）：`preflight` 只在授权那一刻跑一次，而渲染发生在授权之后，中间任何一次改写——官方 Studio preview 会重写 `index.html` 与 `compositions/captions.html`——都会让渲染用的字节 ≠ 验证过的字节。receipt v3 起还绑定了渲染真正读取的四个资产目录：`assets/voice/`、`assets/fonts/`、`assets/bgm/`、`assets/sfx/`（官方 `assemble-index.mjs` 会把 BGM/音效写进 `index.html` 的媒体表）。`state set-mp4` 内部会调用它：漂移的渲染进不了链条。

## 3. `state.mjs`

```bash
node scripts/state.mjs show --project <root>
node scripts/state.mjs approve --project <root> --segment <NN> --kind start|final-look --evidence <text>
node scripts/state.mjs set-mp4 --project <root> --segment <NN> --mp4 <path>
node scripts/state.mjs master --project <root> --kind final-look|close --evidence <text>
```

| 命令 | 前置 | 副作用 |
| --- | --- | --- |
| `approve start` | 段存在；非首段还要求上一段 final-look + MP4 哈希一致 | 写 start 授权；上一段置为 accepted |
| `approve final-look` | start 合法 + preflight 通过 | 写 final-look 授权 + `gate_receipt` 哈希 |
| `set-mp4` | 段已 authorized；**有合法 final-look 授权**；`gate render-ready` 通过（渲染输入未漂移）；MP4 存在 | 写 MP4 路径/SHA-256/时长；**仅当本段已绑定过且这次绑的不是同一片**（路径或哈希变了）才作废旧 final-look |
| `master final-look` | candidate 存在且哈希一致；末段 final-look 合法 | 写 master final-look；`master.status=approved` |
| `master close` | master final-look + candidate 输入快照全部一致 | 生成 `99-最终合成/renders/final.mp4` + `final-render.json`，绑定 `master.final_render`，再写 close / `master.closed=true` |

`state` 在 master 批准/收尾后拒绝再写段授权或换片；返工需显式重置 master 审批（当前没有自动 reset 命令）。

## 4. TTS / 音频 / 字幕

```bash
node scripts/minimax-tts.mjs --segment <segment-dir>
node scripts/inject-audio-meta.mjs --segment <segment-dir>
node scripts/captions-zh.mjs build --segment <segment-dir>
node scripts/captions-zh.mjs verify --segment <segment-dir>
```

| 命令 | 成功产物 | 失败含义 |
| --- | --- | --- |
| `minimax-tts` | `audio/narration.mp3` + `.titles` + `.manifest.json` + `tts-binding.json` | 缺段稿/Key/网络/引擎失败；已有产物绑定一致则复用 |
| `inject-audio-meta` | `audio_meta.json`、`audio_engine_meta.json`、`injection-binding.json` | 缺 TTS、文本哈希漂移、STORYBOARD 缺帧/时长不一致 |
| `captions-zh build` | `caption_groups.json`、`caption-overrides.json`、`compositions/captions.html` | 段稿/STORYBOARD/frame.md 缺或不可解析 |
| `captions-zh verify` | 无写入，退出 0 | 分组/HTML/画布与输入不一致 |

## 5. Master 与最终交付

```bash
node scripts/finalize-master.mjs --project <root>
```

成功：`99-最终合成/candidates/candidate-<时间>.mp4` + `concat-list.txt`，state 记录 candidate 的段列表/输入快照/哈希。
失败：段未 accepted、MP4 缺失/哈希漂移、master 已 final-look/close（禁止重跑）、candidate 生成后输入变化（TOCTOU）。

`state master --kind close` 成功后会额外生成：

```text
99-最终合成/renders/final.mp4        # candidate 的字节级拷贝，不重编码
99-最终合成/renders/final-render.json
```

`state.master.final_render` 绑定 final 的路径、SHA-256、candidate SHA-256 和时长；`gate.mjs final-delivery` 复核 final 与 candidate 完全一致。final 缺失或漂移时 close/交付检查 fail-closed。

## 6. 排障入口

- 先看 `references/faq.md` 的 30 秒索引；
- 命令失败时保留 stdout/stderr 与 `state.json`，不要手工改哈希；
- 需要重跑时按 `TTS → inject → captions → preflight → final-look → set-mp4 → master` 的顺序派生。
