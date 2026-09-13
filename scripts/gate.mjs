#!/usr/bin/env node
// gate.mjs — 轻量门禁（管理层，官方 check/lint 的包装与前置事实校验）
//   verify              锁稿/TTS/注入绑定哈希同源（fail-closed）
//   authorized          段开始授权存在
//   final-look          段 final look 授权存在（渲染授权）
//   check               官方 hyperframes check --strict 包装（含 lint）
//   mp4                 段 MP4 存在/非空/时长合理/哈希绑定一致
//   next-segment        前序段已接受（段间交接）
//   master-inputs       全部段 accepted + MP4 哈希与状态一致
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  sha256File, readState, segmentEntry, resolveSegmentDir, readJsonIfPresent, runHf,
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
  if (manifest.locked_script_sha256 !== state.locked_script.sha256) fail("锁稿哈希与项目状态漂移");
  const binding = readJsonIfPresent(join(segmentDir, "audio", "tts-binding.json"));
  if (binding && binding.text_sha256 !== textSha) fail("TTS 绑定文本哈希漂移（段文本改字必须重跑 TTS）");
  const injection = readJsonIfPresent(join(segmentDir, "audio", "injection-binding.json"));
  if (injection) {
    if (injection.text_sha256 !== textSha) fail("音频注入绑定文本哈希漂移");
    const metaPath = join(segmentDir, "audio_meta.json");
    if (!existsSync(metaPath) || injection.audio_meta_sha256 !== sha256File(metaPath)) fail("audio_meta.json 与注入绑定漂移");
  }
  pass(`段 ${entry.id} 输入同源（锁稿/TTS/注入绑定一致）`);
}

function runAuthorized() {
  const { entry } = requireSegment();
  if (!entry.approvals?.start) fail(`段 ${entry.id} 缺少用户「开始授权」`);
  pass(`段 ${entry.id} 已获开始授权`);
}

function runFinalLook() {
  const { entry } = requireSegment();
  if (!entry.approvals?.final_look) fail(`段 ${entry.id} 缺少用户「final look 渲染授权」`);
  pass(`段 ${entry.id} 已获 final look 授权`);
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
  for (const seg of state.segments) {
    if (seg.status !== "accepted" || !seg.mp4) fail(`段 ${seg.id} 未接受或无 MP4 绑定`);
    if (!existsSync(seg.mp4.path)) fail(`段 ${seg.id} MP4 缺失：${seg.mp4.path}`);
    if (seg.mp4.sha256 !== sha256File(seg.mp4.path)) fail(`段 ${seg.id} MP4 哈希漂移`);
  }
  pass("master 输入齐备（全部段 accepted + MP4 哈希一致）");
}

try {
  if (command === "verify") runVerify();
  else if (command === "authorized") runAuthorized();
  else if (command === "final-look") runFinalLook();
  else if (command === "check") runCheck();
  else if (command === "mp4") runMp4();
  else if (command === "next-segment") runNextSegment();
  else if (command === "master-inputs") runMasterInputs();
  else {
    console.error("用法: gate.mjs verify|authorized|final-look|check|mp4|next-segment|master-inputs --project <项目根> [--segment <NN>]");
    process.exit(2);
  }
} catch (error) {
  console.error(`gate.mjs 失败：${error.message}`);
  process.exit(1);
}
