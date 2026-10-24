[English](CHANGELOG.en.md) | **中文**

# 更新日志

本项目的版本记录 notable changes。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

> ⚠️ **HyperFrames 版本锁定**：`0.8.36`。升级不是版本号的改动，而是**合同审计**任务——官方 skill 内容随上游 commit 一并变动，而本仓规则直接引用其原文。

## [未发布]

暂无。

## [0.2.6] — 2026-10-24

补齐命令契约：把各脚本的参数、成功输出、失败含义、产物与返工顺序集中到分发包内的 `references/commands.md`，并在 `SKILL.md` / `AGENTS.md` / README 中建立入口。无生产行为变更。

### 文档与分发
- 新增 `references/commands.md`：`new-video`、`gate`、`state`、TTS/注入/字幕、`finalize-master` 的参数与退出含义，明确 0/1 退出码与 `[gate]`/`[state]` 前缀。
- 命令契约入口加入 `SKILL.md` 的路由表、`AGENTS.md` 的规则导航、GitHub README 与包内 README。
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

[未发布]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.6...HEAD
[0.2.6]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.5...v0.2.6
[0.2.5]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.4...v0.2.5
[0.2.4]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/suonian/ZWhyperframes-Harness/releases/tag/v0.1.0