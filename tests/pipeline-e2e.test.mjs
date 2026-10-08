import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sha256File } from "../scripts/lib/harness.mjs";

const SCRIPTS = resolve(import.meta.dirname, "..", "scripts");
const TMP = () => mkdtempSync(join(tmpdir(), "zw-harness-e2e-"));

// 测试必须 hermetic：任何子进程都不允许无限期挂死。
// 官方 init 默认联网 git clone skills —— 由 new-video.mjs 自己注入 HYPERFRAMES_SKIP_SKILLS 阻断。
// 这里**不**替它注入（否则测试会掩盖生产代码的行为），只加 120s 超时兜底：
// 即使官方行为回退，也只会失败而不会永久阻塞 npm test。
const RUN_TIMEOUT_MS = 120_000;
function run(script, args, opts = {}) {
  const { env, ...rest } = opts;
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    killSignal: "SIGKILL",
    ...rest,
    env: { ...process.env, ...env },
  });
}

const PACKAGE = `# AI 概念入门
一些说明文字，不进入口播。

## 锁定口播稿

第一行口播，讲开场冲突。
第二行口播，继续讲。
第三行口播，收束。

## 其它资料

与口播无关。
`;

function makeTinyMp4(path, seconds = 1) {
  const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=white:s=1920x1080:r=30", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-t", String(seconds), "-c:v", "libx264", "-c:a", "aac", "-shortest", path], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

test("new-video init：锁稿提取 + 状态初始化", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  const r = run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const state = JSON.parse(readFileSync(join(project, "00-项目总控", "state.json"), "utf8"));
  assert.equal(state.locked_script.line_count, 3);
  const script = readFileSync(join(project, "00-项目总控", "锁定口播稿.md"), "utf8");
  assert.match(script, /第一行口播/u);
  assert.doesNotMatch(script, /与口播无关/u);
  assert.ok(existsSync(join(project, "99-最终合成", "candidates")));
});

test("new-video init：无标记资料包 fail-closed", () => {
  const root = TMP();
  const source = join(root, "nope.md");
  writeFileSync(source, "没有锁定口播标记。\n");
  const r = run("new-video.mjs", ["init", "--project", join(root, "demo"), "--source", source, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未找到锁定口播/u);
});

test("new-video init：目录资料包——整体归档 + 显式标记锁稿提取", () => {
  const root = TMP();
  const project = join(root, "demo");
  const sourceDir = join(root, "package");
  mkdirSync(join(sourceDir, "证据"), { recursive: true });
  writeFileSync(join(sourceDir, "原稿.md"), "这是原稿全文，但没有标记。\n");
  writeFileSync(join(sourceDir, "证据", "说明.md"), "证据说明。\n");
  writeFileSync(join(sourceDir, "00-锁定口播稿.md"), "locked-script:script:start\n目录包第一行口播。\n目录包第二行口播。\nlocked-script:script:end\n");
  const r = run("new-video.mjs", ["init", "--project", project, "--source", sourceDir, "--allow-outside-products-root"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(readFileSync(join(project, "00-项目总控", "锁定口播稿.md"), "utf8"), "目录包第一行口播。\n目录包第二行口播。\n");
  assert.ok(existsSync(join(project, "00-项目总控", "资料包", "原稿.md")));
  assert.ok(existsSync(join(project, "00-项目总控", "资料包", "证据", "说明.md")));
  assert.ok(existsSync(join(project, "00-项目总控", "资料包", "00-锁定口播稿.md")));
});

test("new-video init：目录资料包无显式标记 fail-closed", () => {
  const root = TMP();
  const sourceDir = join(root, "package");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "说明.md"), "## 对应口播稿\n这是路径引用，不是标记。\n");
  const r = run("new-video.mjs", ["init", "--project", join(root, "demo"), "--source", sourceDir, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未找到锁定口播/u);
});

test("new-video init：目录资料包多个 script:start 标记 fail-closed", () => {
  const root = TMP();
  const sourceDir = join(root, "package");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "a.md"), "locked-script:script:start\nA。\nlocked-script:script:end\n");
  writeFileSync(join(sourceDir, "b.md"), "locked-script:script:start\nB。\nlocked-script:script:end\n");
  const r = run("new-video.mjs", ["init", "--project", join(root, "demo"), "--source", sourceDir, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /多个 script:start/u);
});

test("new-video segment：段目录越出项目根拒绝", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify({ segments: [{ id: "01", dir: "../outside", lines: [1, 3] }] }));
  const result = run("new-video.mjs", ["segment", "--project", project, "--id", "01"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须位于项目根内/u);
  assert.equal(existsSync(join(root, "outside")), false);
});

test("new-video init：非空目录拒绝", () => {
  const root = TMP();
  const project = join(root, "demo");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "x.txt"), "x");
  const source = join(root, "s.md");
  writeFileSync(source, PACKAGE);
  const r = run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /非空/u);
});

