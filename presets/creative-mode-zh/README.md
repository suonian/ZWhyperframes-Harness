# creative-mode-zh —— 中文可选 preset（非默认）

> **定位：可选件。** 本项目默认视觉基线是**官方 `capsule` + `Noto Sans SC`**（唯一所有者：`docs/rules/visual-baseline.md` §2）。本 preset 只在**显式指名**时使用；官方 13 套 preset 与本 preset 全部合法，本仓不做 allow-list 阻断。

官方 `creative-mode` preset 的**中文适配版**。用法：

```bash
cd <segment-dir> && node <harness>/vendor/skills/faceless-explainer/scripts/build-frame.mjs \
  --preset creative-mode-zh --preset-dir <harness>/presets --hyperframes .
```

## 为什么需要它

官方 `creative-mode`（`vendor/skills/hyperframes-creative/frame-presets/creative-mode/`）是**英文版**。中文知识视频直接用它会同时踩三个坑：

| | 官方 creative-mode | 本 preset |
| --- | --- | --- |
| 画布底色 | `#EFE9D9` 暖奶油 | `#F7F7F5` 近白 |
| 次级面 | `#E4DCC4` | `#ECEEF3` |
| 强调色 | 橙 `#E85A1F` / 黄 `#F5C518` / 绿 `#1F8A4C` / 粉 `#F06CA8` | 橙 `#F97316` / 黄 `#FACC15` / 绿 `#12B76A` / 粉 `#F5539E` / **蓝 `#2F6BFF`** |
| 字体 | Archivo Black / JetBrains Mono / Space Grotesk（**无中文字形**） | Noto Sans SC 900 / Space Grotesk 数字 / Inter |
| 字幕 | 奶油卡 + 4px 墨黑描边 + 14px 橙色硬阴影 + **逐词黄色高亮块** | **无背景、无盒子、无逐词块；当前行用 accent 高亮** |
| 圆角档位 | 无 `radii` 声明 | 卡片 24px / 小卡 20px / 小片 14px / 胶囊 999px |

具体症状：中文在 Archivo Black 里掉到系统字形；字幕自带背景（中文知识视频的字幕合同要求逐字、无盒子、当前行高亮）；段与段之间调色板漂移；`frame.md` 注入的 `:root` token 与画面实际用色不一致。

## 边界

- **只改视觉与文案皮肤，不改官方 build-frame 的算法**：`build-frame.mjs` 仍是官方脚本，仍走它自己的 self-check（色板 key 保留、ink/canvas 对比度）。本目录只是 preset 目录里的一份 `FRAME.md` + `caption-skin.html`。
- **不修改 `vendor/`**：`vendor/` 是锁定 commit 的官方 skills，`bootstrap.sh` 逐项 fail-closed 校验，改它会破坏可复现性。中文适配放在本仓 `presets/` 下，靠 `--preset-dir` 指向。
- **同一项目的所有段必须用同一个 preset**：`frame.md` 是 `captions-zh.mjs` 注入 `:root` token 的唯一来源，换 preset 会让字幕底色/字体与画面脱节。

## 改 preset 后必须重跑

```bash
node scripts/captions-zh.mjs build --segment <segment-dir>
node scripts/captions-zh.mjs verify --segment <segment-dir>
node <harness>/vendor/skills/faceless-explainer/scripts/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes .
node <harness>/vendor/skills/faceless-explainer/scripts/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes .
node scripts/gate.mjs preflight --project <root> --segment NN
```

## 相关

- 命令契约：`references/commands.md` §4.1
- 字幕合同（要求不可变更）：`docs/rules/captions-contract.md`
- 视觉底线：`docs/rules/visual-production-rulebook.md`
