#!/usr/bin/env node
// publish-skillhub.mjs — 把本仓发布到 SkillHub（gzip 压缩的请求体）
//
// 为什么不用 `skillhub publish` 直接发布：
//   它的文件收集直接作用于仓库根（不走本仓的打包准入与内容清单），且没有体积闸门。
//   本脚本改为走 build-skill-package.mjs 的产物——那是本仓唯一的打包实现，
//   按平台准入规则与发布包内容清单过滤，并对每个约束 fail-closed 校验。
//
// 关于压缩：服务端**不接受** Content-Encoding: gzip 的请求体——实测带该头的
// multipart 会在表单解析阶段返回 400「解析表单失败: multipart: NextPart: EOF」
//（未压缩时能正常到达鉴权阶段，故可判定问题在编码而非体积）。
// 体积上限只能用**内容取舍**来满足，不能靠压缩。
//
// 关于体积上限的实测：服务端对 publish 请求体有约 476KB 的实际上限
// （协议文档 §8.3 写的是 ≤10MB，文档与线上部署不一致——与本仓此前发现的
// 「.jpg 列入白名单但线上拒收」属同一类问题）。475KB 可通过、480KB 被断开。
// 故本脚本设 460KB 的安全上限并 fail-closed：宁可明确报错，也不让服务端
// 静默断连（客户端侧只看到 Broken pipe，没有任何可读信息）。
//
// 字段与文件收集规则与 SkillHub CLI（skills_store_cli.py 的
// parse_skill_md_frontmatter / _collect_skill_files / _post_publish_multipart）保持一致。
//
// 凭据只从本机 SkillHub CLI 的凭据文件读取（~/.skillhub/credentials.json 的 user 节点），
// 不入仓、不入日志、不进环境变量。
//
// 用法：node scripts/publish-skillhub.mjs [--root <源目录>] [--changelog <文本或文件路径>] [--dry-run]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, lstatSync, rmSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname, basename, extname, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import https from "node:https";
import { extractChangelog } from "./lib/changelog.mjs";

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── 参数 ─────────────────────────────────────────────────────────────────
let changelog = "";
let dryRun = false;
let sourceRoot = HARNESS_ROOT;
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === "--changelog") { changelog = process.argv[i + 1] ?? ""; i += 1; }
  else if (arg.startsWith("--changelog=")) changelog = arg.slice("--changelog=".length);
  else if (arg === "--root") { sourceRoot = resolve(process.argv[i + 1] ?? "."); i += 1; }
  else if (arg.startsWith("--root=")) sourceRoot = resolve(arg.slice("--root=".length));
  else if (arg === "--dry-run") dryRun = true;
  else { console.error(`未知参数: ${arg}`); process.exit(2); }
}

// ── 打包（复用本仓唯一的打包实现） ───────────────────────────────────────
// 产物落在系统临时目录而非仓库内：包内不应包含上一次打包的产物，
// 也不该在工作区留下未忽略的构建物。
const PKG_DIR = join(tmpdir(), `skillhub-pkg-${process.pid}`);
process.on("exit", () => rmSync(PKG_DIR, { recursive: true, force: true }));
const build = spawnSync("node", [join(HARNESS_ROOT, "scripts", "build-skill-package.mjs"), "--root", sourceRoot, "--out", PKG_DIR], {
  encoding: "utf8",
});
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(1);
}
const buildSummary = (build.stdout || "").split("\n").filter((l) => l.includes("纳入")).join(" ");
console.log(`[publish] ${buildSummary}`);

// ── frontmatter 解析（与 CLI 一致：仅 key: value 与 key: [a, b]） ────────
function parseFrontmatter(md) {
  const text = readFileSync(md, "utf-8");
  if (!text.startsWith("---")) throw new Error("SKILL.md 缺少 front matter（首行需为 ---）");
  const parts = text.split("\n");
  const end = parts.findIndex((line, idx) => idx > 0 && line.trim() === "---");
  if (end < 0) throw new Error("SKILL.md front matter 缺少结束标记 ---");
  const out = {};
  for (const raw of parts.slice(1, end)) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      out[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      out[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

const meta = parseFrontmatter(join(PKG_DIR, "SKILL.md"));
for (const field of ["slug", "version", "displayName"]) {
  if (!meta[field]) throw new Error(`SKILL.md 缺少 ${field}`);
}
if (!/^[a-z0-9][a-z0-9-]{1,127}$/.test(meta.slug)) throw new Error(`slug 不合法: ${meta.slug}`);
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(meta.version)) throw new Error(`version 不是合法 SemVer: ${meta.version}`);

// ── 文件收集（与 CLI 一致：排除常见目录/后缀，跳过软链） ─────────────────
const EXCLUDE_DIRS = new Set([".git", ".idea", ".vscode", "node_modules", "__pycache__", "vendor", ".astro", ".astron"]);
const EXCLUDE_SUFFIX = [".pyc", ".DS_Store", "Thumbs.db"];

function collect(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(name)) continue;
      collect(abs, acc);
    } else {
      if (EXCLUDE_SUFFIX.some((suf) => name.endsWith(suf))) continue;
      acc.push({ rel: relative(PKG_DIR, abs).split(sep).join("/"), bytes: readFileSync(abs) });
    }
  }
  return acc;
}
const files = collect(PKG_DIR);
if (!files.some((f) => f.rel.toLowerCase() === "skill.md")) throw new Error("包内缺少 SKILL.md");
files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