test("new-video segment：官方 init + 段骨架 + 计划连续性校验", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-开场", lines: [1, 2], title: "开场" }, { id: "02", dir: "02-收束", lines: [3, 3], title: "收束" }] };
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(plan));

  const gapPlan = { segments: [{ id: "01", dir: "01-a", lines: [2, 3] }] };
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(gapPlan));
  const gap = run("new-video.mjs", ["segment", "--project", project, "--id", "01"]);
  assert.equal(gap.status, 1);
  assert.match(gap.stderr, /不连续/u);

  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(plan));
  const ok = run("new-video.mjs", ["segment", "--project", project, "--id", "01"]);
  assert.equal(ok.status, 0, ok.stderr || ok.stdout);
  assert.ok(existsSync(join(project, "01-开场", "hyperframes.json")));
  const userScript = readFileSync(join(project, "01-开场", "user_script.txt"), "utf8").trim();
  assert.match(userScript, /第一行口播/u);
  assert.doesNotMatch(userScript, /第三行/u);
  const manifest = JSON.parse(readFileSync(join(project, "01-开场", "segment-manifest.json"), "utf8"));
  assert.equal(manifest.user_script_sha256, sha256File(join(project, "01-开场", "user_script.txt")));

  const dup = run("new-video.mjs", ["segment", "--project", project, "--id", "01"]);
  assert.equal(dup.status, 1);
});

// 离线底线（production-workflow-rules.md §1）：P0 之后生产中途不联网也必须能跑完。
// 用黑洞代理（127.0.0.1:1 无人监听 + 清空 NO_PROXY 豁免）模拟断网——
// 若段脚手架任何环节偷跑网络，这里会失败或超时，而不是静默通过。
const OFFLINE_ENV = {
  HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1", ALL_PROXY: "http://127.0.0.1:1",
  http_proxy: "http://127.0.0.1:1", https_proxy: "http://127.0.0.1:1", all_proxy: "http://127.0.0.1:1",
  NO_PROXY: "", no_proxy: "",
};

test("离线底线：黑洞代理下 init + 段脚手架仍可完成（生产中途不联网可生产）", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  const init = run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"], { env: OFFLINE_ENV });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const plan = { segments: [{ id: "01", dir: "01-开场", lines: [1, 3], title: "开场" }] };
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(plan));
  const seg = run("new-video.mjs", ["segment", "--project", project, "--id", "01"], { env: OFFLINE_ENV });
  assert.equal(seg.status, 0, seg.stderr || seg.stdout);
  assert.ok(existsSync(join(project, "01-开场", "hyperframes.json")));
  assert.ok(existsSync(join(project, "01-开场", "user_script.txt")));
  assert.ok(existsSync(join(project, "01-开场", "segment-manifest.json")));
  // 判别力：必须真的没碰网络，而不只是"网络失败后仍成功"。
  // 去掉 new-video.mjs 的 HYPERFRAMES_SKIP_SKILLS 兜底时，官方 init 会打印下列标记。
  const output = `${seg.stdout ?? ""}\n${seg.stderr ?? ""}`;
  assert.doesNotMatch(output, /Checking AI coding skills against GitHub/iu, "段脚手架不应触发官方 skills 联网检查");
  assert.doesNotMatch(output, /Failed to clone|github\.com/iu, "段脚手架不应访问 GitHub");
});

