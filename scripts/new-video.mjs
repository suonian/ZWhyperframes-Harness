#!/usr/bin/env node
// new-video.mjs — 项目脚手架（管理层）
//   init    资料归档 + 锁定稿提取冻结 + 项目状态初始化（拒绝非空目录）
//   segment 按分段计划对单段执行官方 hyperframes init + 段骨架
// 分段计划（语义切分）由主智能体判断后写入 segment-plan.json；本脚本只校验与执行。
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, cpSync, statSync } from "node:fs";
import { join, resolve, relative, isAbsolute, basename } from "node:path";
import {
  PRODUCTS_ROOT_DEFAULT, CONTROL_DIR, MASTER_DIR, STATE_VERSION,
  sha256File, writeJson, readState, writeState, runHf, assertHfVersion, nowIso,
} from "./lib/harness.mjs";

const args = process.argv.slice(2);
const command = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (k) => args.includes(`--${k}`);

// ── 锁定稿提取：仅接受显式标记区段或整份独立稿 ──────────────────────────────
const SCRIPT_MARKERS = ["锁定口播稿", "口播稿", "生产口播稿"];
const SCRIPT_BLOCK = /(?:[\w-]+:script:(start|end))/iu;
const TEXT_FILE_RE = /\.(?:md|markdown|txt)$/iu;

function extractFromText(raw, label = "") {
  const lines = raw.split(/\r?\n/u);
  const blockStart = lines.findIndex((l) => SCRIPT_BLOCK.test(l) && /start/iu.test(l));
  if (blockStart >= 0) {
    const blockEnd = lines.findIndex((l, i) => i > blockStart && SCRIPT_BLOCK.test(l) && /end/iu.test(l));
    if (blockEnd < 0) throw new Error("资料包存在 script:start 但缺少 script:end");
    return `${lines.slice(blockStart + 1, blockEnd).join("\n").trim()}\n`;
  }
  const headingRe = /^#{1,4}\s*(.+?)\s*$/u;
  let inSection = false;
  const collected = [];
  for (const line of lines) {
    const m = headingRe.exec(line);
    if (m) {
      if (SCRIPT_MARKERS.some((marker) => m[1].includes(marker))) {
        inSection = true;
        continue;
      }
      if (inSection && collected.length) break;
      if (inSection && !collected.length) inSection = false;
    }
    if (inSection) collected.push(line);
  }
  const text = collected.join("\n").trim();
  if (!text) {
    throw new Error(`资料包中未找到锁定口播（需 "## 锁定口播稿" 等标题节或 locked-script:script:start/end 标记）${label ? `：${label}` : ""}`);
  }
  return `${text}\n`;
}

function listPackageTextFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listPackageTextFiles(full, out);
    else if (entry.isFile() && TEXT_FILE_RE.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function hasScriptBlock(raw) {
  return raw.split(/\r?\n/u).some((l) => SCRIPT_BLOCK.test(l) && /start/iu.test(l));
}

// 单文件资料包：保留「标题节或显式标记」两种约定。
// 目录资料包：只认显式 locked-script:script:start/end 标记（标题节匹配过松，易误取配套说明），且必须唯一命中。
function extractLockedScript(source) {
  if (!statSync(source).isDirectory()) {
    return extractFromText(readFileSync(source, "utf8"), source);
  }
  const marked = listPackageTextFiles(source).filter((file) => hasScriptBlock(readFileSync(file, "utf8")));
  if (marked.length === 1) return extractFromText(readFileSync(marked[0], "utf8"), marked[0]);
  if (marked.length > 1) {
    throw new Error(`资料包目录存在多个 script:start 标记文件，无法确定锁定口播：\n${marked.map((f) => `  ${f}`).join("\n")}`);
  }
  throw new Error(`资料包目录中未找到锁定口播（需在某个 .md/.txt 文件中使用 locked-script:script:start/end 标记）：${source}`);
}

// ── init ─────────────────────────────────────────────────────────────────────
function runInit() {
  const projectDir = resolve(get("project") ?? ".");
  const source = resolve(get("source") ?? "");
  const productsRoot = resolve(get("products-root") ?? PRODUCTS_ROOT_DEFAULT);
  if (!existsSync(source)) throw new Error(`来源不存在：${source}`);
  const rel = relative(productsRoot, projectDir);
  if ((rel === "" || rel.startsWith("..")) && !has("allow-outside-products-root")) {
    throw new Error(`项目必须位于产品根目录内：${productsRoot}`);
  }
  if (existsSync(projectDir) && readdirSync(projectDir).length > 0) {
    throw new Error(`目标目录非空，拒绝覆盖：${projectDir}`);
  }
  const controlDir = join(projectDir, CONTROL_DIR);
  mkdirSync(join(controlDir, "资料包"), { recursive: true });
  if (statSync(source).isDirectory()) {
    cpSync(source, join(controlDir, "资料包"), { recursive: true });
  } else {
    copyFileSync(source, join(controlDir, "资料包", basename(source)));
  }
  const lockedScript = extractLockedScript(source);
  const scriptPath = join(controlDir, "锁定口播稿.md");
  writeFileSync(scriptPath, lockedScript);
  mkdirSync(join(projectDir, MASTER_DIR, "candidates"), { recursive: true });
  writeJson(join(controlDir, "state.json"), {
    version: STATE_VERSION,
    project_id: basename(projectDir),
    products_root: productsRoot,
    locked_script: {
      path: `${CONTROL_DIR}/锁定口播稿.md`,
      sha256: sha256File(scriptPath),
      line_count: lockedScript.split("\n").length - 1,
    },
    segments: [],
    master: { approvals: {}, candidate: null },
    created_at: nowIso(),
  });
  console.log(`项目初始化完成：${projectDir}`);
  console.log("下一步：主智能体语义分段后写 00-项目总控/segment-plan.json，再执行 new-video.mjs segment");
}

// ── segment ──────────────────────────────────────────────────────────────────
function validateSegmentPlan(state, plan) {
  if (!Array.isArray(plan.segments) || !plan.segments.length) throw new Error("segment-plan.json 缺少 segments");
  const total = state.locked_script.line_count;
  let cursor = 1;
  for (const seg of plan.segments) {
    const [start, end] = seg.lines;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > total || start > end) {
      throw new Error(`段 ${seg.id} 行范围非法：${seg.lines}（锁稿共 ${total} 行）`);
    }
    if (start !== cursor) throw new Error(`段 ${seg.id} 行范围不连续：期望从 ${cursor} 开始，实际 ${start}`);
    cursor = end + 1;
  }
  if (cursor !== total + 1) throw new Error(`分段计划未覆盖锁稿全部 ${total} 行（覆盖到 ${cursor - 1}）`);
  return plan;
}

