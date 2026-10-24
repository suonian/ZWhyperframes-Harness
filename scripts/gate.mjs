#!/usr/bin/env node
// gate.mjs — 轻量门禁（管理层，官方 check/lint 的包装与前置事实校验）
//   verify              锁稿/TTS/注入绑定哈希同源（默认严格；--allow-missing 用于早期阶段）
//   preflight           final look 前置：verify/captions/animation-map/layout/check，并写 receipt
//   authorized          段开始授权存在
//   final-look          段 final look 授权存在（渲染授权）；**内含官方 check --strict，不可绕过**
//   pitch-round         BRIEF.md 的 `## Intent` 胜出概念非空（官方采样门产物）
//   animation-map       本段 composition 的 animation-map.json 产物存在
//   check               官方 hyperframes check --strict 包装（含 lint）
//   mp4                 段 MP4 存在/非空/时长合理/哈希绑定一致
//   next-segment        前序段已接受（段间交接）
//   master-inputs       全部段 accepted + MP4 哈希与状态一致
//   layout-guard        帧画面静态守卫：可见字号 ≥28px（1920×1080 基准）
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256File, readState, segmentEntry, resolveSegmentDir, readJsonIfPresent, runHf, CONTROL_DIR,
  INJECTION_BINDING_SCHEMA_VERSION, HARNESS_ROOT, writeJson, sha256Text, isUserApproval,
} from "./lib/harness.mjs";
import { readStoryboard } from "./lib/storyboard.mjs";
import { validateMasterInputs } from "./lib/master-inputs.mjs";

const args = process.argv.slice(2);
const command = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

function pass(message) {
  console.log(`[gate] ✓ ${message}`);
}
function fail(message) {
  console.error(`[gate] ✗ ${message}`);
  process.exit(1);
}

function requireSegment() {
  const projectRoot = resolve(get("project") ?? ".");
  const segment = get("segment");
  if (!segment) throw new Error("需要 --segment <NN>");
  const state = readState(projectRoot);
  const entry = segmentEntry(state, segment);
  return { projectRoot, state, entry, segmentDir: resolveSegmentDir(projectRoot, segment) };
}

