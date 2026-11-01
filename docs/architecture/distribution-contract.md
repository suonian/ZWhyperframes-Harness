# 分发与发布：命令契约与体积口径

> 本文件是 `references/commands.md` §6 的**仓库完整版**。分发包内不含打包器与发布器
> （`build-skill-package.mjs` / `publish-skillhub.mjs` / `install-skill.sh` 整组排除），
> 所以那套命令契约只在仓库里——包内的 `references/commands.md` §6 只留一行指引。
>
> 排除理由：**消费者装上技能是为了跑 harness 干活，不是为了再打包、再发布一次**。

## 命令

```bash
node scripts/build-skill-package.mjs --root . --out .skillhub-pkg/pkg   # 产出分发包 + 清单
node scripts/publish-skillhub.mjs --dry-run                              # 发布前干跑：打印真实请求体大小
npm run publish-skill -- --dry-run                                      # 同上（需先 skillhub login）
```

| 命令 | 成功意味着 | 失败含义 |
| --- | --- | --- |
| `build-skill-package.mjs` | 产出目录 + 同级 `<out>.manifest.json`（含每文件 SHA-256 与请求体估计值） | 文件数 >100 / 单文件 >1MB / 缺 `SKILL.md` / **请求体估计超发布闸** / 包内存在死链 |
| `publish-skillhub.mjs --dry-run` | 打印「请求体 X KB（上限 460 KB）」与 `Dry-run passed` | 请求体超发布闸（不发请求）/ **估计值与真实 body 不一致**（口径漂移）/ 缺凭据 |

## 体积口径只有一套

唯一真源是 `scripts/lib/package-limits.mjs`：

- **打包期**按**估计的 multipart 请求体**判（fail-closed，不产出超限包）；
- **发布期**用**真实 body** 判，并与估计值**对账**——不等即拒发（估计函数与真实构造漂了就拒发，而不是放行一个「本地过、线上炸」的包）；
- 服务端实测上限约 476KB（475KB 可通过、480KB 被断开），本仓发布闸 **460KB 机器硬性限制**（唯一真源 `scripts/lib/package-limits.mjs` 的 `PUBLISH_MAX_BODY_BYTES`，留 15KB 余量）。
  - 超线时**打包期就 fail-closed**并直接告知「内容超了，请处置」，而不是发布到一半被服务端静默断开。
  - 内容超线的处置顺序固定：**① 扩排除清单 → ② 把长文档拆到仓库 → ③ 才谈调上限**（调上限必须显式改常量并同步 CHANGELOG，不得静默）。唯一不许动的是 `package-lock.json`：它承载依赖可复现性。
  - 因此内容增长的处置顺序是固定的：**① 扩排除清单 → ② 把长文档拆到仓库 → ③ 才会到这里**。2026-11-01 视觉基线能力（新增规则书 + 门禁 + 判定库约 33KB）走完前两步仍超线，故闸值从 470KB 提到实测上限。

**请求体 ≠ 文件字节和**：multipart 头 + changelog 字段 + 其它字段会额外占十几 KB。按文件字节和判会放过一个「本地过、线上炸」的包——这正是 2026-10-24 审计 M-21 记的那条。

changelog 是请求体里的一个**字段**（不是包内文件），超 8KB 会被截断并标注；打包期的估计也按截断后的长度算。

## 内容边界

包内容 = 平台准入白名单 ∩ 内容清单（`CONTENT_EXCLUDE_DIRS` / `CONTENT_EXCLUDE_FILES` / `CONTENT_EXCLUDE_PATHS`）。

**整组排除的三类**（仓库里全部保留——这是发布边界，不是删除）：

1. **分发侧工具链**：`build-skill-package.mjs` / `install-skill.sh` / `publish-skillhub.mjs` / `lib/changelog.mjs` / `lib/package-limits.mjs`。包内 `package.json` 同步剥掉指向它们的 npm script。
2. **教学与长文档**：`references/walkthrough.md` 及其示例输入、`docs/architecture/`、`tests/`。
3. **独立通用工具与第三方 API 参考**：`tools/minimax/` 的图片/视频脚本与独立文档。

**不排除 `package-lock.json`**：包内 `package.json` 仍带 `devDependencies: hyperframes@0.8.36`，而 `bootstrap.sh` 跑的是 `npm install`（不是 `npm ci`）——没有锁文件，npm 会按范围重新解析。实测去掉锁文件后 189 个传递依赖中有 **23 个会漂**（含渲染用的 `puppeteer-core` 25.10.0 → 25.16.0）。

## 包内死链自检

随包分发的 `.md` 若指向包内不存在的文件即拒绝产出——排除清单移走的文件常被别的文档用链接指着，而包内死链只在分发后才暴露，那时已无法 fail-closed。
