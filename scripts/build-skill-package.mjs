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
const EXCLUDE_DIRS = new Set([".git", ".github", ".idea", ".vscode", "node_modules", "vendor", ".skillhub-pkg", "__pycache__", ".astro", ".astron"]);
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
const CONTENT_EXCLUDE_FILES = new Set([
  "CHANGELOG.md", "CHANGELOG.en.md",
  "README.en.md",
  "CONTRIBUTING.md", "CONTRIBUTING.en.md",
  "SECURITY.md", "SECURITY.en.md",
  "CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT.en.md",
  "package-manifest.json",
]);

// 平台协议 §8.3 体积与数量上限
const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 1 * 1024 * 1024;

const root = resolve(get("root") ?? "..");
const outDir = resolve(get("out") ?? join(root, ".skillhub-pkg"));
if (get("root") === undefined && get("out") === undefined) {
  throw new Error("必须显式指定 --root 与 --out，不设默认值以免误打包整个仓库");
}
if (!existsSync(join(root, "SKILL.md"))) {
  throw new Error(`根目录缺少 SKILL.md：${root}`);
}

const included = [];
const excluded = [];

function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const rel = relative(root, abs).split(sep).join("/");
    if (EXCLUDE_DIRS.has(name)) { excluded.push({ path: rel, reason: "目录在排除清单" }); continue; }
    if (EXCLUDE_NAMES.has(name)) { excluded.push({ path: rel, reason: "系统文件" }); continue; }
    // 发布包的内容清单（按路径）：治理文档、变更历史、内部架构记录与本仓门禁用例
    // 不属于「使用者运行 harness 所需的那一层」。
    const top = rel.split("/")[0];
    if (CONTENT_EXCLUDE_DIRS.has(top) || CONTENT_EXCLUDE_DIRS.has(rel)) {
      excluded.push({ path: rel, reason: "不在发布包内容清单内" });
      continue;
    }
    if (CONTENT_EXCLUDE_FILES.has(rel)) { excluded.push({ path: rel, reason: "不在发布包内容清单内" }); continue; }
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
included.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

// fail-closed：先校验，后产出
const totalBytes = included.reduce((n, f) => n + f.size, 0);
const violations = [];
if (included.length > MAX_FILES) violations.push(`文件数 ${included.length} 超过上限 ${MAX_FILES}`);
if (totalBytes > MAX_TOTAL_BYTES) violations.push(`总包 ${totalBytes} 字节超过上限 ${MAX_TOTAL_BYTES}`);
const oversized = included.filter((f) => f.size > MAX_FILE_BYTES);
if (oversized.length) violations.push(`${oversized.length} 个文件超过单文件上限 1MB：${oversized.map((f) => f.rel).join(", ")}`);
if (!included.some((f) => f.rel.toLowerCase() === "skill.md")) violations.push("包内缺少 SKILL.md");
if (violations.length) {
  console.error("拒绝产出——包不满足平台协议约束：");
  for (const v of violations) console.error(`  · ${v}`);
  process.exit(1);
}

// 幂等：整体重建
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
const files = [];
for (const f of included) {
  const dest = join(outDir, f.rel);
  mkdirSync(join(dest, ".."), { recursive: true });
  writeFileSync(dest, readFileSync(f.abs));
  files.push({ path: f.rel, bytes: f.size, sha256: sha256File(dest) });
}

const manifest = {
  protocol: "iflytek/skillhub docs/07-skill-protocol.md §8.3",
  slug: "zwhyperframes-harness",
  fileCount: files.length,
  totalBytes,
  limits: { maxFiles: MAX_FILES, maxTotalBytes: MAX_TOTAL_BYTES, maxFileBytes: MAX_FILE_BYTES },
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
