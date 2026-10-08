#!/usr/bin/env node
// gate.mjs — 轻量门禁（管理层，官方 check/lint 的包装与前置事实校验）
//   verify              锁稿/TTS/注入绑定哈希同源（fail-closed）
//   authorized          段开始授权存在
//   final-look          段 final look 授权存在（渲染授权）；**内含官方 check --strict，不可绕过**
//   pitch-round         BRIEF.md 的 `## Intent` 胜出概念非空（官方采样门产物）
//   animation-map       本段 composition 的 animation-map.json 产物存在
//   check               官方 hyperframes check --strict 包装（含 lint）
//   mp4                 段 MP4 存在/非空/时长合理/哈希绑定一致
//   next-segment        前序段已接受（段间交接）
//   master-inputs       全部段 accepted + MP4 哈希与状态一致
//   layout-guard        帧画面静态守卫：可见字号 ≥28px（1920×1080 基准）
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256File, readState, segmentEntry, resolveSegmentDir, readJsonIfPresent, runHf, CONTROL_DIR,
  INJECTION_BINDING_SCHEMA_VERSION,
} from "./lib/harness.mjs";

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
  const scriptPath = join(segmentDir, "user_script.txt");
  if (!existsSync(scriptPath)) fail("缺少 user_script.txt");
  const textSha = sha256File(scriptPath);
  const manifest = readJsonIfPresent(join(segmentDir, "segment-manifest.json"));
  if (!manifest || manifest.user_script_sha256 !== textSha) fail("段落稿与 segment-manifest 哈希漂移");
  // 段级冻结为准：本段文本必须等于当前锁稿的该段行区间（他段改字不影响本段）。
  const lockedPath = join(resolve(get("project") ?? "."), CONTROL_DIR, "锁定口播稿.md");
  const lockedLines = readFileSync(lockedPath, "utf8").split("\n");
  const [start, end] = entry.lines;
  const expected = lockedLines.slice(start - 1, end).join("\n").trim();
  const actual = readFileSync(scriptPath, "utf8").trim();
  if (actual !== expected) fail("本段文本与当前锁稿该段行区间不一致（本段改字必须重跑 TTS）");
  const binding = readJsonIfPresent(join(segmentDir, "audio", "tts-binding.json"));
  if (binding) {
    if (binding.text_sha256 !== textSha) fail("TTS 绑定文本哈希漂移（段文本改字必须重跑 TTS）");
    for (const [key, file] of [["audio_sha256", "narration.mp3"], ["titles_sha256", "narration.titles"], ["manifest_sha256", "narration.manifest.json"]]) {
      const path = join(segmentDir, "audio", file);
      if (!existsSync(path) || binding[key] !== sha256File(path)) fail(`TTS 产物与绑定漂移：${file}`);
    }
  }
  const injection = readJsonIfPresent(join(segmentDir, "audio", "injection-binding.json"));
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
  if (!entry.approvals?.start) fail(`段 ${entry.id} 缺少用户「开始授权」`);
  pass(`段 ${entry.id} 已获开始授权`);
}

function runFinalLook() {
  const { entry, segmentDir } = requireSegment();
  if (!entry.approvals?.final_look) fail(`段 ${entry.id} 缺少用户「final look 渲染授权」`);
  // 渲染授权**不得**绕过官方 check --strict。
  // 此前 `check` 是与 `final-look` 互不调用的独立命令，规则文档写「渲染授权前必须
  // 带 --strict 通过」，但实际可以先拿授权再补跑、甚至不跑。强制点必须落在授权这一环。
  const r = runHf(["check", "--strict"], { cwd: segmentDir });
  if (r.status !== 0) {
    fail(`段 ${entry.id}：官方 check --strict 未通过，final look 授权无效：\n${r.stdout}\n${r.stderr}`);
  }
  pass(`段 ${entry.id} 已获 final look 授权（且官方 check --strict 通过）`);
}

// §3 第 1 项：pitch-round 采样门。官方合同（skills/hyperframes/references/pitch-round.md）
// 写明胜出概念落在 BRIEF.md 的 `## Intent` 下，且 brief-format.md 确认该小节存在。
// 故本门禁只校验该产物**非空**——不判断概念好坏，那属于人工/复审。
function runPitchRound() {
  const projectRoot = resolve(get("project") ?? ".");
  const briefPath = join(projectRoot, "BRIEF.md");
  if (!existsSync(briefPath)) {
    fail("缺少 BRIEF.md（官方 Step 0：intent 层锁定的简报）");
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
  pass(`animation-map 产物存在（${found}）`);
}

function runCheck() {
  const { segmentDir } = requireSegment();
  const r = runHf(["check", "--strict"], { cwd: segmentDir });
  if (r.status !== 0) fail(`官方 check --strict 未通过：\n${r.stdout}\n${r.stderr}`);
  pass("官方 check --strict 通过（含 lint）");
}

function runMp4() {
  const { entry, segmentDir } = requireSegment();
  const mp4 = entry.mp4?.path ?? join(segmentDir, "renders", "video.mp4");
  if (!existsSync(mp4)) fail(`缺少 MP4：${mp4}`);
  const size = readFileSync(mp4).length;
  if (size === 0) fail(`MP4 为空：${mp4}`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8" });
  const duration = Number(probe.stdout.trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) fail(`MP4 时长探测失败：${mp4}`);
  if (entry.mp4 && entry.mp4.sha256 !== sha256File(mp4)) fail("MP4 与状态绑定哈希漂移（需重新 set-mp4）");
  pass(`MP4 有效（${duration.toFixed(2)}s）`);
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
  if (!state.segments.length) fail("项目无段落");
  const last = state.segments.at(-1);
  for (const seg of state.segments) {
    const isLast = seg === last;
    const ok = isLast
      ? (seg.status === "rendered" || seg.status === "accepted") && seg.mp4 && seg.approvals?.final_look
      : seg.status === "accepted" && seg.mp4;
    if (!ok) fail(`段 ${seg.id} 未满足拼接条件（${isLast ? "末段需 rendered + final look 授权" : "需 accepted"}）`);
    if (!existsSync(seg.mp4.path)) fail(`段 ${seg.id} MP4 缺失：${seg.mp4.path}`);
    if (seg.mp4.sha256 !== sha256File(seg.mp4.path)) fail(`段 ${seg.id} MP4 哈希漂移`);
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
  const violations = [];
  for (const file of files) {
    const source = readFileSync(join(framesDir, file), "utf8");
    for (const match of source.matchAll(/font-size:\s*([\d.]+)(px|cqw)/gu)) {
      const value = Number(match[1]);
      const px = match[2] === "px" ? value : value * 19.2; // 1920 宽基准
      if (px < MIN_PX) violations.push(`${file}: font-size ${match[0].split(":")[1].trim()} ≈ ${px.toFixed(1)}px`);
    }
  }
  if (violations.length) fail(`可见字号低于 ${MIN_PX}px：\n${violations.join("\n")}`);
  pass(`帧内可见字号均 ≥ ${MIN_PX}px（${files.length} 帧）`);
}

try {
  if (command === "verify") runVerify();
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
      "用法: gate.mjs verify|authorized|final-look|pitch-round|animation-map|check|mp4|next-segment|master-inputs|layout-guard\n" +
      "      --project <项目根> [--segment <NN>] [--out <animation-map 输出目录>]",
    );
    process.exit(2);
  }
} catch (error) {
  console.error(`gate.mjs 失败：${error.message}`);
  process.exit(1);
}
