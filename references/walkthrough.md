# 端到端最小走查（从资料包到 master）

> 这是一个**可照抄结构**的最小示例，不是可直接运行的产品项目。尖括号 `<...>` 是占位符；实际产品默认写入 `~/Documents/ZWhyperframes-products/`。
> 可直接复制的输入见 `references/example-source.md` 与 `references/example-segment-plan.json`（哈希已对齐）。

## 0. 前提

```bash
npm run bootstrap
npm run doctor
source ./hf-env.sh
```

准备一个资料包 `source.md`（或直接用 `references/example-source.md`），用显式标记包住锁定口播稿：

```markdown
# 示例资料包

## 说明

这段说明不会进入口播。

locked-script:script:start
第一句：为什么要做这件事。
第二句：我们怎么做。
第三句：结果是什么。
locked-script:script:end
```

## 1. 开案

```bash
node scripts/new-video.mjs init \
  --project ~/Documents/ZWhyperframes-products/demo \
  --source ./source.md
```

产物：

```text
demo/
└── 00-项目总控/
    ├── 锁定口播稿.md
    ├── 资料包/source.md
    └── state.json
```

`state.json` 里会记录锁稿全文 SHA-256 与行数；此时还没有段落。

## 2. 写分段计划

分段由主智能体按语义决定。计划必须包含锁稿全文哈希、每段正文哈希与连续行区间：

```json
{
  "version": 1,
  "locked_script_sha256": "<锁稿全文 SHA-256>",
  "segments": [
    {
      "id": "01",
      "dir": "01-开场",
      "title": "开场",
      "lines": [1, 2],
      "text_sha256": "<段正文 SHA-256>"
    },
    {
      "id": "02",
      "dir": "02-收束",
      "title": "收束",
      "lines": [3, 3],
      "text_sha256": "<段正文 SHA-256>"
    }
  ]
}
```

`text_sha256` 接受“段正文”或“段正文 + 换行”两种规范形式。`new-video.mjs segment` 会重新计算并拒绝漂移的计划；首次接受后，计划文件哈希写入 `state.json`。

## 3. 段脚手架

```bash
node scripts/new-video.mjs segment \
  --project ~/Documents/ZWhyperframes-products/demo \
  --id 01
```

产物：

```text
demo/01-开场/
├── hyperframes.json
├── user_script.txt
├── segment-manifest.json
├── index.html
├── compositions/frames/
└── ...
```

`user_script.txt` 是锁稿该段行区间的冻结片段；`segment-manifest.json` 绑定段 ID、行区间、锁稿哈希与段稿哈希。

每段（含第 1 段）进入正式生产前，先记录用户「开始授权」：

```bash
node scripts/state.mjs approve \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 01 --kind start --evidence "用户确认进入第 1 段"
```

## 4. 官方 Step 0–2

在段项目内按锁定官方合同执行：

1. 写 `BRIEF.md`（init 之后；`## Intent` 必须有 pitch-round 胜出概念）；
2. Step 1 是 brief，faceless 没有 capture；
3. Step 2 用官方 `build-frame.mjs --preset` 生成 `frame.md` + caption skin。

```bash
node scripts/gate.mjs pitch-round --project ~/Documents/ZWhyperframes-products/demo --segment 01
```

## 5. 写 STORYBOARD / SCRIPT

帧的 `voiceover` 必须逐字覆盖锁稿该段正文（归一化后全等）。示例：

```markdown
---
format: 1920x1080
duration: 8s
music: none
---

## Frame 1 — 开场

- scene: 标题与问题
- voiceover: "第一句：为什么要做这件事。"
- duration: 4s
- transition_in: cut

## Frame 2 — 收束

- scene: 三个结果
- voiceover: "第二句：我们怎么做。第三句：结果是什么。"
- duration: 4s
- transition_in: cut
```

帧 HTML 仍由官方 packet builder + 每帧一个子智能体生成；不要把规范复制进 worker prompt，DISPATCH 使用官方 `_role.md` 与 packet 原文。

## 6. TTS 与音频注入

```bash
node scripts/minimax-tts.mjs --segment ~/Documents/ZWhyperframes-products/demo/01-开场
node scripts/inject-audio-meta.mjs --segment ~/Documents/ZWhyperframes-products/demo/01-开场
```

产物：

```text
audio/
├── narration.mp3
├── narration.titles
├── narration.manifest.json
├── tts-binding.json
└── injection-binding.json
audio_meta.json
audio_engine_meta.json
```

