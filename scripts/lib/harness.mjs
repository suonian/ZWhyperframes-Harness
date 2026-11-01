import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, renameSync, chmodSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * 产品根目录：默认 `~/Documents/ZWhyperframes-products`。
 *
 * Windows 上「文档」常被 OneDrive 重定向（Known Folder 的 Personal 变成
 * %USERPROFILE%\OneDrive\文档），此时 homedir()/Documents 指向的是**另一个**目录：
 * 要么项目被写到用户看不见的地方，要么被「项目必须在产品根内」的守卫拦下。
 * 这里按 Known Folder 读真实路径；读不到、或该目录不存在，就回落到 homedir()/Documents。
 */
function defaultProductsRoot() {
  const fallback = join(homedir(), "Documents", "ZWhyperframes-products");
  if (process.platform !== "win32") return fallback;
  const r = spawnSync(
    "reg",
    ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"],
    { encoding: "utf8", timeout: 10_000 },
  );
  if (r.status !== 0) return fallback;
  const m = (r.stdout ?? "").match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/u);
  if (!m) return fallback;
  const docs = m[1].trim().replace(/%USERPROFILE%/gu, homedir()).replace(/[\\/]+$/u, "");
  if (!docs || !existsSync(docs)) return fallback;
  return join(docs, "ZWhyperframes-products");
}

