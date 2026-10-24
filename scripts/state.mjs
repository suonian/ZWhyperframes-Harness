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
import { sha256File, readState, writeState, segmentEntry, resolveSegmentDir, nowIso, HARNESS_ROOT, isUserApproval } from "./lib/harness.mjs";

const args = process.argv.slice(2);
const command = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

function approvalRecord(kind, evidence, extra = {}) {
  const text = String(evidence ?? "").trim();
  if (!text) throw new Error("授权必须提供非空的 --evidence（产物或预览证据）");
  return { actor: "user", kind, at: nowIso(), evidence: text, ...extra };
}

function runFinalLookPreflight(projectRoot, segment) {
  const gate = join(HARNESS_ROOT, "scripts", "gate.mjs");
  const r = spawnSync(process.execPath, [gate, "preflight", "--project", projectRoot, "--segment", String(segment)], {
    encoding: "utf8",
    timeout: 30 * 60 * 1000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`final look 前置检查未通过，拒绝写入授权：\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  }
  const segmentDir = resolveSegmentDir(projectRoot, segment);
  const receiptPath = join(segmentDir, ".hyperframes", "final-look-receipt.json");
  if (!existsSync(receiptPath)) throw new Error(`final look 前置检查未留下 receipt：${receiptPath}`);
  return { path: receiptPath, sha256: sha256File(receiptPath) };
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
  if (state.master?.closed || state.master?.approvals?.close || state.master?.approvals?.final_look) {
    throw new Error("master 已批准或项目已收尾，不能再写入段授权；如需返工请显式重置 master 审批");
  }
  const idx = state.segments.findIndex((s) => String(s.id) === String(segment) || s.dir === String(segment));
  if (idx < 0) throw new Error(`项目状态中缺少段落：${segment}`);
  const entry = state.segments[idx];
  if (kind === "final-look" && !isUserApproval(entry.approvals?.start)) throw new Error(`段 ${entry.id} 尚未开始授权，不能 final look`);
  entry.approvals = entry.approvals ?? {};
  if (kind === "start") {
    // 段间交接：本段开始授权同时确认上一段（上一段必须已有 MP4 + final look 授权）。
    if (idx > 0) {
      const prior = state.segments[idx - 1];
      if (!prior.mp4 || !isUserApproval(prior.approvals?.final_look)) {
        throw new Error(`前序段 ${prior.id} 无 MP4 或 final look 授权，不能开始段 ${entry.id}`);
      }
      if (!existsSync(prior.mp4.path) || prior.mp4.sha256 !== sha256File(prior.mp4.path)) {
        throw new Error(`前序段 ${prior.id} 的 MP4 缺失或哈希漂移，不能开始段 ${entry.id}`);
      }
      prior.status = "accepted";
    }
    entry.approvals.start = approvalRecord("start", evidence);
    entry.status = "authorized";
  } else {
    const receipt = runFinalLookPreflight(projectRoot, segment);
    entry.approvals.final_look = approvalRecord("final-look", evidence, { gate_receipt: receipt });
  }
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
  if (state.master?.closed || state.master?.approvals?.close) throw new Error("项目已收尾，不能替换段 MP4");
  if (state.master?.approvals?.final_look) throw new Error("master final look 已确认，不能替换段 MP4；如需返工请显式重置 master 审批");
  if (!isUserApproval(entry.approvals?.start)) throw new Error(`段 ${entry.id} 尚未开始授权，不能绑定 MP4`);
  const mp4 = resolve(mp4Path);
  if (!existsSync(mp4)) throw new Error(`MP4 不存在：${mp4}`);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", mp4], { encoding: "utf8", timeout: 10 * 60 * 1000 });
  const duration = Number(probe.stdout.trim());
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) throw new Error(`MP4 时长探测失败：${mp4}`);
  const segmentDir = resolveSegmentDir(projectRoot, segment);
  const storyboardPath = join(segmentDir, "STORYBOARD.md");
  if (existsSync(storyboardPath)) {
    const durations = [...readFileSync(storyboardPath, "utf8").matchAll(/^- duration:\s*(.+?)\s*$/gmu)]
      .map((match) => Number.parseFloat(String(match[1]).replace(/s$/u, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    const expected = durations.reduce((sum, n) => sum + n, 0);
    if (expected > 0 && Math.abs(duration - expected) > 1) {
      throw new Error(`MP4 时长 ${duration.toFixed(2)}s 与 STORYBOARD 总时长 ${expected.toFixed(2)}s 不一致`);
    }
  }
  if (entry.approvals?.final_look) {
    delete entry.approvals.final_look;
    entry.approvals.final_look_revoked_at = nowIso();
  }
  entry.mp4 = { path: mp4, sha256: sha256File(mp4), duration_s: +duration.toFixed(3), recorded_at: nowIso() };
  entry.status = "rendered";
  writeState(projectRoot, state);
  console.log(`段 ${entry.id} MP4 已绑定（${duration.toFixed(2)}s / ${entry.mp4.sha256.slice(0, 12)}…）`);
}

function runMaster() {
  const projectRoot = resolve(get("project") ?? ".");
  const state = readState(projectRoot);
  const kind = get("kind");
  const evidence = get("evidence");
  if (!["final-look", "close"].includes(kind)) throw new Error("master 需要 --kind final-look|close --evidence <证据>");
  if (state.master?.closed || state.master?.approvals?.close) throw new Error("项目已收尾，不能再次写入 master 审批");
  const key = kind === "final-look" ? "final_look" : "close";
  if (kind === "final-look") {
    if (!state.master.candidate) throw new Error("master final look 前必须先生成 candidate（finalize-master.mjs）");
    const candidate = state.master.candidate;
    if (!existsSync(candidate.path)) throw new Error(`master candidate 不存在：${candidate.path}`);
    if (candidate.sha256 !== sha256File(candidate.path)) throw new Error("master candidate 与状态绑定哈希漂移");
    // master final look 同时确认最后一段（交接语义与段间一致）。
    const last = state.segments.at(-1);
    if (!last?.mp4 || !isUserApproval(last.approvals?.final_look)) throw new Error(`末段 ${last?.id ?? "?"} 无 MP4 或 final look 授权，不能进入 master`);
    if (last.status !== "accepted") last.status = "accepted";
    state.master.status = "approved";
  }
  if (kind === "close") {
    if (!isUserApproval(state.master.approvals?.final_look)) throw new Error("收尾审批前必须完成 master final look");
    if (!state.master.candidate) throw new Error("收尾审批必须绑定 candidate");
    const candidate = state.master.candidate;
    if (!existsSync(candidate.path)) throw new Error(`master candidate 不存在：${candidate.path}`);
    if (candidate.sha256 !== sha256File(candidate.path)) throw new Error("master candidate 与状态绑定哈希漂移");
    const segmentIds = state.segments.map((segment) => segment.id);
    if (JSON.stringify(candidate.segments) !== JSON.stringify(segmentIds)) throw new Error("master candidate 段列表与当前项目不一致");
    if (!Array.isArray(candidate.inputs) || candidate.inputs.length !== state.segments.length) throw new Error("master candidate 缺少输入 MP4 快照");
    for (const [index, segment] of state.segments.entries()) {
      const input = candidate.inputs[index];
      if (input.index !== index || input.id !== segment.id || input.path !== segment.mp4?.path || input.sha256 !== segment.mp4?.sha256 || input.duration_s !== segment.mp4?.duration_s) throw new Error(`master candidate 输入快照与段 ${segment.id} 状态不一致`);
      if (!existsSync(input.path) || sha256File(input.path) !== input.sha256) throw new Error(`master candidate 输入 MP4 已变化：段 ${segment.id}`);
    }
  }
  state.master.approvals = state.master.approvals ?? {};
  const candidate = state.master.candidate;
  state.master.approvals[key] = approvalRecord(kind, evidence, candidate ? { candidate_sha256: candidate.sha256, candidate_path: candidate.path } : {});
  if (kind === "close") {
    state.master.closed = true;
    state.master.closed_at = nowIso();
    state.master.status = "closed";
  }
  writeState(projectRoot, state);
  console.log(`master ${kind} 已记录${candidate ? `（candidate ${candidate.sha256.slice(0, 12)}…）` : ""}`);
}

try {
  if (command === "show") runShow();
  else if (command === "approve") runApprove();
  else if (command === "set-mp4") runSetMp4();
  else if (command === "master") runMaster();
  else {
    console.error("用法: state.mjs show|approve|set-mp4|master --project <项目根> …");
    process.exit(2);
  }
} catch (error) {
  console.error(`state.mjs 失败：${error.message}`);
  process.exit(1);
}