function runVerify() {
  const { state, entry, segmentDir } = requireSegment();
  // 默认严格：证据缺失/损坏即失败。早期阶段（尚未生成音频）可显式 --allow-missing。
  const requireBindings = !args.includes("--allow-missing");
  const scriptPath = join(segmentDir, "user_script.txt");
  if (!existsSync(scriptPath)) fail("缺少 user_script.txt");
  const textSha = sha256File(scriptPath);
  const manifest = readJsonIfPresent(join(segmentDir, "segment-manifest.json"));
  if (!manifest || manifest.user_script_sha256 !== textSha) fail("段落稿与 segment-manifest 哈希漂移");
  if (JSON.stringify(manifest.lines) !== JSON.stringify(entry.lines)) fail("segment-manifest 行区间与 state 不一致");
  if (manifest.locked_script_sha256 && manifest.locked_script_sha256 !== state.locked_script?.sha256) {
    fail("segment-manifest 的锁稿哈希与 state 不一致");
  }
  // 段级冻结为准：本段文本必须等于当前锁稿的该段行区间（他段改字不影响本段）。
  const lockedPath = join(resolve(get("project") ?? "."), state.locked_script?.path ?? `${CONTROL_DIR}/锁定口播稿.md`);
  if (!existsSync(lockedPath)) fail(`缺少锁定口播稿：${lockedPath}`);
  if (state.locked_script?.sha256 && sha256File(lockedPath) !== state.locked_script.sha256) {
    fail("锁定口播稿全文哈希与 state 不一致（锁稿在 init 后被改动）");
  }
  const lockedLines = readFileSync(lockedPath, "utf8").split("\n");
  const [start, end] = entry.lines;
  const expected = lockedLines.slice(start - 1, end).join("\n").trim();
  const actual = readFileSync(scriptPath, "utf8").trim();
  if (actual !== expected) fail("本段文本与当前锁稿该段行区间不一致（本段改字必须重跑 TTS）");
  const bindingPath = join(segmentDir, "audio", "tts-binding.json");
  const binding = readJsonIfPresent(bindingPath);
  if (requireBindings) {
    if (!existsSync(bindingPath)) fail("缺少 audio/tts-binding.json（严格 verify；早期阶段请显式 --allow-missing）");
    if (!binding) fail("audio/tts-binding.json 无法解析");
  }
  if (binding) {
    if (binding.text_sha256 !== textSha) fail("TTS 绑定文本哈希漂移（段文本改字必须重跑 TTS）");
    for (const [key, file] of [["audio_sha256", "narration.mp3"], ["titles_sha256", "narration.titles"], ["manifest_sha256", "narration.manifest.json"]]) {
      const path = join(segmentDir, "audio", file);
      if (!existsSync(path) || binding[key] !== sha256File(path)) fail(`TTS 产物与绑定漂移：${file}`);
    }
  }
  const injectionPath = join(segmentDir, "audio", "injection-binding.json");
  const injection = readJsonIfPresent(injectionPath);
  if (requireBindings) {
    if (!existsSync(injectionPath)) fail("缺少 audio/injection-binding.json（严格 verify；早期阶段请显式 --allow-missing）");
    if (!injection) fail("audio/injection-binding.json 无法解析");
  }
  if (injection) {
    // 历史 schema（2026-09-14 前生产）缺 sync 绑定字段。这里**不得**用当前文件补算哈希来"修复"：
    // 那等于伪造一个生产当时从未验证过的绑定。唯一正解是重跑 inject 重新派生。
    const injectionSchema = Number(injection.schema_version ?? 1);
    if (injectionSchema < INJECTION_BINDING_SCHEMA_VERSION) {
      fail(
        `段 ${entry.id} 注入绑定为历史 schema v${injectionSchema}（缺 storyboard_sha256 / frame_durations 的 sync 绑定）；` +
        "禁止事后补哈希伪造证据。请重跑 `node scripts/inject-audio-meta.mjs --segment <段目录>` 重新派生绑定",
      );
    }
    if (injection.text_sha256 !== textSha) fail("音频注入绑定文本哈希漂移");
    const metaPath = join(segmentDir, "audio_meta.json");
    const neutralPath = join(segmentDir, "audio_engine_meta.json");
    if (!existsSync(metaPath) || injection.audio_meta_sha256 !== sha256File(metaPath)) fail("audio_meta.json 与注入绑定漂移");
    if (!existsSync(neutralPath) || injection.neutral_sha256 !== sha256File(neutralPath)) fail("audio_engine_meta.json 与注入绑定漂移");
    const storyboardPath = join(segmentDir, "STORYBOARD.md");
    if (!existsSync(storyboardPath) || injection.storyboard_sha256 !== sha256File(storyboardPath)) fail("STORYBOARD.md 与 sync-durations 注入绑定漂移");
    const storyboard = readFileSync(storyboardPath, "utf8");
    const durations = [...storyboard.matchAll(/^- duration:\s*(.+?)\s*$/gmu)].map((match) => match[1]);
    if (JSON.stringify(injection.frame_durations?.map((frame) => frame.duration)) !== JSON.stringify(durations)) fail("STORYBOARD 帧顺序/时长与注入绑定不一致");
    for (const [key, file] of [["audio_sha256", "narration.mp3"], ["titles_sha256", "narration.titles"]]) {
      const path = join(segmentDir, "audio", file);
      if (!existsSync(path) || injection[key] !== sha256File(path)) fail(`注入输入与绑定漂移：${file}`);
    }
  }
  pass(`段 ${entry.id} 输入同源（段级锁稿/TTS/注入绑定一致）`);
}

function runAuthorized() {
  const { entry } = requireSegment();
  if (!isUserApproval(entry.approvals?.start)) fail(`段 ${entry.id} 缺少合法的用户「开始授权」`);
  pass(`段 ${entry.id} 已获开始授权`);
}