export const PRODUCTS_ROOT_DEFAULT = defaultProductsRoot();
export const CONTROL_DIR = "00-项目总控";
export const MASTER_DIR = "99-最终合成";
export const MASTER_RENDERS_DIR = join(MASTER_DIR, "renders");
export const STATE_VERSION = 1;
export const HF_EXPECTED_VERSION = "0.8.36";
// 注入绑定 schema：v2 起记录 storyboard_sha256 / frame_durations（sync-durations 后 STORYBOARD 的事实指纹）。
// v1（2026-09-14 前生产）缺这两项，属历史格式，**不得事后补哈希伪造绑定**，只能重跑 inject 重新派生。
export const INJECTION_BINDING_SCHEMA_VERSION = 2;
export const HARNESS_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 当前 harness 的可追溯身份：版本、git commit、是否 dirty。 */
export function harnessIdentity() {
  let version = "unknown";
  try {
    version = JSON.parse(readFileSync(join(HARNESS_ROOT, "package.json"), "utf8")).version ?? version;
  } catch {
    // 包元数据缺失不应阻塞生产；but dirty/commit 仍记录。
  }
  const git = (args) => spawnSync("git", ["-C", HARNESS_ROOT, ...args], { encoding: "utf8", timeout: 10_000 });
  const head = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--porcelain"]);
  return {
    version,
    commit: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

/**
 * 解析 harness 锁定的 HyperFrames CLI 真实入口（包内 .mjs）。
 *
 * 为什么不用 node_modules/.bin/hyperframes：
 *   Linux/macOS 上它是指向包内 .mjs 的符号链接，`node <bin>` 可以直接执行；
 *   Windows 上 npm 无法创建符号链接（core.symlinks=false），只能生成 POSIX sh
 *   包装脚本（#!/bin/sh + basedir=...），node 会把 shell 语法当 JS 解析并抛
 *   SyntaxError: missing ) after argument list。
 *   故统一解析到包内真实入口；入口路径从包的 package.json 的 bin 字段取，
 *   不写死版本化的相对路径（上游改名时这里会显式失败，而不是运行到一半才炸）。
 */
export function hfCliEntry() {
  const pkgDir = join(HARNESS_ROOT, "node_modules", "hyperframes");
  try {
    const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.hyperframes;
    return bin ? join(pkgDir, bin) : null;
  } catch {
    return null;
  }
}

/** 运行 harness 本地锁定的 HyperFrames CLI（唯一入口，禁止全局 hyperframes）。 */
export function runHf(args, { cwd, env = {} } = {}) {
  const bin = hfCliEntry();
  if (!bin) {
    // 缺依赖时给出可执行的提示，而不是让调用方拿到一段 spawn 错误。
    return {
      status: 1,
      stdout: "",
      stderr: "HyperFrames CLI 未安装（node_modules/hyperframes 缺失或缺少 bin 字段）；先运行 ./scripts/bootstrap.sh",
    };
  }
  const result = spawnSync("node", [bin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 15 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return result;
}

export function assertHfVersion() {
  const r = runHf(["--version"]);
  const actual = String(r.stdout ?? "").trim();
  if (r.status !== 0 || actual !== HF_EXPECTED_VERSION) {
    throw new Error(`HF CLI 版本不匹配：期望 ${HF_EXPECTED_VERSION}，实际 ${actual || "未找到"}。先运行 ./scripts/bootstrap.sh`);
  }
}

/**
 * 探测媒体时长（秒）。
 *
 * 为什么收口到这里：spawnSync 在**外部命令不存在**时返回 status=null、stdout=undefined，
 * 直接读 stdout.trim() 会抛 "TypeError: Cannot read properties of undefined"——
 * 把「ffprobe 没装/不在 PATH」伪装成代码 bug。Windows 上 ffmpeg 需手工安装并入 PATH，
 * 这是首次运行最常见的失败点，错误信息必须直指原因。
 *
 * 返回 {ok:true, seconds} 或 {ok:false, reason}：调用方各自的失败处理方式不同
 * （有的 throw、有的记门禁失败），由调用方决定怎么表达。
 */
export function probeDurationSeconds(path) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8", timeout: 10 * 60 * 1000 },
  );
  if (r.error) {
    return { ok: false, reason: `无法运行 ffprobe（未安装或不在 PATH）：${r.error.code ?? ""} ${r.error.message ?? ""}`.trim() };
  }
  if (r.status !== 0) {
    return { ok: false, reason: `ffprobe 探测失败（退出码 ${r.status}）：${(r.stderr ?? "").trim()}` };
  }
  const seconds = Number((r.stdout ?? "").trim());
  if (!Number.isFinite(seconds)) return { ok: false, reason: `ffprobe 未返回有效时长：${path}` };
  return { ok: true, seconds };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * 原子替换目标文件（Windows 安全）。
 *
 * POSIX 的 rename() 无条件替换目标；Windows 的 MoveFileEx 带 REPLACE_EXISTING 时，
 * **目标带只读属性会直接 EPERM**（实测：`EPERM: operation not permitted, rename ...`）。
 * 本仓的产物（state.json、绑定 JSON、final.mp4）可能来自只读介质、或被复制成只读，
 * 直接 rename 会把一次正常写入变成硬崩。
 *
 * 这里只在第一次 rename 命中 EPERM/EACCES 时才去掉只读属性再试一次；
 * 其他错误码原样抛出（不吞错、不伪装成功）。
 */
export function replaceFileSync(tmpPath, targetPath) {
  try {
    renameSync(tmpPath, targetPath);
    return;
  } catch (error) {
    const code = error?.code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
  }
  try {
    chmodSync(targetPath, 0o666);
  } catch {
    // 目标不存在或改不动——留给下面的 rename 自己报错，信息更准。
  }
  renameSync(tmpPath, targetPath);
}

export function writeJson(path, value) {
  const dir = resolve(path, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  replaceFileSync(tmp, path);
}

// ── final-look receipt 的绑定契约（唯一真源） ─────────────────────────────
// receipt 是「preflight 验证过的那份字节」的凭证：它把渲染要读的全部产物
// 逐个钉在哈希上。写 receipt（buildFinalLookReceipt）与复核 receipt
// （gate render-ready）必须用**同一张表**，否则复核会漏项或错配。
//
// 为什么必须有「复核」这一步：preflight 只在授权那一刻跑一次，而渲染发生在
// 授权**之后**。中间任何一次改写（官方 Studio preview 会重写
// compositions/captions.html 与 index.html）都会让渲染用的字节 ≠ 验证过的字节，
// 而当时没有任何机器检查会拦住它。render-ready 就是那道检查。
export const RECEIPT_BINDINGS = {
  storyboard: "STORYBOARD.md",
  audio_meta: "audio_meta.json",
  injection_binding: "audio/injection-binding.json",
  caption_groups: "caption_groups.json",
  captions_html: "compositions/captions.html",
  animation_map: ".hyperframes/anim-map/animation-map.json",
  index: "index.html",
};

// 目录型绑定：渲染**逐帧读取**的语音切片与字体。它们的路径写在 index.html 与
// 帧的 @font-face 里，不进任何单文件绑定——不单独钉住，替换一个 wav 或改一个
// woff2 就换掉了画面/声音，而 preflight 察觉不到。目录不存在时记 null（由调用方判）。
//
// bgm / sfx 同样在渲染读取路径上：官方 assemble-index.mjs 会把
// `assets/bgm/x.mp3` 与 `assets/sfx/x.mp3` 写进 index.html 的媒体表。
// 漏掉它们 = 换掉配乐或音效不会触发任何门禁。
export const RECEIPT_DIR_BINDINGS = {
  voice: "assets/voice",
  fonts: "assets/fonts",
  bgm: "assets/bgm",
  sfx: "assets/sfx",
};

// 资产目录里的 OS 噪音文件：macOS 的 .DS_Store、Windows 的 Thumbs.db。
// **除它们之外一律纳入摘要**：用扩展名白名单会漏掉未知扩展名（.ogg/.aiff/…），
// 而渲染可能照样读它——那是漏检，不是稳健。denylist 是封闭集合，误伤面有界。
const ASSET_DIR_NOISE = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

/** 目录 → 逐文件哈希聚合（按文件名排序；排除 OS 噪音，其余全部纳入）。 */
export function dirDigest(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !ASSET_DIR_NOISE.has(e.name))
    .map((e) => e.name)
    .sort();
  return {
    count: files.length,
    digest: sha256Text(files.map((f) => `${f}:${sha256File(join(dir, f))}`).join("\n")),
  };
}

/** 段目录 → receipt 绑定的逐项哈希（文件缺失记为 null，由调用方判 fail-closed）。 */
export function receiptBindingHashes(segmentDir) {
  const out = {};
  for (const [key, rel] of Object.entries(RECEIPT_BINDINGS)) {
    const path = join(segmentDir, rel);
    out[key] = existsSync(path) ? sha256File(path) : null;
  }
  return out;
}

/** 段目录 → 目录型绑定（语音/字体/BGM/音效）的聚合摘要。 */
export function receiptDirBindingDigests(segmentDir) {
  const out = {};
  for (const [key, rel] of Object.entries(RECEIPT_DIR_BINDINGS)) {
    const d = dirDigest(join(segmentDir, rel));
    out[key] = d ? d.digest : null;
  }
  return out;
}

/** 段目录 → 帧集合聚合哈希（帧文件名 + 逐文件哈希，按文件名排序）。 */
export function framesDigest(framesDir) {
  if (!existsSync(framesDir)) return { count: 0, digest: sha256Text("") };
  const files = readdirSync(framesDir).filter((f) => f.endsWith(".html")).sort();
  const digest = sha256Text(files.map((f) => `${f}:${sha256File(join(framesDir, f))}`).join("\n"));
  return { count: files.length, digest };
}

/** 从任意路径向上定位项目根（含 00-项目总控/state.json）。 */
export function findProjectRoot(startPath) {
  let current = resolve(startPath);
  if (existsSync(current) && statSync(current).isFile()) current = resolve(current, "..");
  while (true) {
    if (existsSync(join(current, CONTROL_DIR, "state.json"))) return current;
    const parent = resolve(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

/** 项目根 → 段目录（段 id 或段目录路径均可）。 */
export function resolveSegmentDir(projectRoot, segment) {
  const root = resolve(projectRoot);
  const candidate = resolve(segment);
  const rel = relative(root, candidate);
  if (rel !== "" && !rel.startsWith("..") && existsSync(join(candidate, "hyperframes.json"))) return candidate;
  const state = readState(root);
  const entry = state.segments.find((s) => s.id === String(segment) || s.dir === String(segment));
  if (!entry) throw new Error(`无法在项目状态中定位段落：${segment}`);
  return join(root, entry.dir);
}

export function readState(projectRoot) {
  const path = join(resolve(projectRoot), CONTROL_DIR, "state.json");
  if (!existsSync(path)) throw new Error(`缺少项目状态文件：${path}`);
  const state = JSON.parse(readFileSync(path, "utf8"));
  if (state.version !== STATE_VERSION) throw new Error(`state.json 版本不匹配：期望 ${STATE_VERSION}，实际 ${state.version}`);
  return state;
}

export function writeState(projectRoot, state) {
  if (state.version !== STATE_VERSION) throw new Error(`state.json 版本不匹配：${state.version}`);
  writeJson(join(resolve(projectRoot), CONTROL_DIR, "state.json"), state);
}

export function segmentEntry(state, segment) {
  const entry = state.segments.find((s) => s.id === String(segment) || s.dir === String(segment));
  if (!entry) throw new Error(`项目状态中缺少段落：${segment}`);
  return entry;
}

/** 规范化文本：去空白与标点，用于与 MiniMax pronounce_text 对齐。 */
export function normalizeText(text) {
  return String(text ?? "")
    .replace(/[\s\u3000]+/gu, "")
    .replace(/[。！？，、；：""''（）《》…—·,.!?;:'"()\[\]{}]/gu, "");
}

export function nowIso() {
  return new Date().toISOString();
}

/** 授权记录的形状校验：truthy 的 true/字符串不算授权。 */
export function isUserApproval(value) {
  return Boolean(value && typeof value === "object" && value.actor === "user" && typeof value.at === "string" && value.at);
}

export function listProjectSegmentDirs(projectRoot) {
  const root = resolve(projectRoot);
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{2}-/u.test(e.name))
    .map((e) => e.name)
    .sort();
}
