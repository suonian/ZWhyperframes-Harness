# 视觉生产规则书

> 视觉质量底线。官方 worker 合同优先（`$HYPERFRAMES_REPO/skills/hyperframes-core/references/frame-worker-core.md` 与 faceless-explainer 的 `visual-design.md`/`motion-language.md`）；本文件只补充官方没有的**项目级**要求。冲突时以官方合同为准，除非用户明确否决。

## 1. 官方合同摘要（必须遵守，细节以官方原文为准）

- 内容全部落在 top ~83% 保持区（字幕带约 bottom 17%）；hero 早可见（t ≤0.5s）
- 可见文字是短动态文案（关键词/数字/极短结论），绝不上口播整句；完整叙述只在底部字幕
- 全时长揭示、禁止 front-load（前 25% 铺满后静止 = PPT）；非末帧禁止 exit 动画（root 转场就是出口）
- 字体只准用项目内随附字体文件（frame.md 声明 + `@font-face` 指向本地文件）；禁止系统 CJK 字体名
- `<template>` 裸包装、`data-composition-id`、`#root` 样式（不用 class）、full-bleed 背景走 `class="clip"`、单一 paused GSAP timeline 注册于 `window.__timelines`、clip 带 `data-start/data-duration/data-track-index`
- 确定性：禁 `Date.now()`/`Math.random()` 未种子/渲染期网络/无限 repeat；一切动画由 seek 驱动
- motion 词汇与 blueprint 签名动作来自官方 catalog/blueprints/rules，名称不得自造

## 2. 项目级视觉底线（前代已验证要求，无品牌部分）

- **首帧规则**：0–2 秒必须有可辨认的价值、冲突、结果或真实证据；禁纯色等待、孤立标题淡入
- **一页一个叙事职责**：删除字幕后仍能看出主体及其变化；动效改变理解而不只是改变位置
- **禁飞线/引线/连接线/箭头**表达关系：用空间编组、先后/同时亮相、共同容器、同步运动或镜头交接；只有轨迹/时间线/趋势本身是叙事对象时允许线条
- **文本类元素必须是可读真字**：文档、终端、界面、清单等语义载体写真实短内容，禁色条/横线/占位块冒充正文
- **移动端可读性**：机器只拦 <24px 显式 CSS；主智能体须对照快照人工确认手机 390px 可读；对比度以官方 check（WCAG）为准
- **节奏**：每 8–12 秒有可感知状态变化；允许必要的 rest beat（有意停顿），不允许无叙事 idle 摇晃
- **平台中立**：多平台分发不出现社交/聊天平台官方 Logo、App 图标或高识别仿制图形

## 3. 复审纪律（官方 review-loop 之上）

三层复审范围不重叠：Step 4 设计复审（从磁盘重读、不预设正确）→ Step 5 逐页实现复审（对照 Storyboard 块、主题、素材、animation-map 与 Scene 快照）→ Step 6 整段 0→结尾动态复审（Studio 实播 + 接触表 + 首帧 0.2s/1.0s/2.0s）。`check ok` 不等于审美通过。
