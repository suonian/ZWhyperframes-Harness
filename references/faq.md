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
| 中国大陆网络下 GitHub 取回慢 | §5.1 |
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

### 4.3 `layout-guard` 报 28px 或“无法判定”

- `px` 直接比较；`cqw`/`vw` 按 STORYBOARD `format` 的真实宽度换算；`rem`/`em` 按 16px 估算；`clamp()` 取下界。
- `var()`/`calc()` 等动态值无法静态判定，按 fail-closed 报错。
- 隐藏元素也可能被扫到；这是已知的保守误报，必要时人工确认后调整元素，而不是放宽门禁。

### 4.4 `master final-look` / `close` 被拒绝

- `master final-look` 必须已有 `finalize-master.mjs` 生成的 candidate，且 candidate 哈希未漂移。
- `close` 前必须有 master final-look；candidate 的段列表与输入快照必须与当前 state 一致。
- master 批准/收尾后，不能再 `set-mp4`、重新 `finalize` 或写段授权；这是防止“批准后换片”。
- 需要返工时，必须显式重置 master 审批，而不是手工删一个字段继续。

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