// ── changelog：参数给了路径就读文件，否则取 CHANGELOG 的对应节 ──────────
if (changelog && existsSync(changelog)) changelog = readFileSync(changelog, "utf-8");
if (!changelog) {
  const clPath = join(sourceRoot, "CHANGELOG.md");
  if (existsSync(clPath)) {
    changelog = extractChangelog(readFileSync(clPath, "utf-8"), meta.version);
  }
  // CHANGELOG 缺失时不失败——它只是发布说明的来源，不是发布的必要条件。
}

const payload = {
  slug: meta.slug,
  version: meta.version,
  displayName: meta.displayName,
  summary: meta.summary ?? "",
  description: meta.description ?? "",
  tags: Array.isArray(meta.tags) ? meta.tags : [],
  license: meta.license ?? "",
  homepage: meta.homepage ?? "",
  changelog,
};

// ── changelog 提取 ───────────────────────────────────────────────────────
// 按行扫描，不用多行正则——理由见 scripts/lib/changelog.mjs 的注释。
// 该缺陷曾让本脚本上传的 changelog 恒为空（平台显示默认文案 "Initial release"）。

// ── multipart 构造（字段与 CLI 的 _post_publish_multipart 一致） ──────────
const boundary = `----skillhubBoundary${Date.now()}`;
const chunks = [];
const addPart = (name, data, { filename, ctype } = {}) => {
  let head = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"`;
  if (filename) head += `; filename="${filename}"`;
  head += "\r\n";
  chunks.push(Buffer.from(head, "utf-8"));
  chunks.push(Buffer.from(`Content-Type: ${ctype || "application/octet-stream"}\r\n\r\n`, "utf-8"));
  chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8"));
  chunks.push(Buffer.from("\r\n", "utf-8"));
};
addPart("payload", JSON.stringify(payload), { ctype: "application/json" });
for (const f of files) {
  addPart("files", f.bytes, { filename: f.rel, ctype: f.rel.toLowerCase().endsWith(".md") ? "text/markdown" : "application/octet-stream" });
}
chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf-8"));
const body = Buffer.concat(chunks);

// fail-closed：请求体必须在服务端实测上限之内（见文件头）。超限时不发请求——
// 让服务端断开连接只会得到一个没有可读信息的 Broken pipe。
const MAX_BODY_BYTES = 460 * 1024;
console.log(`[publish] ${files.length} 个文件，请求体 ${(body.length / 1024).toFixed(1)} KB（上限 ${(MAX_BODY_BYTES / 1024).toFixed(0)} KB）`);
if (body.length > MAX_BODY_BYTES) {
  console.error(`拒绝上传——请求体 ${(body.length / 1024).toFixed(1)} KB 超过服务端实测上限 ${(MAX_BODY_BYTES / 1024).toFixed(0)} KB。`);
  console.error("服务端不接受 gzip 压缩的请求体，体积只能靠缩减发布包内容清单来满足。");
  process.exit(1);
}

if (dryRun) {
  console.log(`[publish] changelog ${changelog.length} 字符${changelog ? `：${changelog.slice(0, 80).replace(/\n/g, " ")}…` : "（空）"}`);
  console.log(`✓ Dry-run passed: ${meta.slug}@${meta.version}`);
  process.exit(0);
}

// ── 凭据（只从本机 CLI 凭据文件读，不打印） ──────────────────────────────
const CRED_PATH = join(homedir(), ".skillhub", "credentials.json");
if (!existsSync(CRED_PATH)) {
  console.error(`未找到 SkillHub 凭据：${CRED_PATH}（先运行 skillhub login --key skh_xxx）`);
  process.exit(1);
}
const cred = JSON.parse(readFileSync(CRED_PATH, "utf-8")).user ?? {};
const token = String(cred.token ?? "").trim();
const host = String(cred.host ?? process.env.SKILLHUB_API_BASE ?? "").trim();
if (!token) { console.error("凭据中缺少 token"); process.exit(1); }
if (!host) { console.error("凭据中缺少 host"); process.exit(1); }

// ── 上传 ─────────────────────────────────────────────────────────────────
const url = new URL("/api/v1/community/skills/publish", host);
const req = https.request(
  {
    method: "POST",
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
      Accept: "application/json",
      "User-Agent": `zwhyperframes-harness/${meta.version} (skillhub-publish)`,
    },
    timeout: 180000,
  },
  (res) => {
    const bufs = [];
    res.on("data", (c) => bufs.push(c));
    res.on("end", () => {
      const text = Buffer.concat(bufs).toString("utf-8");
      console.log(`[publish] HTTP ${res.statusCode}`);
      let parsed = {};
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 1024) }; }
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`✓ Published: skillId=${parsed.skillId ?? "?"} status=${parsed.status ?? "?"}`);
        if (parsed.publicUrl) console.log(`  url: ${parsed.publicUrl}`);
      } else {
        console.error(`发布失败：${parsed.error ?? parsed.message ?? text.slice(0, 500)}`);
        process.exit(1);
      }
    });
  },
);
req.on("timeout", () => { req.destroy(new Error("请求超时")); });
req.on("error", (e) => { console.error(`[publish] 网络错误: ${e.message}`); process.exit(1); });
req.write(body);
req.end();
