# 示例资料包

## 说明

这段说明不会进入口播；只有 `script:start/end` 标记之间的内容会被冻结。

locked-script:script:start
第一句：为什么要做这件事。
第二句：我们怎么做。
第三句：结果是什么。
locked-script:script:end

## 用法

```bash
node scripts/new-video.mjs init \
  --project ~/Documents/ZWhyperframes-products/demo \
  --source references/example-source.md
```

锁稿冻结后，把 `references/example-segment-plan.json` 复制到
`<项目>/00-项目总控/segment-plan.json`，再执行：

```bash
node scripts/new-video.mjs segment \
  --project ~/Documents/ZWhyperframes-products/demo \
  --id 01
```

示例计划的两段正文哈希已经与本文件的锁稿行区间对齐；真实项目请用实际资料包重新生成计划。