`injection-binding.json` 绑定锁稿/TTS/音频/STORYBOARD 与帧时长；`sync-durations` 会机械改写 STORYBOARD 的帧时长。

## 7. 字幕

```bash
node scripts/captions-zh.mjs build --segment ~/Documents/ZWhyperframes-products/demo/01-开场
node scripts/captions-zh.mjs verify --segment ~/Documents/ZWhyperframes-products/demo/01-开场
```

产物：

```text
caption_groups.json
caption-overrides.json          # 官方空 shim
compositions/captions.html      # 官方 buildFromSkin 填充
```

字体、切分、单行与高亮合同见 `docs/rules/captions-contract.md`。

## 8. final look 前置检查

先渲染/生成帧与 index，再运行：

```bash
node scripts/gate.mjs preflight \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 01
```

通过后会写 `.hyperframes/final-look-receipt.json`。然后记录用户授权：

```bash
node scripts/state.mjs approve \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 01 --kind final-look --evidence "用户确认 Studio 预览"
```

`state approve` 内部会再跑一次 preflight，并把 receipt 的 SHA-256 写入授权；先写授权再补 check 的路径不可用。

## 9. 渲染与 MP4 绑定

```bash
# 在段目录内，用锁定 CLI 渲染
hf render --quality high --output renders/video.mp4

node scripts/state.mjs set-mp4 \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 01 --mp4 ~/Documents/ZWhyperframes-products/demo/01-开场/renders/video.mp4

node scripts/gate.mjs mp4 \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 01
```

`set-mp4` 会记录 SHA-256、ffprobe 时长并按 STORYBOARD 总时长做合理性对照；换片会清除旧 final-look。

## 10. 下一段与 master

下一段开始授权会机械确认前一段：

```bash
node scripts/state.mjs approve \
  --project ~/Documents/ZWhyperframes-products/demo \
  --segment 02 --kind start --evidence "用户确认进入第 2 段"
```

全部段落 accepted 后拼接：

```bash
node scripts/gate.mjs master-inputs --project ~/Documents/ZWhyperframes-products/demo
node scripts/finalize-master.mjs --project ~/Documents/ZWhyperframes-products/demo

# 用户看候选后
node scripts/state.mjs master \
  --project ~/Documents/ZWhyperframes-products/demo \
  --kind final-look --evidence "用户确认 master 候选"

node scripts/state.mjs master \
  --project ~/Documents/ZWhyperframes-products/demo \
  --kind close --evidence "用户完成收尾审批"
```

产物：

```text
99-最终合成/candidates/candidate-<时间>.mp4
99-最终合成/candidates/concat-list.txt
```

`finalize-master` 只做已确认段 MP4 的 thin concat；master 批准后 candidate 冻结，不能再换片或重跑 finalize。

## 11. 每步对应的证据

| 产物 | 产出者 | 被谁校验 |
| --- | --- | --- |
| `锁定口播稿.md` | `new-video init` | `gate verify` |
| `segment-plan.json` | 主智能体 | `new-video segment` |
| `user_script.txt` | `new-video segment` | `gate verify` |
| `tts-binding.json` | `minimax-tts` | `gate verify` / `inject` |
| `injection-binding.json` | `inject-audio-meta` | `gate verify` / `preflight` |
| `caption_groups.json` / `captions.html` | `captions-zh` | `captions-zh verify` / `preflight` |
| `animation-map.json` | 官方 animation-map | `gate animation-map` / `preflight` |
| `final-look-receipt.json` | `gate preflight` | `state approve final-look` / `gate final-look` |
| `state.json` 的 MP4 绑定 | `state set-mp4` | `gate mp4` / `master-inputs` |
| master candidate | `finalize-master` | `state master final-look/close` |

## 12. 常见分支

- **没有 BGM**：`music: none`；`inject` 仍会跑官方 BGM 阶段，但没有可检索曲目时只警告。
- **没有语音/纯视觉**：当前 harness 的字幕合同与 preflight 默认要求字幕产物；先确认是否属于本仓支持的 faceless 口播生产。
- **旧项目 v1 注入绑定**：`gate verify` 会要求重跑 `inject` 派生 v2；不要回填哈希。已交付项目不迁移。
- **需要返工已批准段**：先重置该段/master 审批，再 `set-mp4` 或重新 finalize；不要在旧批准上直接换片。

更完整的规则见 `docs/rules/`；排障见 `references/faq.md`。
