#!/usr/bin/env node
// build-skill-package.mjs — 把本仓打成 SkillHub 可上传的技能包
//
// 平台协议（iflytek/skillhub docs/07-skill-protocol.md §8.3）对上传包有硬约束：
//   - 文件类型白名单：.md .txt .json .yaml .yml .js .cjs .mjs .ts .py .sh .png .jpg .svg
//   - 文件数量 ≤ 100、总包 ≤ 10MB、单文件 ≤ 1MB
//   - 根目录必须含 SKILL.md
// 本仓含 LICENSE / NOTICE / .gitignore / CITATION.cff，均不在白名单内，故需经本脚本
// 过滤后产出到独立目录，再以该目录为 `skillhub publish` 的入参。
//
// 性质：单步、幂等、确定性、零 agent 调用。产物目录整体重建，不做增量。
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync, lstatSync } from "node:fs";
import { join, resolve, relative, extname, sep, dirname, basename } from "node:path";
import { sha256File, writeJson } from "./lib/harness.mjs";
import { extractChangelog } from "./lib/changelog.mjs";
import {
  MAX_FILES as MAX_FILES_LIMIT,
  SERVER_MAX_BODY_BYTES,
  checkPackageBodySize,
  parseSkillFrontmatter,
  readChangelogForVersion,
} from "./lib/package-limits.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

// 平台协议 §8.3 列举了白名单 `.md .txt .json .yaml .yml .js .cjs .mjs .ts .py .sh .png .jpg .svg`，
// 但线上服务端实测拒收 `.jpg`（错误「不允许的文件类型: assets/wechat-qr.jpg」），
// 实际准入为纯文本类。二进制与图片类一律排除。
const ALLOWED_EXT = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml",
  ".js", ".cjs", ".mjs", ".ts", ".py", ".sh", ".toml", ".html", ".css", ".csv",
]);
// CLI 与协议共同排除的目录
// vendor/ 是 bootstrap 按锁定 commit 取回的上游 skills/ 子树（.gitignore 内）——
// 它是官方产物，不随本仓分发；不排除会把 800+ 个上游文件打进技能包。
// .skillhub-pkg/ 是本脚本自己的产物目录，不排除会把它连同上一次的包一起扫进来。
// .github/ 是本仓自身的 CI 与 issue 模板，属仓库基础设施，对技能使用者无用。
// chrome/ 是官方 CLI（hyperframes browser ensure）的浏览器下载缓存，落在 <cwd>/chrome/；
// 在本仓根跑过一次就会留下上百 MB 的压缩包。按**路径**排除，不靠扩展名白名单兜底——
// 白名单只是平台准入条件，不是「我们想发什么」的判断。
// .minimax/ 是 MiniMax Code 的原生工作区 skill 根（<repo>/.minimax/skills/），
// 也是 install-skill.sh --dir 的安装目标。它落在仓库内部，不排除的话，
// 本仓打出的技能包会被下一次打包重新扫进来——既递归又撞文件数上限。
const EXCLUDE_DIRS = new Set([".git", ".github", ".idea", ".vscode", "node_modules", "vendor", ".skillhub-pkg", "__pycache__", ".astro", ".astron", "chrome", ".minimax"]);
const EXCLUDE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

// ── 发布包的内容清单 ─────────────────────────────────────────────────────
// 与「平台准入白名单」是两层不同的约束：前者按扩展名（平台收什么），这里按
// 路径（**我们想让技能包含什么**）。区分清楚，才不会把「平台不收」和
// 「本仓不打算发」混为一谈。
//
// 为什么需要这一层——实测事实：服务端对 publish 请求体有约 476KB 的实际上限
// （协议文档写 ≤10MB，文档与线上部署不一致）。服务端**不接受** gzip 压缩的
// 请求体（实测带 Content-Encoding: gzip 的 multipart 会在表单解析阶段返回
// 400「解析表单失败: multipart: NextPart: EOF」）。因此包必须靠**内容取舍**
// 压到上限内，而不能靠压缩。
//
// 技能包的内容边界：**使用者运行这个 harness 干活所需的文件**。
// 治理文档、变更历史、英文镜像、内部架构记录与本仓自身的门禁用例都不属于
// 那一层——它们在 GitHub 仓库里随时可查，且对「用这个 harness 做视频」无用。
// 保留 package-lock.json 是因为生产依赖锁定是本仓的核心性质，丢了它
// `npm install` 会解析到与 CI 不同的传递依赖版本。
const CONTENT_EXCLUDE_DIRS = new Set(["tests", "docs/architecture", "docs/plans"]);

