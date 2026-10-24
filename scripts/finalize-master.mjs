#!/usr/bin/env node
// finalize-master.mjs — master 唯一官方拼接入口（管理层薄包装）
// 零信任：每个输入段 MP4 的 SHA-256 必须与项目状态绑定一致；concat 后写不可变 candidate。
// 不渲染、不混音、不调色；只是把已确认的段落 MP4 按 segment-plan 顺序无损拼接。
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, readState, writeState, MASTER_DIR, nowIso } from "./lib/harness.mjs";
import { validateMasterInputs } from "./lib/master-inputs.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const projectRoot = resolve(get("project") ?? ".");
const state = readState(projectRoot);
if (state.master?.closed || state.master?.approvals?.close) throw new Error("项目已收尾，不能再生成 master candidate");
if (state.master?.approvals?.final_look) throw new Error("master final look 已确认，candidate 已冻结；如需新 cut 请显式重置 master 审批");

// 末段例外、前序 accepted、MP4 哈希校验统一由 lib/master-inputs.mjs 负责。
const inputSnapshot = validateMasterInputs(state);

const stamp = nowIso().replace(/[-:.]/gu, "").slice(0, 17);
const candidateDir = join(projectRoot, MASTER_DIR, "candidates");
mkdirSync(candidateDir, { recursive: true });
const candidatePath = join(candidateDir, `candidate-${stamp}.mp4`);
const listPath = join(candidateDir, "concat-list.txt");
writeFileSync(listPath, state.segments.map((seg) => `file '${seg.mp4.path.replaceAll("'", "'\\''")}'`).join("\n"));

const run = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", candidatePath], {
  encoding: "utf8",
  timeout: 30 * 60 * 1000,
  stdio: ["ignore", "ignore", "pipe"],
});
if (run.status !== 0 || !existsSync(candidatePath)) throw new Error(`ffmpeg concat 失败：${run.stderr ?? ""}`);

// TOCTOU：concat 结束后再逐段校验一次，确保候选里的内容就是刚才快照的内容。
for (const input of inputSnapshot) {
  if (!existsSync(input.path) || sha256File(input.path) !== input.sha256) {
    throw new Error(`段 ${input.id} 的 MP4 在 concat 期间发生变化，candidate 作废；请重跑 finalize-master`);
  }
}
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", candidatePath], { encoding: "utf8", timeout: 10 * 60 * 1000 });
const duration = Number(probe.stdout.trim());
const expected = state.segments.reduce((a, s) => a + s.mp4.duration_s, 0);
if (!Number.isFinite(expected) || !Number.isFinite(duration) || Math.abs(duration - expected) > 1.0) {
  throw new Error(`candidate 时长异常：${duration}s（期望约 ${expected.toFixed(2)}s）`);
}
state.master.candidate = { path: candidatePath, sha256: sha256File(candidatePath), duration_s: +duration.toFixed(3), segments: state.segments.map((s) => s.id), inputs: inputSnapshot, concat_list_sha256: sha256File(listPath), created_at: nowIso() };
writeState(projectRoot, state);
console.log(`${candidatePath}`);
console.log(`${duration.toFixed(3)}s / ${state.master.candidate.sha256.slice(0, 16)}…`);
console.log("下一步：主智能体全流程 review → 用户 master final look 授权（state.mjs master --kind final-look）");