test("state/gate/finalize 全链：授权 → MP4 绑定 → master 拼接（开始授权自动确认前段）", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);

  const statePath = join(project, "00-项目总控", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.segments = [
    { id: "01", dir: "01-a", lines: [1, 2], status: "authorized", approvals: { start: { actor: "user", at: "t" } }, mp4: null, user_script_sha256: "x" },
    { id: "02", dir: "02-b", lines: [3, 3], status: "planned", approvals: {}, mp4: null, user_script_sha256: "y" },
  ];
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  mkdirSync(join(project, "01-a"), { recursive: true });
  mkdirSync(join(project, "02-b"), { recursive: true });
  const mp4a = join(project, "01-a", "renders", "video.mp4");
  const mp4b = join(project, "02-b", "renders", "video.mp4");
  mkdirSync(join(project, "01-a", "renders"), { recursive: true });
  mkdirSync(join(project, "02-b", "renders"), { recursive: true });
  makeTinyMp4(mp4a, 1.2);
  makeTinyMp4(mp4b, 0.8);

  // 段 01 无 MP4/final-look 时，段 02 开始授权必须被拒（前段未完成）。
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 1);

  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 0);
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "01", "--kind", "final-look", "--evidence", "x"]).status, 0);

  // 段 02 开始授权 → 机械确认段 01 accepted。
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 0);
  let mid = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(mid.segments[0].status, "accepted");
  assert.equal(mid.segments[1].status, "authorized");

  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "02", "--mp4", mp4b]).status, 0);
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "final-look", "--evidence", "x"]).status, 0);
  // 末段仍为 rendered（尚未给 master 确认）时，即可生成 master 候选（用户先看候选再批）。
  assert.equal(run("gate.mjs", ["master-inputs", "--project", project]).status, 0);
  const bad = JSON.parse(readFileSync(statePath, "utf8"));
  bad.segments[0].mp4.sha256 = "0".repeat(64);
  writeFileSync(statePath, JSON.stringify(bad, null, 2));
  assert.equal(run("gate.mjs", ["master-inputs", "--project", project]).status, 1);

  const good = JSON.parse(readFileSync(statePath, "utf8"));
  good.segments[0].mp4.sha256 = sha256File(mp4a);
  writeFileSync(statePath, JSON.stringify(good, null, 2));

  const fin = run("finalize-master.mjs", ["--project", project]);
  assert.equal(fin.status, 0, fin.stderr);
  const after = JSON.parse(readFileSync(statePath, "utf8"));
  assert.ok(after.master.candidate?.path);
  assert.ok(existsSync(after.master.candidate.path));
  assert.ok(Math.abs(after.master.candidate.duration_s - 2.0) < 0.6);
  assert.equal(after.segments[1].status, "rendered");

  // 未完成 master final look 时，close 必须被拒绝。
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "close", "--evidence", "x"]).status, 1);

  // master final look → 机械确认末段 accepted。
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "final-look", "--evidence", "x"]).status, 0);
  mid = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(mid.segments[1].status, "accepted");
  assert.equal(mid.master.candidate.inputs.length, 2);
  assert.equal(mid.master.candidate.inputs[0].sha256, sha256File(mp4a));
  const changedInput = JSON.parse(readFileSync(statePath, "utf8"));
  changedInput.segments[0].mp4.sha256 = "0".repeat(64);
  writeFileSync(statePath, JSON.stringify(changedInput, null, 2));
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "close", "--evidence", "x"]).status, 1);
  changedInput.segments[0].mp4.sha256 = sha256File(mp4a);
  writeFileSync(statePath, JSON.stringify(changedInput, null, 2));
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "close", "--evidence", "x"]).status, 0);

  assert.equal(run("gate.mjs", ["authorized", "--project", project, "--segment", "01"]).status, 0);
  const noApproval = JSON.parse(readFileSync(statePath, "utf8"));
  noApproval.segments[1].approvals.start = null;
  writeFileSync(statePath, JSON.stringify(noApproval, null, 2));
  assert.equal(run("gate.mjs", ["authorized", "--project", project, "--segment", "02"]).status, 1);
});

test("gate verify：锁稿/TTS 绑定漂移 fail-closed", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-开场", lines: [1, 3] }] };
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(plan));
  assert.equal(run("new-video.mjs", ["segment", "--project", project, "--id", "01"]).status, 0);
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 0);
  const seg = join(project, "01-开场");
  mkdirSync(join(seg, "audio"), { recursive: true });
  writeFileSync(join(seg, "audio", "narration.mp3"), "audio");
  writeFileSync(join(seg, "audio", "narration.titles"), "titles");
  writeFileSync(join(seg, "audio", "narration.manifest.json"), "{}");
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  writeFileSync(join(seg, "audio", "tts-binding.json"), JSON.stringify({ text_sha256: sha(readFileSync(join(seg, "user_script.txt"))), audio_sha256: sha("audio"), titles_sha256: sha("titles"), manifest_sha256: sha("{}") }));
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 0);
  writeFileSync(join(seg, "audio", "narration.titles"), "tampered");
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 1);
  writeFileSync(join(project, "01-开场", "user_script.txt"), "改过的口播稿。\n");
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 1);
});

test("gate layout-guard：可见字号 <28px fail-closed；≥28px 通过", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-a", lines: [1, 3], title: "a" }] };
  writeFileSync(join(project, "00-项目总控", "segment-plan.json"), JSON.stringify(plan));
  assert.equal(run("new-video.mjs", ["segment", "--project", project, "--id", "01"]).status, 0);
  const framesDir = join(project, "01-a", "compositions", "frames");
  mkdirSync(framesDir, { recursive: true });
  const okFrame = '<template><div id="root"><span style="font-size: 1.5cqw">a</span></div></template>';
  writeFileSync(join(framesDir, "01-a.html"), okFrame);
  const pass = run("gate.mjs", ["layout-guard", "--project", project, "--segment", "01"]);
  assert.equal(pass.status, 0, pass.stderr || pass.stdout);
  const badFrame = '<template><div id="root"><span style="font-size: 20px">a</span></div></template>';
  writeFileSync(join(framesDir, "01-a.html"), badFrame);
  const failRun = run("gate.mjs", ["layout-guard", "--project", project, "--segment", "01"]);
  assert.equal(failRun.status, 1);
  assert.match(failRun.stderr, /可见字号低于 28px/u);
});