/**
 * 包内 package.json 的最终内容。
 *
 * 包内要去掉指向**包外文件**的 npm script：分发侧工具链
 * （publish-skillhub.mjs / build-skill-package.mjs / install-skill.sh）不入包，
 * 留着它们的 script 就等于在包里放一个跑不通的入口——
 * 「文档/入口描述了包里没有的东西」正是本仓要消灭的那类漂移。
 *
 * 这个函数同时用于**体积估算**与实际写盘——两边必须用同一份字节，
 * 否则打包期算出的请求体估计与发布期的真实 body 会有差值。
 */
function renderPackageJson(text) {
  const pkg = JSON.parse(text);
  if (pkg.scripts) {
    for (const [name, file] of Object.entries({
      "publish-skill": "scripts/publish-skillhub.mjs",
      "install-skill": "scripts/install-skill.sh",
    })) {
      if (CONTENT_EXCLUDE_PATHS.has(file) && pkg.scripts[name]) delete pkg.scripts[name];
    }
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
const CONTENT_EXCLUDE_FILES = new Set([
  "CHANGELOG.md", "CHANGELOG.en.md",
  "RELEASE-HANDBOOK.md",
  "README.md", "README.en.md", "README.package.md",
  "CONTRIBUTING.md", "CONTRIBUTING.en.md",
  "SECURITY.md", "SECURITY.en.md",
  "CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT.en.md",
  "package-manifest.json",
  // 端到端走查与它的配套示例：走查是「照抄一遍完整流程」的教学材料，
  // 它的示例输入指向仓库内的示例文件。包内保留的是**运行与排障**所需的
  // references/faq.md（按症状索引）与 references/commands.md（命令契约），
  // 走查本身在 GitHub 仓库里随时可查。
  "references/walkthrough.md",
  "references/example-source.md",
  "references/example-segment-plan.json",
  // 打包清单自身：它写在包目录**同级**（仓库根），不是包的内容。
  // 不排除的话，下一次打包会把它打进包里 —— 包体凭空变大，
  // 逼近体积上限时甚至会让打包 fail-closed 失败（自指增长）。
  ".skillhub-pkg.manifest.json",
]);

// 「独立通用工具」整组排除：MiniMax 的图片/视频生成脚本不在本仓生产主链上
// （成片由 HyperFrames 渲染，不是 MiniMax 视频），它们的文档也只服务于自己。
// 成组排除而不是逐个排除——留一半只会得到「文档描述了包里没有的脚本」。
// 仓库里全部保留（这是发布边界，不是删除）。
//
// 「分发侧工具链」整组排除：**消费者装上技能是为了跑 harness 干活，不是为了
// 再打包、再发布一次**。这组脚本只服务于「仓库 → 分发包 → 平台」这条链路：
//   · build-skill-package.mjs —— 产出分发包
//   · install-skill.sh        —— 把仓库装进本地技能目录
//   · lib/changelog.mjs       —— 只被 publish-skillhub.mjs 使用
//   · publish-skillhub.mjs    —— 上传平台（此前已排除）
// 连带要清掉 package.json 里指向它们的 npm script，否则包里留一个跑不通的入口。
//
// 「第三方 API 参考文档」整组排除：MiniMax TTS 的接口格式说明与语音档案，
// 运行时**不读**它们（脚本里写死了档案参数），它们只服务于维护者。
const CONTENT_EXCLUDE_PATHS = new Set([
  "tools/minimax/README.md",
  "tools/minimax/docs/STANDALONE_API_GUIDE.md",
  "tools/minimax/scripts/minimax_image.py",
  "tools/minimax/scripts/minimax_video.py",
  // 分发侧工具链（见上方说明）
  "scripts/publish-skillhub.mjs",
  "scripts/build-skill-package.mjs",
  "scripts/install-skill.sh",
  "scripts/lib/changelog.mjs",
  // 体积口径的共用模块：只被上面两个打包脚本使用，随它们一起出包。
  "scripts/lib/package-limits.mjs",
  // MiniMax 的第三方 API 参考文档与请求样例：运行时不需要
  "tools/minimax/docs/HF_AUDIO_SUBTITLE_FORMAT.md",
  "tools/minimax/docs/VOICE_PROFILE.md",
  "tools/minimax/examples/tts_request.example.json",
  // 通用 API 配置样例：它描述的是 music / image / video 那几个**已排除**的独立通用工具，
  // TTS 脚本的语音档案是写死在代码里的（不读这个文件）。
  "tools/minimax/minimax.config.example.json",
]);

// 平台协议 §8.3 体积与数量上限。
//
// 【体积闸改成「按真实请求体」判】
// 此前这里按「文件字节和」判、线在 470KB，而 publish-skillhub.mjs 按「真实 multipart
// 请求体」判、线在 460KB —— 两个口径不一样，而请求体比文件字节和大十几 KB
// （multipart 头 + changelog 字段 + 其它字段）。于是「打包通过、发布必失败」。
// 实测：47 个文件、文件字节和 451.2KB 时，真实请求体 466.5KB。
//
// 现在两处共用 scripts/lib/package-limits.mjs 的同一套算法：
// 打包期用**估计值**判（fail-closed，不产出超限的包），发布期用**真实 body** 判，
// 并断言两者相等——不等即说明估计函数与真实构造漂了，同样 fail-closed。
//
// **处置顺序**（逼近上限时按这个次序，不要一上来就调上限）：
//   ① 扩内容排除清单（把「使用者跑 harness 干活用不到」的文件移出包）；
//   ② 把长文档拆到仓库（包只留消费者运行必需的）；
//   ③ 才谈调整上限——而且必须同时更新 package-limits.mjs 与 CHANGELOG 的数字。
const MAX_FILES = MAX_FILES_LIMIT;
const MAX_FILE_BYTES = 1 * 1024 * 1024;

const root = resolve(get("root") ?? "..");
// 包产物落在 .skillhub-pkg/pkg/：**与同级的临时产物目录分开**。
// .skillhub-pkg/ 既是本仓的 gitignore 临时区，也是包产物区；两者混在一处时，
// 临时脚本/对照素材会被 install-skill.sh 一并装进技能目录。
const outDir = resolve(get("out") ?? join(root, ".skillhub-pkg", "pkg"));
if (get("root") === undefined && get("out") === undefined) {
  throw new Error("必须显式指定 --root 与 --out，不设默认值以免误打包整个仓库");
}
if (!existsSync(join(root, "SKILL.md"))) {
  throw new Error(`根目录缺少 SKILL.md：${root}`);
}

const included = [];
const excluded = [];

/**
 * rel 是否落在内容排除目录下（按**目录前缀**逐级匹配）。
 * "docs/architecture/audit.md" 命中 "docs/architecture"；
 * "tests/x.test.mjs" 命中 "tests"；
 * "docs/rules/x.md" 不命中（它必须进包）。
 *
 * 逐级前缀而不是只比顶层名或整条路径：只比顶层名时 "docs/architecture"
 * 这种二级目录永远匹配不上；只比整条路径时目录条目本身能不能被排除
 * 就取决于调用顺序。逐级前缀两种情形都对。
 */
function isExcludedDirPath(rel) {
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    if (CONTENT_EXCLUDE_DIRS.has(parts.slice(0, i).join("/"))) return true;
  }
  return false;
}

function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = relative(root, abs).split(sep).join("/");
    if (EXCLUDE_DIRS.has(name)) { excluded.push({ path: rel, reason: "目录在排除清单" }); continue; }
    if (EXCLUDE_NAMES.has(name)) { excluded.push({ path: rel, reason: "系统文件" }); continue; }
    // 发布包的内容清单（按路径）：治理文档、变更历史、内部架构记录与本仓门禁用例
    // 不属于「使用者运行 harness 所需的那一层」。
    // 排除在**目录条目**这一层就生效——walk 遇到 "docs/architecture" 就不再递归，
    // 里面的文件自然一个都不进包。
    if (isExcludedDirPath(rel)) {
      excluded.push({ path: rel, reason: "不在发布包内容清单内" });
      continue;
    }
    if (CONTENT_EXCLUDE_FILES.has(rel)) { excluded.push({ path: rel, reason: "不在发布包内容清单内" }); continue; }
    if (CONTENT_EXCLUDE_PATHS.has(rel)) { excluded.push({ path: rel, reason: "独立通用工具，不在生产主链上" }); continue; }
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) { excluded.push({ path: rel, reason: "软连接不打包" }); continue; }
    if (st.isDirectory()) { walk(abs); continue; }
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      excluded.push({ path: rel, reason: `扩展名 ${ext || "（无）"} 不在平台白名单` });
      continue;
    }
    included.push({ abs, rel, size: st.size });
  }
}
walk(root);
// 分发包用 README.package.md 作为 README.md：仓库 README 链接到大量治理文档，
// 这些文档不在包内（体积/定位原因），直接分发会产生一片死链。
const packageReadme = join(root, "README.package.md");
if (existsSync(packageReadme)) {
  included.push({ abs: packageReadme, rel: "README.md", size: statSync(packageReadme).size });
}
included.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

