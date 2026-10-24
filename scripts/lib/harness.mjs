import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, renameSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PRODUCTS_ROOT_DEFAULT = join(homedir(), "Documents", "ZWhyperframes-products");
export const CONTROL_DIR = "00-项目总控";
export const MASTER_DIR = "99-最终合成";
export const STATE_VERSION = 1;
export const HF_EXPECTED_VERSION = "0.8.36";
// 注入绑定 schema：v2 起记录 storyboard_sha256 / frame_durations（sync-durations 后 STORYBOARD 的事实指纹）。
// v1（2026-09-14 前生产）缺这两项，属历史格式，**不得事后补哈希伪造绑定**，只能重跑 inject 重新派生。
export const INJECTION_BINDING_SCHEMA_VERSION = 2;
export const HARNESS_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** 运行 harness 本地锁定的 HyperFrames CLI（唯一入口，禁止全局 hyperframes）。 */
export function runHf(args, { cwd, env = {} } = {}) {
  const bin = join(HARNESS_ROOT, "node_modules", ".bin", "hyperframes");
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

export function writeJson(path, value) {
  const dir = resolve(path, "..");
  mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
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
