# ZWhyperframes-Harness 启动设计 v3（官方能力最大化 · 已对齐决策）

> 状态：已对齐，实施中。已吸收用户决策：放弃前代品牌、字幕要求不变（实现最优解由设计方判断）、Ed25519/任务图/生产模式由设计方决断、质量增强能力必须引入并在生产中强制体现、生产逻辑（官方 Step 0–6）不变。

## 1. 定位（管理层定制层）

**HF 是引擎和整车；本 harness 只是方向盘上的定制按钮和质检单。**

- **核心能力 100% 来自 HyperFrames v0.8.36**（锁定 commit `f86aae655ae5aae7a9a2c124fa016f3bc30ebe52`）：composition、分镜板、子智能体合同、音频引擎、字幕渲染、转场、装配、lint/check/snapshot、Studio、渲染、catalog、recipe——一行不重写。
- **本 harness 是「管理层」**，只做三件事：
  1. **保流程**——规则和门禁确保每一支视频完整走 HF 官方 Step 0–6 + review-loop，不跳步、不歪曲、不降级；
  2. **补缺口**——只补 HF 没有的管理能力：锁定稿分段、MiniMax 词级时间注入（按官方 `audio_meta.json` 形状喂数据）、master 拼接、轻量状态与授权记录；
  3. **优能力**——把 HF 官方已有但未充分使用的质量能力系统性接入流程，让官方能力物尽其用；优化的是「用 HF 的方式」，不是改 HF 本身。
- **本质**：把 HF 通用视频生产流水线定制成「我们的生产流水线」；定制的载体是管理层（规则 + 薄脚本），不是核心能力层。

## 2. 已决断事项（用户授权）

| 项 | 决断 | 理由 |
| --- | --- | --- |
| 品牌 | **放弃前代品牌** | 无品牌 preset/片尾/人物/Logo；设计系统直接用官方 13 个 frame presets 按叙事选择 |
| 字幕 | **要求不变**（锁定稿逐字一致、标点语块切分、单行显示、无动效、仅当前行高亮） | 实现路线：① 先官方 captions.mjs 原生验证中文效果；② 不满足则 harness 只写「分组数据」（走官方 caption-overrides 通道），官方运行时渲染——渲染永远官方，我们最多供数据。逐字一致以 MiniMax 词级时间文本=锁稿原文保证 |
| 授权签名 | **放弃 Ed25519**，降为轻量授权记录（actor=user + 产物 SHA-256 + 时间戳） | 单人流水线，用户亲签+聊天留痕已足够；密码学层收益低 |
| 任务图 | **放弃 v2 任务图**，仅保留轻量 `state.json`（段计划/状态/授权/哈希） | 官方已有帧状态机（outline→built→animated）+ board + 交接文档 |
| 生产模式 | **autonomous**（`flow: automation, storyboard: no`）；用户决策保留两门：每段「开始授权」+「final look 渲染授权」，master 两门 + 收尾一门 | 前代已验证的节奏；文字分镜不送审 |

## 3. 质量增强能力引入清单（官方已有、前代未用，本次强制引入）

每条都有确定的生产落点与机器命令，写入生产规则后**每支视频必须执行**，不是可选建议：

| # | 官方能力 | 质量作用 | 生产落点（不改 Step 0–6 结构） |
| --- | --- | --- | --- |
| 1 | **pitch-round 创意采样门**（intent 层，autonomous 版内部执行） | 防"中位数视频"：四问→五概念→尾部约束（≥2 概念概率 <0.10）→剪影查重 | Step 0 开案：BRIEF.md 生成前必跑，胜出概念写入 `## Intent` |
| 2 | **官方 13 个 frame presets** | 设计系统质量（替代品牌主题） | Step 2：按叙事选 preset，`build-frame.mjs --preset` 生成 frame.md + caption skin |
| 3 | **catalog `--on-device` 语义检索** | motion/block 匹配质量高于关键词档 | P0 一次性下载 33MB 本地索引并同意；Step 4 每帧 `catalog --query --on-device --json` 后定 blueprint/compose |
| 4 | **audio voiceover carve**（`hyperframes-audio/scripts/carve.mjs` + 官方预设） | BGM 对人声挖频，混音质量（官方生产循环明确要求"bed is carved"） | Step 6：assemble 后、check 前，对 BGM 轨必跑 carve |
| 5 | **animation-map.mjs**（逐 tween bbox 采样动画地图） | 机器化动效审计（越界/密度/空闲检测的官方工具） | Step 5 主审前置：每页装配后跑，`animation-map.json` 供逐页复审消费 |
| 6 | **check --strict** | warn 也门禁，收严质量地板 | Step 6 verify 必带 `--strict` |
| 7 | **keyframes 诊断** | seek-safe 动画与运动路径缺陷 | Step 6：有 camera/mask/zoom/转场风险时必跑 |
| 8 | **snapshot 接触表 + grade-compare 变体对比表** | 一眼可见的视觉证据；高风险页双机制挑战的对比证据 | Step 4 高风险页双案比较用 compare；Step 6 接触表随 final look 交付 |
| 9 | **preview --context + frame-comments 评论通道** | 用户"指哪改哪"的结构化反馈 | final look：用户可指着元素反馈；评论文件按官方 review-loop 处置（改完删文件） |
| 10 | **publish** | 用户拿到可点击私密链接（替代 file:// 路径） | final look 与 master 交付时可选发布 |
| 11 | **recipe freeze/use** | 通过成片冻结为配方，跨视频一致性 | 交付后冻结（官方 review-loop §4 规定的一次性提议） |
| 12 | **media-treatment**（按需） | 用户素材调色/适配版（faceless 场景少用） | 素材预处理，选中后仍走 media-use 冻结 |