// fail-closed：先校验，后产出
const totalBytes = included.reduce((n, f) => n + f.size, 0);
const violations = [];
if (included.length > MAX_FILES) violations.push(`文件数 ${included.length} 超过上限 ${MAX_FILES}`);
const oversized = included.filter((f) => f.size > MAX_FILE_BYTES);
if (oversized.length) violations.push(`${oversized.length} 个文件超过单文件上限 1MB：${oversized.map((f) => f.rel).join(", ")}`);
if (!included.some((f) => f.rel.toLowerCase() === "skill.md")) violations.push("包内缺少 SKILL.md");

// 体积闸：按**真实请求体**估计（与 publish 脚本同一套算法，见 scripts/lib/package-limits.mjs）。
// 这里估的是请求体，不是文件字节和——两者差十几 KB，按后者判会放过一个发布必失败的包。
//
// 估算必须用**写盘后的字节**：package.json 在包内会被改写（去掉指向包外文件的 script），
// 用源文件大小算会与发布期的真实 body 有差值——发布脚本会用真实长度对账，不等即拒发。
const plannedFiles = included.map((f) => ({
  rel: f.rel,
  bytes: f.rel === "package.json"
    ? Buffer.byteLength(renderPackageJson(readFileSync(f.abs, "utf8")), "utf-8")
    : f.size,
}));
const skillMeta = parseSkillFrontmatter(readFileSync(join(root, "SKILL.md"), "utf8"));
const changelogText = readChangelogForVersion(root, skillMeta.version, extractChangelog);
const bodyCheck = checkPackageBodySize(plannedFiles, skillMeta, changelogText);
if (!bodyCheck.ok) {
  violations.push(
    `请求体估计 ${bodyCheck.bytes} 字节（${(bodyCheck.bytes / 1024).toFixed(1)} KB）超过发布闸 ` +
      `${bodyCheck.limit} 字节（${(bodyCheck.limit / 1024).toFixed(0)} KB）`,
  );
}
if (violations.length) {
  console.error("拒绝产出——包不满足平台协议约束：");
  for (const v of violations) console.error(`  · ${v}`);
  console.error(`  （文件字节和 ${totalBytes}，${included.length} 个文件；请求体另含 multipart 头与 changelog 字段）`);
  process.exit(1);
}

