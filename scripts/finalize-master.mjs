#!/usr/bin/env node
// finalize-master.mjs — master 唯一官方拼接入口（管理层薄包装）
// 零信任：每个输入段 MP4 的 SHA-256 必须与项目状态绑定一致；concat 后写不可变 candidate。
// 不渲染、不混音、不调色；只是把已确认的段落 MP4 按 segment-plan 顺序无损拼接。
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, readState, writeState, MASTER_DIR, nowIso } from "./lib/harness.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const projectRoot = resolve(get("project") ?? ".");
const state = readState(projectRoot);

for (const seg of state.segments) {
  if (seg.status !== "accepted" || !seg.mp4) throw new Error(`段 ${seg.id} 未接受或无 MP4 绑定，拒绝拼接`);
  if (!existsSync(seg.mp4.path)) throw new Error(`段 ${seg.id} MP4 缺失：${seg.mp4.path}`);
  if (seg.mp4.sha256 !== sha256File(seg.mp4.path)) {
    throw new Error(`段 ${seg.id} MP4 与状态绑定哈希漂移；重新渲染并 state.mjs set-mp4`);
  }
}

const stamp = nowIso().replace(/[-:.]/gu, "").slice(0, 14);
const candidateDir = join(projectRoot, MASTER_DIR, "candidates");
mkdirSync(candidateDir, { recursive: true });
const candidatePath = join(candidateDir, `candidate-${stamp}.mp4`);
const listPath = join(candidateDir, "concat-list.txt");
writeFileSync(listPath, state.segments.map((seg) => `file '${seg.mp4.path.replaceAll("'", "'\\''")}'`).join("\n"));

const run = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", candidatePath], {
  encoding: "utf8",
  stdio: ["ignore", "ignore", "pipe"],
});
if (run.status !== 0 || !existsSync(candidatePath)) throw new Error(`ffmpeg concat 失败：${run.stderr ?? ""}`);

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", candidatePath], { encoding: "utf8" });
const duration = Number(probe.stdout.trim());
const expected = state.segments.reduce((a, s) => a + s.mp4.duration_s, 0);
if (!Number.isFinite(duration) || Math.abs(duration - expected) > 1.0) {
  throw new Error(`candidate 时长异常：${duration}s（期望约 ${expected.toFixed(2)}s）`);
}
state.master.candidate = { path: candidatePath, sha256: sha256File(candidatePath), duration_s: +duration.toFixed(3), segments: state.segments.map((s) => s.id), created_at: nowIso() };
writeState(projectRoot, state);
console.log(`${candidatePath}`);
console.log(`${duration.toFixed(3)}s / ${state.master.candidate.sha256.slice(0, 16)}…`);
console.log("下一步：主智能体全流程 review → 用户 master final look 授权（state.mjs master --kind final-look）");