function runCaptionsVerify(segmentDir) {
  const script = join(HARNESS_ROOT, "scripts", "captions-zh.mjs");
  const r = spawnSync(process.execPath, [script, "verify", "--segment", segmentDir], {
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
  });
  if (r.status !== 0) {
    fail(`captions-zh verify 未通过（字幕分组必须由本仓脚本确定性复算）：\n${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  }
}

function buildFinalLookReceipt({ entry, segmentDir }) {
  const framesDir = join(segmentDir, "compositions", "frames");
  const frames = existsSync(framesDir)
    ? readdirSync(framesDir).filter((f) => f.endsWith(".html")).sort()
    : [];
  const fileHash = (relative) => {
    const path = join(segmentDir, relative);
    return existsSync(path) ? sha256File(path) : null;
  };
  return {
    version: 1,
    segment: String(entry.id),
    checks: ["frames", "index", "verify", "captions", "animation-map", "layout", "check"],
    frame_count: frames.length,
    frames_sha256: sha256Text(frames.map((f) => `${f}:${sha256File(join(framesDir, f))}`).join("\n")),
    hashes: {
      storyboard: fileHash("STORYBOARD.md"),
      audio_meta: fileHash("audio_meta.json"),
      injection_binding: fileHash("audio/injection-binding.json"),
      caption_groups: fileHash("caption_groups.json"),
      captions_html: fileHash("compositions/captions.html"),
      animation_map: fileHash(".hyperframes/anim-map/animation-map.json"),
      index: fileHash("index.html"),
    },
  };
}

function runPreflight() {
  const { entry, segmentDir } = requireSegment();
  if (!isUserApproval(entry.approvals?.start)) fail(`段 ${entry.id} 缺少合法的用户「开始授权」`);
  const framesDir = join(segmentDir, "compositions", "frames");
  const frames = existsSync(framesDir) ? readdirSync(framesDir).filter((f) => f.endsWith(".html")) : [];
  if (!frames.length) fail("final look 前置检查：compositions/frames 没有帧文件");
  if (!existsSync(join(segmentDir, "index.html"))) fail("final look 前置检查：缺少 index.html");
  if (!existsSync(join(segmentDir, "audio_meta.json"))) fail("final look 前置检查：缺少 audio_meta.json");
  if (!existsSync(join(segmentDir, "audio", "injection-binding.json"))) fail("final look 前置检查：缺少 audio/injection-binding.json");
  if (!existsSync(join(segmentDir, "caption_groups.json"))) fail("final look 前置检查：缺少 caption_groups.json");
  if (!existsSync(join(segmentDir, "compositions", "captions.html"))) fail("final look 前置检查：缺少 compositions/captions.html");

  runVerify();
  runCaptionsVerify(segmentDir);
  runAnimationMap();
  runLayoutGuard();
  runCheck();

  const receipt = buildFinalLookReceipt({ entry, segmentDir });
  const receiptPath = join(segmentDir, ".hyperframes", "final-look-receipt.json");
  writeJson(receiptPath, receipt);
  pass(`段 ${entry.id} final look 前置检查全部通过（receipt ${sha256File(receiptPath).slice(0, 12)}…）`);
}

function runFinalLook() {
  const { entry, segmentDir } = requireSegment();
  if (!isUserApproval(entry.approvals?.final_look)) fail(`段 ${entry.id} 缺少合法的用户「final look 渲染授权」`);
  runPreflight();
  const receiptPath = join(segmentDir, ".hyperframes", "final-look-receipt.json");
  const expected = entry.approvals.final_look.gate_receipt?.sha256;
  if (!expected) fail("final look 授权缺少 gate receipt；旧授权请重新执行 state approve --kind final-look 派生");
  if (sha256File(receiptPath) !== expected) fail("final look 授权绑定的 gate receipt 与当前产物不一致（产物已变化，请重新授权）");
  pass(`段 ${entry.id} 已获 final look 授权（verify/captions/animation-map/layout/check 全部通过，receipt 绑定一致）`);
}

// §3 第 1 项：pitch-round 采样门。官方合同（skills/hyperframes/references/pitch-round.md）
// 写明胜出概念落在 BRIEF.md 的 `## Intent` 下，且 brief-format.md 确认该小节存在。
// 故本门禁只校验该产物**非空**——不判断概念好坏，那属于人工/复审。
function runPitchRound() {
  const projectRoot = resolve(get("project") ?? ".");
  const segment = get("segment");
  let briefPath = join(projectRoot, "BRIEF.md");
  if (segment) {
    const segmentBrief = join(resolveSegmentDir(projectRoot, segment), "BRIEF.md");
    if (existsSync(segmentBrief)) briefPath = segmentBrief;
  }
  if (!existsSync(briefPath)) {
    fail(`缺少 BRIEF.md（官方 Step 0：intent 层锁定的简报；查找 ${briefPath}）`);
  }
  const lines = readFileSync(briefPath, "utf8").split("\n");
  const start = lines.findIndex((line) => /^##\s+Intent\s*$/u.test(line));
  if (start < 0) fail("BRIEF.md 缺少 `## Intent`（pitch-round 胜出概念的落点）");
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/u.test(lines[i])) break;
    body.push(lines[i]);
  }
  if (!body.join("\n").trim()) {
    fail("BRIEF.md 的 `## Intent` 为空——pitch-round 必须留下胜出概念");
  }
  pass(`pitch-round 有据可查（BRIEF.md \`## Intent\` 非空，${body.join(" ").trim().length} 字符）`);
}

// §3 第 5 项：animation-map。官方脚本 skills/hyperframes-animation/scripts/animation-map.mjs
// 默认把产物写到 <composition>/.hyperframes/anim-map/animation-map.json。
// 注意：官方每个 composition 产出**一个** animation-map.json（覆盖全时间线），
// 不是"每页一个"——原规则表述不准确，此处按官方实际契约校验。
function runAnimationMap() {
  const { segmentDir } = requireSegment();
  const custom = get("out");
  const candidates = custom
    ? [join(resolve(custom), "animation-map.json")]
    : [join(segmentDir, ".hyperframes", "anim-map", "animation-map.json")];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    fail(`缺少 animation-map.json（预期 ${candidates.join(" 或 ")}；官方脚本 animation-map.mjs 的产物）`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(found, "utf8"));
  } catch {
    fail(`animation-map.json 无法解析：${found}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    fail(`animation-map.json 为空或形状非法：${found}`);
  }
  pass(`animation-map 产物存在且非空（${found}）`);
}

function runCheck() {
  const { segmentDir } = requireSegment();
  // 同时把字幕带以下 17% 作为 keep-out 交给官方 layout 检查；视觉规则书 §2 的安全边界。
  const r = runHf(["check", "--strict", "--timeout=30000", "--caption-zone=x0=0;y0=.83;x1=1;y1=1"], { cwd: segmentDir });
  if (r.status !== 0) fail(`官方 check --strict 未通过：\n${r.stdout}\n${r.stderr}`);
  pass("官方 check --strict 通过（含 lint + 字幕带 keep-out）");
}

function runMp4() {
  const { entry, segmentDir } = requireSegment();
  if (!entry.mp4?.path) fail(`段 ${entry.id} 未绑定 MP4；先运行 state.mjs set-mp4`);
  const mp4 = entry.mp4.path;
  if (!existsSync(mp4)) fail(`缺少 MP4：${mp4}`);
  if (statSync(mp4).size === 0) fail(`MP4 为空：${mp4}`);
  if (entry.mp4.sha256 !== sha256File(mp4)) fail("MP4 与状态绑定哈希漂移（需重新 set-mp4）");
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8", timeout: 10 * 60 * 1000 });
  const duration = Number(probe.stdout.trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) fail(`MP4 时长探测失败：${mp4}`);
  const board = readStoryboard(segmentDir);
  const expected = board.frames
    .map((frame) => Number.parseFloat(String(frame.meta.duration ?? "").replace(/s$/u, "")))
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((sum, n) => sum + n, 0);
  if (expected > 0 && Math.abs(duration - expected) > 1) {
    fail(`MP4 时长 ${duration.toFixed(2)}s 与 STORYBOARD 总时长 ${expected.toFixed(2)}s 不一致`);
  }
  pass(`MP4 有效（${duration.toFixed(2)}s，哈希与状态一致）`);
}

function runNextSegment() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const segment = get("segment");
  const idx = state.segments.findIndex((s) => String(s.id) === String(segment) || s.dir === String(segment));
  if (idx < 0) fail(`段 ${segment} 不在项目中`);
  for (const prior of state.segments.slice(0, idx)) {
    if (prior.status !== "accepted") fail(`前序段 ${prior.id} 尚未接受（${prior.status}）`);
  }
  pass("前序段落全部已接受");
}

function runMasterInputs() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  try {
    validateMasterInputs(state);
  } catch (error) {
    fail(error.message);
  }
  pass("master 输入齐备（前序段 accepted + 末段 rendered/final-look + MP4 哈希一致）");
}

function runLayoutGuard() {
  const { segmentDir } = requireSegment();
  const framesDir = join(segmentDir, "compositions", "frames");
  if (!existsSync(framesDir)) fail("缺少 compositions/frames 目录");
  const files = readdirSync(framesDir).filter((f) => f.endsWith(".html")).sort();
  if (!files.length) fail("没有帧文件");
  const MIN_PX = 28;
  let width = 1920;
  try {
    const board = readStoryboard(segmentDir);
    const m = /^(\d+)\s*[x×]\s*(\d+)$/u.exec(String(board.globals.format ?? "").trim());
    if (m) width = Number(m[1]);
  } catch {
    // 没有 STORYBOARD 时沿用 1920 基准；final-look 另外要求 STORYBOARD/注入绑定存在。
  }
  const violations = [];
  const parsePx = (raw) => {
    let value = String(raw).trim().replace(/\s*!important\s*$/iu, "").trim();
    const clamp = /^clamp\(([^,]+),/iu.exec(value);
    if (clamp) value = clamp[1].trim();
    const m = /^(-?[\d.]+)\s*(px|cqw|vw|rem|em)\b/iu.exec(value);
    if (!m) return null;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === "px") return n;
    if (unit === "cqw" || unit === "vw") return (n * width) / 100;
    return n * 16; // rem/em：按 16px 根字号保守估算
  };
  for (const file of files) {
    const source = readFileSync(join(framesDir, file), "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const match of source.matchAll(/font-size\s*:\s*([^;}"']+)/giu)) {
      const raw = match[1].trim();
      const px = parsePx(raw);
      if (px == null) {
        violations.push(`${file}: 无法静态判定 font-size: ${raw}`);
      } else if (px < MIN_PX) {
        violations.push(`${file}: font-size ${raw} ≈ ${px.toFixed(1)}px（宽度基准 ${width}px）`);
      }
    }
  }
  if (violations.length) fail(`可见字号低于 ${MIN_PX}px 或无法判定：\n${violations.join("\n")}`);
  pass(`帧内可见字号均 ≥ ${MIN_PX}px（${files.length} 帧，宽度基准 ${width}px）`);
}

try {
  if (command === "verify") runVerify();
  else if (command === "preflight") runPreflight();
  else if (command === "layout-guard") runLayoutGuard();
  else if (command === "authorized") runAuthorized();
  else if (command === "final-look") runFinalLook();
  else if (command === "pitch-round") runPitchRound();
  else if (command === "animation-map") runAnimationMap();
  else if (command === "check") runCheck();
  else if (command === "mp4") runMp4();
  else if (command === "next-segment") runNextSegment();
  else if (command === "master-inputs") runMasterInputs();
  else {
    console.error(
      "用法: gate.mjs verify|preflight|authorized|final-look|pitch-round|animation-map|check|mp4|next-segment|master-inputs|layout-guard\n" +
      "      --project <项目根> [--segment <NN>] [--out <animation-map 输出目录>]",
    );
    process.exit(2);
  }
} catch (error) {
  console.error(`gate.mjs 失败：${error.message}`);
  process.exit(1);
}