## 4. harness 内容清单（最小）

```text
ZWhyperframes-Harness/
├── AGENTS.md / README.md / docs/
│   ├── rules/  视觉规则书（前代规则合并官方 worker 合同，官方优先）
│   │           + 字幕合同（要求不变，实现=官方渲染+可选分组数据）
│   │           + 分段规则 + 生产流程（官方 Step 0–6 + 第 3 节能力落点全部强制化）
│   ├── architecture/ 能力审计 + 交接文档
│   └── plans/ 本设计
├── scripts/     全部单步、确定性、零 agent 调用
│   ├── new-video.mjs        锁稿冻结+分段计划+逐段官方 init
│   ├── minimax-tts.mjs      MiniMax 语音+词级时间（沿用前代已验证实现）
│   ├── inject-audio-meta.mjs 词级时间 → 官方 audio_meta.json
│   ├── captions-zh.mjs      仅当官方原生分组不满足字幕合同时：生成官方 override 分组数据
│   ├── gate.mjs             轻量门禁（锁稿哈希/TTS 同源/官方 check --strict 包装/段 MP4 校验）
│   ├── finalize-master.mjs  thin ffmpeg concat + 输入校验
│   └── state.mjs            轻量状态/授权记录/哈希绑定
├── templates/    （无品牌；仅 caption skin 备用与分段脚手架模板）
├── tools/minimax/ MiniMax 调用器（照搬）
└── tests/        单步脚本测试
```

**明确不包含**：队列/心跳/lease、worker 执行层、物理镜像、transcript 证据、Ed25519、任务图、自建 storyboard parser、自建 caption 渲染、自建转场、自建装配、品牌资产。

## 5. 生产流程（官方 Step 0–6 + harness 适配 + 强制质量点）

```
harness: new-video（锁稿冻结 → 分段计划 → 逐段官方 init）
harness: 每段开始授权（用户，轻量记录）
Step 0   意图层：pitch-round 内部采样门 → BRIEF.md（autonomous）
Step 1   capture（资料归档）
Step 2   官方 preset 选择 → build-frame → frame.md + caption skin
Step 3   STORYBOARD.md / SCRIPT.md（锁稿逐字）+ 叙事复审
Step 3.1 harness MiniMax TTS → 词级时间 → 官方 audio_meta.json；官方引擎 BGM
Step 4   catalog --on-device 检索 → blueprint/compose + Scenes；高风险页双机制 compare
Step 5   官方 packet builder → 子智能体波次派发（≤3）→ lint/check 复核 → animation-map → 主审
Step 6   fetch-sfx / captions / assemble / transitions / carve / check --strict / keyframes / snapshot
harness: final look 渲染授权（用户，可 publish 链接 + frame-comments 反馈）→ 官方 render → 段 MP4 校验
harness: 下一段开始授权（确认上一段）→ … → master thin concat → master final look → 收尾审批 → recipe freeze
```

## 6. 实施顺序

1. 骨架与文档（AGENTS/README/规则/设计 + git 初始提交）
2. 复用资产落地：MiniMax 工具、规则书合并（官方优先）
3. 环境准备：HF v0.8.36 checkout + bootstrap + on-device catalog 索引
4. 脚本：new-video / minimax-tts / inject-audio-meta / gate / finalize-master / state
5. 测试（单步脚本）
6. 真实视频端到端验证：在 `~/Documents/ZWhyperframes-products/` 启动第一支视频，逐项实证第 3 节 12 条能力全部在生产中体现（含待实测项：MiniMax 注入合并、字幕原生效果、sync-durations 交互、data-hf-id、caption zone）