// 包内链接自检：随包分发的 .md 若指向**包内不存在**的文件，就是死链。
// 在写盘前用「计划清单」判定 —— 失败即 fail-closed，绝不产出带死链的包。
//
// 为什么必须有：排除清单（治理文档 / 独立通用工具）会移走文件，
// 而被移走的文件常常被别人用链接指着。仓库内的死链由 tests/docs-links.test.mjs 管，
// 但**包内**的死链没人管——它只在分发后才暴露，而那时已经无法 fail-closed。
const planned = new Set(included.map((f) => f.rel));
planned.add("README.md"); // README.package.md 以 README.md 的形态入包
const deadLinks = [];
for (const f of included) {
  if (!f.rel.toLowerCase().endsWith(".md")) continue;
  const text = readFileSync(f.abs, "utf8");
  const base = dirname(f.rel);
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const link = m[1];
    if (/^(https?:|mailto:|#)/u.test(link)) continue;
    const target = link.split("#")[0];
    if (!target) continue;
    const rel = join(base, target).split(sep).join("/");
    if (!planned.has(rel) && !planned.has(`${rel}/`)) deadLinks.push(`${f.rel} → ${link}`);
  }
}
if (deadLinks.length) {
  console.error("拒绝产出——包内存在死链：");
  for (const d of deadLinks) console.error(`  · ${d}`);
  process.exit(1);
}

// 幂等：整体重建
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
const files = [];
for (const f of included) {
  const dest = join(outDir, f.rel);
  mkdirSync(join(dest, ".."), { recursive: true });
  if (f.rel === "package.json") {
    writeFileSync(dest, renderPackageJson(readFileSync(f.abs, "utf8")));
  } else {
    writeFileSync(dest, readFileSync(f.abs));
  }
  files.push({ path: f.rel, bytes: statSync(dest).size, sha256: sha256File(dest) });
}

const manifest = {
  protocol: "iflytek/skillhub docs/07-skill-protocol.md §8.3",
  slug: "zwhyperframes-harness",
  fileCount: files.length,
  totalBytes,
  // 请求体口径：打包期的门禁判的是它，发布期用真实 body 复核（两者必须相等）。
  estimatedBodyBytes: bodyCheck.bytes,
  limits: {
    maxFiles: MAX_FILES,
    maxBodyBytes: bodyCheck.limit,
    maxFileBytes: MAX_FILE_BYTES,
    serverMaxBodyBytes: SERVER_MAX_BODY_BYTES,
  },
  files,
  excluded,
};
// 清单写到包目录**之外**（与包目录同级）：它是关于包的元数据，不是包的内容——
// 放进包里会让包多带一份自指的文件，也会与 publish 时的文件收集重叠。
const manifestPath = join(dirname(outDir), `${basename(outDir)}.manifest.json`);
writeJson(manifestPath, manifest);

console.log(`产出目录：${outDir}`);
console.log(`清单：${manifestPath}`);
console.log(`纳入 ${files.length} 个文件，合计 ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`排除 ${excluded.length} 个文件：`);
for (const e of excluded) console.log(`  · ${e.path} —— ${e.reason}`);