function runSegment() {
  assertHfVersion();
  const projectDir = resolve(get("project") ?? ".");
  const state = readState(projectDir);
  const planPath = resolve(get("plan") ?? join(projectDir, CONTROL_DIR, "segment-plan.json"));
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  const segmentId = get("id");
  validateSegmentPlan(state, plan);
  const seg = plan.segments.find((s) => String(s.id) === String(segmentId));
  if (!seg) throw new Error(`segment-plan 中缺少段 ${segmentId}`);
  if (state.segments.some((s) => String(s.id) === String(segmentId))) throw new Error(`段 ${segmentId} 已存在，不得重复脚手架`);
  if (typeof seg.dir !== "string" || !seg.dir || isAbsolute(seg.dir)) {
    throw new Error(`段 ${seg.id} 目录必须是项目根内的相对路径：${seg.dir}`);
  }
  const segDir = resolve(projectDir, seg.dir);
  const segRel = relative(projectDir, segDir);
  if (!segRel || segRel.startsWith("..") || isAbsolute(segRel)) {
    throw new Error(`段 ${seg.id} 目录必须位于项目根内：${seg.dir}`);
  }
  if (existsSync(segDir) && readdirSync(segDir).length > 0) throw new Error(`段目录非空，拒绝覆盖：${segDir}`);

  const init = runHf(["init", segDir, "--non-interactive", "--example=blank", "--skill=faceless-explainer"]);
  if (init.status !== 0 || !existsSync(join(segDir, "hyperframes.json"))) {
    throw new Error(`官方 init 失败：${init.stderr || init.stdout}`);
  }
  const scriptPath = join(projectDir, CONTROL_DIR, "锁定口播稿.md");
  const lines = readFileSync(scriptPath, "utf8").split("\n");
  const [start, end] = seg.lines;
  const segmentText = lines.slice(start - 1, end).join("\n").trim();
  const userScriptPath = join(segDir, "user_script.txt");
  writeFileSync(userScriptPath, `${segmentText}\n`);
  writeJson(join(segDir, "segment-manifest.json"), {
    segment_id: String(seg.id),
    dir: seg.dir,
    lines: seg.lines,
    title: seg.title ?? null,
    locked_script_sha256: state.locked_script.sha256,
    user_script_sha256: sha256File(userScriptPath),
    created_at: nowIso(),
  });
  state.segments.push({
    id: String(seg.id), dir: seg.dir, lines: seg.lines,
    status: "planned", approvals: {}, mp4: null,
    user_script_sha256: sha256File(userScriptPath),
  });
  writeState(projectDir, state);
  console.log(`段 ${seg.id} 脚手架完成：${segDir}`);
  console.log("下一步：主智能体写 BRIEF.md（官方 Step 0，init 之后）→ capture（Step 1）→ 官方 preset（Step 2）");
}

// ── main ─────────────────────────────────────────────────────────────────────
try {
  if (command === "init") runInit();
  else if (command === "segment") runSegment();
  else {
    console.error("用法: node new-video.mjs init --project <dir> --source <资料包文件或目录> [--products-root <dir>]");
    console.error("      node new-video.mjs segment --project <dir> --plan <segment-plan.json> --id <NN>");
    process.exit(2);
  }
} catch (error) {
  console.error(`new-video.mjs 失败：${error.message}`);
  process.exit(1);
}
