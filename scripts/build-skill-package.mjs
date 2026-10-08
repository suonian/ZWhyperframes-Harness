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
import { join, resolve, relative, extname, sep } from "node:path";
import { sha256File, writeJson } from "./lib/harness.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

// 平台协议 §8.3 文件类型白名单
const ALLOWED_EXT = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml",
  ".js", ".cjs", ".mjs", ".ts", ".py", ".sh",
  ".png", ".jpg", ".svg",
]);
// CLI 与协议共同排除的目录
const EXCLUDE_DIRS = new Set([".git", ".idea", ".vscode", "node_modules", "__pycache__", ".astro", ".astron"]);
const EXCLUDE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

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
    if (EXCLUDE_DIRS.has(name)) { excluded.push({ path: relative(root, abs), reason: "目录在排除清单" }); continue; }
    if (EXCLUDE_NAMES.has(name)) { excluded.push({ path: relative(root, abs), reason: "系统文件" }); continue; }
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) { excluded.push({ path: relative(root, abs), reason: "软连接不打包" }); continue; }
    if (st.isDirectory()) { walk(abs); continue; }
    const rel = relative(root, abs);
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      excluded.push({ path: rel, reason: `扩展名 ${ext || "（无）"} 不在平台白名单` });
      continue;
    }
    included.push({ abs, rel: rel.split(sep).join("/"), size: st.size });
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
writeJson(join(outDir, "package-manifest.json"), manifest);

console.log(`产出目录：${outDir}`);
console.log(`纳入 ${files.length} 个文件，合计 ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`排除 ${excluded.length} 个文件：`);
for (const e of excluded) console.log(`  · ${e.path} —— ${e.reason}`);
