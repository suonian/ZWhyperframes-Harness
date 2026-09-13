#!/usr/bin/env node
// state.mjs — 轻量生产状态（管理层）
//   授权与产物哈希的唯一写入入口；帧级状态以官方 STORYBOARD.md 为真源。
//   show                只读展示项目状态
//   approve --kind start|final-look    段落授权（actor=user）
//   set-mp4 --mp4 <路径>               段渲染产物绑定（SHA-256 + ffprobe 时长）
//   master --kind final-look|close     master 决策
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, readState, writeState, segmentEntry, resolveSegmentDir, nowIso } from "./lib/harness.mjs";

const args = process.argv.slice(2);
const command = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

function approvalRecord(kind, evidence) {
  if (!evidence) throw new Error("授权必须提供 --evidence（产物或预览证据）");
  return { actor: "user", kind, at: nowIso(), evidence: String(evidence).trim() };
}

function runShow() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  console.log(`项目 ${state.project_id}（锁稿 ${state.locked_script.line_count} 行 / sha ${state.locked_script.sha256.slice(0, 12)}…）`);
  for (const seg of state.segments) {
    const start = seg.approvals?.start ? "已授权" : "未授权";
    const look = seg.approvals?.final_look ? "final-look✓" : "final-look✗";
    const mp4 = seg.mp4 ? `mp4(${seg.mp4.duration_s}s)` : "无mp4";
    console.log(`  段 ${seg.id} ${seg.dir} 状态=${seg.status} ${start} ${look} ${mp4}`);
  }
  console.log(`  master: final-look=${state.master.approvals?.final_look ? "✓" : "✗"} close=${state.master.approvals?.close ? "✓" : "✗"} candidate=${state.master.candidate ? state.master.candidate.sha256.slice(0, 12) : "无"}`);
}

function runApprove() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const segment = get("segment");
  const kind = get("kind");
  const evidence = get("evidence");
  if (!segment || !["start", "final-look"].includes(kind)) throw new Error("approve 需要 --segment <NN> --kind start|final-look --evidence <证据>");
  const entry = segmentEntry(state, segment);
  if (kind === "final-look" && !entry.approvals?.start) throw new Error(`段 ${entry.id} 尚未开始授权，不能 final look`);
  entry.approvals = entry.approvals ?? {};
  entry.approvals[kind === "start" ? "start" : "final_look"] = approvalRecord(kind, evidence);
  if (kind === "start") entry.status = "authorized";
  writeState(projectRoot, state);
  console.log(`段 ${entry.id} ${kind} 授权已记录`);
}

function runSetMp4() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const segment = get("segment");
  const mp4Path = get("mp4");
  if (!segment || !mp4Path) throw new Error("set-mp4 需要 --segment <NN> --mp4 <路径>");
  const entry = segmentEntry(state, segment);
  const mp4 = resolve(mp4Path);
  if (!existsSync(mp4)) throw new Error(`MP4 不存在：${mp4}`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8" });
  const duration = Number(probe.stdout.trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) throw new Error(`MP4 时长探测失败：${mp4}`);
  entry.mp4 = { path: mp4, sha256: sha256File(mp4), duration_s: +duration.toFixed(3), recorded_at: nowIso() };
  entry.status = "rendered";
  writeState(projectRoot, state);
  console.log(`段 ${entry.id} MP4 已绑定（${duration.toFixed(2)}s / ${entry.mp4.sha256.slice(0, 12)}…）`);
}

function runAccept() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const segment = get("segment");
  const entry = segmentEntry(state, segment);
  if (!entry.mp4) throw new Error(`段 ${entry.id} 尚无 MP4 绑定`);
  if (!entry.approvals?.final_look) throw new Error(`段 ${entry.id} 尚无 final look 授权`);
  entry.status = "accepted";
  writeState(projectRoot, state);
  console.log(`段 ${entry.id} 已接受（${entry.mp4.sha256.slice(0, 12)}…）`);
}

function runMaster() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const kind = get("kind");
  const evidence = get("evidence");
  if (!["final-look", "close"].includes(kind)) throw new Error("master 需要 --kind final-look|close --evidence <证据>");
  const key = kind === "final-look" ? "final_look" : "close";
  state.master.approvals = state.master.approvals ?? {};
  state.master.approvals[key] = approvalRecord(kind, evidence);
  if (kind === "close" && !state.master.candidate) throw new Error("收尾审批必须绑定 candidate");
  writeState(projectRoot, state);
  console.log(`master ${kind} 已记录`);
}

try {
  if (command === "show") runShow();
  else if (command === "approve") runApprove();
  else if (command === "set-mp4") runSetMp4();
  else if (command === "accept") runAccept();
  else if (command === "master") runMaster();
  else {
    console.error("用法: state.mjs show|approve|set-mp4|accept|master --project <项目根> …");
    process.exit(2);
  }
} catch (error) {
  console.error(`state.mjs 失败：${error.message}`);
  process.exit(1);
}
