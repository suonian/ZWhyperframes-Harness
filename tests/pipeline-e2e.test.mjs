import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { sha256File, receiptBindingHashes, receiptDirBindingDigests, framesDigest } from "../scripts/lib/harness.mjs";
import { tmp } from "./lib/tmp.mjs";

const SCRIPTS = resolve(import.meta.dirname, "..", "scripts");
const TMP = () => tmp("zw-harness-e2e-");

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

function writePlan(project, segments) {
  const controlDir = join(project, "00-项目总控");
  const state = JSON.parse(readFileSync(join(controlDir, "state.json"), "utf8"));
  const locked = readFileSync(join(project, state.locked_script.path), "utf8").split("\n");
  const plan = {
    version: 1,
    locked_script_sha256: state.locked_script.sha256,
    segments: segments.map((segment) => {
      const text = locked.slice(segment.lines[0] - 1, segment.lines[1]).join("\n").trim();
      return { ...segment, text_sha256: createHash("sha256").update(`${text}\n`).digest("hex") };
    }),
  };
  writeFileSync(join(controlDir, "segment-plan.json"), JSON.stringify(plan, null, 2));
  return plan;
}

function makeTinyMp4(path, seconds = 1) {
  const r = spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=white:s=1920x1080:r=30", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-t", String(seconds), "-c:v", "libx264", "-c:a", "aac", "-shortest", path], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

// 该用例只验证 state/finalize 的状态机；final-look 的完整 preflight 由专门用例覆盖。
// 这里直接写入 approval，避免为一个状态机测试构造整套帧/音频/字幕 fixture。
//
// 但 set-mp4 现在**要求**渲染输入复核通过（gate render-ready），所以 approval 必须
// 绑定一份真实的 receipt——否则那段渲染根本不该被绑定。这不是绕过，是把生产的
// 「final-look 授权 → 渲染 → set-mp4」顺序在测试里也钉死。
function makeRenderReadySegment(segmentDir, { frames = ["01-frame.html"], withFonts = true, withBgm = false, withSfx = false } = {}) {
  mkdirSync(join(segmentDir, "compositions", "frames"), { recursive: true });
  mkdirSync(join(segmentDir, "audio"), { recursive: true });
  mkdirSync(join(segmentDir, ".hyperframes", "anim-map"), { recursive: true });
  mkdirSync(join(segmentDir, "assets", "voice"), { recursive: true });
  if (withFonts) mkdirSync(join(segmentDir, "assets", "fonts"), { recursive: true });
  if (withBgm) mkdirSync(join(segmentDir, "assets", "bgm"), { recursive: true });
  if (withSfx) mkdirSync(join(segmentDir, "assets", "sfx"), { recursive: true });
  for (const f of frames) writeFileSync(join(segmentDir, "compositions", "frames", f), `<template>${f}</template>`);
  writeFileSync(join(segmentDir, "STORYBOARD.md"), "---\ntitle: t\nduration: 1s\n---\n\n## Frame 1 — x\n\n- duration: 1s\n");
  writeFileSync(join(segmentDir, "audio_meta.json"), JSON.stringify({ bgm: null, voices: [] }));
  writeFileSync(join(segmentDir, "audio", "injection-binding.json"), "{}");
  writeFileSync(join(segmentDir, "caption_groups.json"), JSON.stringify({ groups: [] }));
  writeFileSync(join(segmentDir, "compositions", "captions.html"), "<div></div>");
  writeFileSync(join(segmentDir, ".hyperframes", "anim-map", "animation-map.json"), "{}");
  writeFileSync(join(segmentDir, "index.html"), "<html></html>");
  // 渲染真正读取的语音切片与字体——receipt 必须钉住它们。
  writeFileSync(join(segmentDir, "assets", "voice", "01.wav"), "RIFFfake");
  if (withFonts) writeFileSync(join(segmentDir, "assets", "fonts", "f.woff2"), "fakefont");
  // 官方 assemble-index.mjs 会把 assets/bgm/ 与 assets/sfx/ 写进 index.html 的媒体表。
  if (withBgm) writeFileSync(join(segmentDir, "assets", "bgm", "bed.mp3"), "ID3fakebgm");
  if (withSfx) writeFileSync(join(segmentDir, "assets", "sfx", "whoosh.mp3"), "ID3fakesfx");
  const receipt = {
    version: 3,
    segment: "01",
    checks: ["frames", "index", "verify", "captions", "animation-map", "layout", "check"],
    frame_count: frames.length,
    frames_sha256: framesDigest(join(segmentDir, "compositions", "frames")).digest,
    hashes: receiptBindingHashes(segmentDir),
    dirs: receiptDirBindingDigests(segmentDir),
  };
  const receiptPath = join(segmentDir, ".hyperframes", "final-look-receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receiptPath;
}

function setFinalLookApproval(statePath, segmentId, segmentDir) {
  const receiptPath = makeRenderReadySegment(segmentDir);
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const segment = state.segments.find((s) => String(s.id) === String(segmentId));
  segment.approvals = segment.approvals ?? {};
  segment.approvals.final_look = {
    actor: "user",
    kind: "final-look",
    at: "t",
    evidence: "x",
    gate_receipt: { path: receiptPath, sha256: sha256File(receiptPath) },
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  return receiptPath;
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
  assert.ok(existsSync(join(project, "99-最终合成", "renders")), "init 必须创建 master renders 目录");
});

test("new-video init：无标记资料包 fail-closed", () => {
  const root = TMP();
  const source = join(root, "nope.md");
  writeFileSync(source, "没有锁定口播标记。\n");
  const project = join(root, "demo");
  const r = run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未找到锁定口播/u);
  assert.equal(existsSync(project), false, "init 失败不应留下半成品目录");
});

test("new-video init：缺少 --source 拒绝且不创建项目目录", () => {
  const root = TMP();
  const project = join(root, "demo");
  const r = run("new-video.mjs", ["init", "--project", project, "--allow-outside-products-root"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /需要 --source/u);
  assert.equal(existsSync(project), false);
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

// 标记命名空间泛化后必须保持向后兼容：任意 `<命名空间>:script:start` 都能识别，
// 已用旧命名空间生产的历史资料包仍可直接复用，无需迁移。
test("new-video init：锁定稿标记命名空间可自定义（向后兼容任意命名空间）", () => {
  const root = TMP();
  const sourceDir = join(root, "package");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "old-namespace.md"), "legacy-vendor:script:start\n旧命名空间口播。\nlegacy-vendor:script:end\n");
  const r = run("new-video.mjs", ["init", "--project", join(root, "demo"), "--source", sourceDir, "--allow-outside-products-root"]);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.equal(readFileSync(join(root, "demo", "00-项目总控", "锁定口播稿.md"), "utf8"), "旧命名空间口播。\n");
});

test("new-video segment：段目录越出项目根拒绝", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  writePlan(project, [{ id: "01", dir: "../outside", lines: [1, 3] }]);
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
  writePlan(project, plan.segments);

  const gapPlan = { segments: [{ id: "01", dir: "01-a", lines: [2, 3] }] };
  writePlan(project, gapPlan.segments);
  const gap = run("new-video.mjs", ["segment", "--project", project, "--id", "01"]);
  assert.equal(gap.status, 1);
  assert.match(gap.stderr, /不连续/u);

  writePlan(project, plan.segments);
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
  HYPERFRAMES_SKIP_SKILLS: "1",
};

test("离线底线：黑洞代理下 init + 段脚手架仍可完成（生产中途不联网可生产）", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  const init = run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"], { env: OFFLINE_ENV });
  assert.equal(init.status, 0, init.stderr || init.stdout);
  const plan = { segments: [{ id: "01", dir: "01-开场", lines: [1, 3], title: "开场" }] };
  writePlan(project, plan.segments);
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

// ── 渲染输入复核（gate render-ready）────────────────────────────────────
// 守的洞：preflight 只在授权那一刻跑一次，渲染发生在授权**之后**。官方 Studio
// preview 会重写 index.html 与 compositions/captions.html，渲染器还逐帧读取
// assets/voice/*.wav 与 assets/fonts/*.woff2——这些都不在任何单文件绑定里。
// 变异验证：改一个字节，门禁必须当场变红；改回来必须复绿。
function makeRenderReadyProject({ withFonts = true, withBgm = false, withSfx = false } = {}) {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const statePath = join(project, "00-项目总控", "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  state.segments = [
    { id: "01", dir: "01-a", lines: [1, 2], status: "authorized", approvals: { start: { actor: "user", at: "t" } }, mp4: null, user_script_sha256: "x" },
  ];
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  const segDir = join(project, "01-a");
  const receiptPath = makeRenderReadySegment(segDir, { withFonts, withBgm, withSfx });
  const withApproval = JSON.parse(readFileSync(statePath, "utf8"));
  withApproval.segments[0].approvals.final_look = {
    actor: "user",
    kind: "final-look",
    at: "t",
    evidence: "x",
    gate_receipt: { path: receiptPath, sha256: sha256File(receiptPath) },
  };
  writeFileSync(statePath, JSON.stringify(withApproval, null, 2));
  return { project, statePath, segDir };
}

test("gate render-ready：渲染输入漂移必须 fail-closed（变异验证）", () => {
  const { project, segDir } = makeRenderReadyProject();
  const ready = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
  assert.equal(ready.status, 0, ready.stderr);

  // 逐项变异：每一处被改写都必须当场变红，且报错点名该产物；复原后必须复绿。
  const mutations = [
    ["index.html（Studio preview 会重写它）", join(segDir, "index.html"), "<html>被 Studio 重写</html>", /index\.html/u],
    ["compositions/captions.html", join(segDir, "compositions", "captions.html"), "<div>被重写</div>", /captions\.html/u],
    ["帧文件", join(segDir, "compositions", "frames", "01-frame.html"), "<template>被改</template>", /帧集合/u],
    ["语音切片（渲染逐帧读取）", join(segDir, "assets", "voice", "01.wav"), "RIFFtampered", /assets\/voice/u],
    ["字体", join(segDir, "assets", "fonts", "f.woff2"), "tampered", /assets\/fonts/u],
  ];
  for (const [label, path, content, pattern] of mutations) {
    const original = readFileSync(path, "utf8");
    writeFileSync(path, content);
    const r = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
    assert.equal(r.status, 1, `${label} 漂移后必须 fail-closed`);
    assert.match(r.stderr, pattern, `${label} 的报错必须点名该产物`);
    writeFileSync(path, original);
    assert.equal(run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]).status, 0, `${label} 复原后必须复绿`);
  }

  // 缺 receipt：没有任何 preflight 证据，就不能声称渲染输入已被验证过。
  const receiptPath = join(segDir, ".hyperframes", "final-look-receipt.json");
  const receipt = readFileSync(receiptPath, "utf8");
  rmSync(receiptPath);
  const missing = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /receipt/u);
  writeFileSync(receiptPath, receipt);
  assert.equal(run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]).status, 0);
});

// 守的洞：目录型绑定在「preflight 当时目录就不存在」时被记成 null。若复核把 null
// 一律当成漂移，像「该段只用系统字体、没有 assets/fonts/」这种合法段会被永久误伤，
// 永远过不了 set-mp4。正确的语义是：**当时不存在 ⇒ 现在也不该存在**，
// 凭空出现才是漂移。
// 变异验证：把 gate.mjs 的修复撤掉，这条用例必须当场变红。
test("gate render-ready：preflight 时不存在的目录不算漂移（合法路径不得被误伤）", () => {
  const { project, segDir } = makeRenderReadyProject({ withFonts: false });
  const receipt = JSON.parse(readFileSync(join(segDir, ".hyperframes", "final-look-receipt.json"), "utf8"));
  assert.equal(receipt.dirs.fonts, null, "该段没有本地字体时，receipt 必须把该目录记为 null");

  const ok = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
  assert.equal(ok.status, 0, `目录本来就不存在，不得判成漂移：${ok.stderr}`);

  // 变异：preflight 之后凭空多出一个字体目录 → 必须判漂移（渲染会多读一批字节）。
  mkdirSync(join(segDir, "assets", "fonts"), { recursive: true });
  writeFileSync(join(segDir, "assets", "fonts", "late.woff2"), "late");
  const late = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
  assert.equal(late.status, 1, "preflight 之后凭空出现的字体目录必须被拦下");
  assert.match(late.stderr, /assets\/fonts/u, "报错必须点名该目录");
  rmSync(join(segDir, "assets", "fonts"), { recursive: true, force: true });
  assert.equal(run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]).status, 0, "复原后必须复绿");
});

// 守的洞：官方 assemble-index.mjs 会把 `assets/bgm/x.mp3` 与 `assets/sfx/x.mp3`
// 写进 index.html 的媒体表，渲染逐帧读取它们。这两个目录若不在绑定表内，
// 换掉配乐/音效就是**完全无声的**——画面字节没变，门禁全绿，声音却变了。
// 变异验证：撤掉 bgm/sfx 绑定，这条用例必须当场变红。
test("gate render-ready：BGM 与音效目录必须在绑定内（换配乐不能悄悄过门禁）", () => {
  const { project, segDir } = makeRenderReadyProject({ withBgm: true, withSfx: true });
  const receipt = JSON.parse(readFileSync(join(segDir, ".hyperframes", "final-look-receipt.json"), "utf8"));
  assert.ok(receipt.dirs.bgm, "receipt 必须记录 BGM 目录的聚合摘要");
  assert.ok(receipt.dirs.sfx, "receipt 必须记录音效目录的聚合摘要");

  const ok = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
  assert.equal(ok.status, 0, ok.stderr);

  for (const [label, path, pattern] of [
    ["配乐", join(segDir, "assets", "bgm", "bed.mp3"), /assets\/bgm/u],
    ["音效", join(segDir, "assets", "sfx", "whoosh.mp3"), /assets\/sfx/u],
  ]) {
    const original = readFileSync(path);
    writeFileSync(path, "ID3tampered");
    const r = run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]);
    assert.equal(r.status, 1, `${label} 被换掉必须 fail-closed`);
    assert.match(r.stderr, pattern, `${label} 的报错必须点名该目录`);
    writeFileSync(path, original);
    assert.equal(run("gate.mjs", ["render-ready", "--project", project, "--segment", "01"]).status, 0, `${label} 复原后必须复绿`);
  }
});

test("state set-mp4：产物漂移时必须拒绝绑定（漂移的渲染进不了链条）", () => {
  const { project, statePath, segDir } = makeRenderReadyProject();
  const mp4 = join(segDir, "renders", "video.mp4");
  mkdirSync(join(segDir, "renders"), { recursive: true });
  makeTinyMp4(mp4, 1.2);
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4]).status, 0);

  // 渲染后产物被改写（Studio preview 重写 index.html 是生产实测过的真实场景）：
  // 再绑一片 MP4 时必须被挡住——漂移的渲染不许流进 master 链条。
  writeFileSync(join(segDir, "index.html"), "<html>渲染后被 Studio 重写</html>");
  const mp4b = join(segDir, "renders", "video-v2.mp4");
  makeTinyMp4(mp4b, 1.2);
  const r = run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4b]);
  assert.equal(r.status, 1, "漂移后必须拒绝绑定");
  assert.match(r.stderr, /渲染前复核未通过/u);
  // 拒绝后状态未被改写：仍绑定着原来那一片。
  const after = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(after.segments[0].mp4.sha256, sha256File(mp4));
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
  const mp4a2 = join(project, "01-a", "renders", "video-v2.mp4");
  const mp4b = join(project, "02-b", "renders", "video.mp4");
  mkdirSync(join(project, "01-a", "renders"), { recursive: true });
  mkdirSync(join(project, "02-b", "renders"), { recursive: true });
  makeTinyMp4(mp4a, 1.2);
  makeTinyMp4(mp4a2, 1.6);
  makeTinyMp4(mp4b, 0.8);

  // 段 01 无 MP4/final-look 时，段 02 开始授权必须被拒（前段未完成）。
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 1);

  // 官方顺序是「final-look 授权 → 渲染 → set-mp4」；set-mp4 现在要求渲染输入复核通过，
  // 所以必须先有绑定 receipt 的 final-look 授权。
  setFinalLookApproval(statePath, "01", join(project, "01-a"));
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 0);
  // 同一片重新绑定（路径与哈希都没变）必须保留 final-look：
  // 官方顺序是「final-look 授权 → 渲染 → set-mp4」，在这里无条件作废会让段与段之间死锁。
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 0);
  assert.notEqual(JSON.parse(readFileSync(statePath, "utf8")).segments[0].approvals.final_look, undefined);
  // 换片（同一段换一版 cut）必须作废旧 final-look，不能把同一授权复用到不同 cut。
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a2]).status, 0);
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).segments[0].approvals.final_look, undefined);
  // 换片后旧授权已作废：没有合法 final-look 授权时不得再绑定（授权不得复用到另一版 cut）。
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 1);
  // 换回第一版（返工后重新送审 → 重新渲染 → 绑定）。
  setFinalLookApproval(statePath, "01", join(project, "01-a"));
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 0);
  // 换回第一版本身又是一次换片 → 授权再次作废；段间交接前必须重新送审。
  setFinalLookApproval(statePath, "01", join(project, "01-a"));

  // 前段 MP4 哈希被篡改时，下一段开始授权必须被拒绝（不能只看 mp4 真值）。
  const tampered = JSON.parse(readFileSync(statePath, "utf8"));
  const originalHash = tampered.segments[0].mp4.sha256;
  tampered.segments[0].mp4.sha256 = "0".repeat(64);
  writeFileSync(statePath, JSON.stringify(tampered, null, 2));
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 1);
  tampered.segments[0].mp4.sha256 = originalHash;
  writeFileSync(statePath, JSON.stringify(tampered, null, 2));

  // 段 02 开始授权 → 机械确认段 01 accepted。
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 0);
  let mid = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(mid.segments[0].status, "accepted");
  assert.equal(mid.segments[1].status, "authorized");

  setFinalLookApproval(statePath, "02", join(project, "02-b"));
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "02", "--mp4", mp4b]).status, 0);
  // 末段仍为 rendered（尚未给 master 确认）时，即可生成 master 候选（用户先看候选再批）。
  assert.equal(run("gate.mjs", ["master-inputs", "--project", project]).status, 0);
  const bad = JSON.parse(readFileSync(statePath, "utf8"));
  bad.segments[0].mp4.sha256 = "0".repeat(64);
  writeFileSync(statePath, JSON.stringify(bad, null, 2));
  assert.equal(run("gate.mjs", ["master-inputs", "--project", project]).status, 1);

  const good = JSON.parse(readFileSync(statePath, "utf8"));
  good.segments[0].mp4.sha256 = sha256File(mp4a);
  writeFileSync(statePath, JSON.stringify(good, null, 2));

  // candidate 尚未生成时，master final look 必须被拒绝。
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "final-look", "--evidence", "x"]).status, 1);

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
  // master final look 后 candidate 冻结：不能换段 MP4，也不能重新 finalize。
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "02", "--mp4", mp4a]).status, 1);
  assert.equal(run("finalize-master.mjs", ["--project", project]).status, 1);
  const changedInput = JSON.parse(readFileSync(statePath, "utf8"));
  changedInput.segments[0].mp4.sha256 = "0".repeat(64);
  writeFileSync(statePath, JSON.stringify(changedInput, null, 2));
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "close", "--evidence", "x"]).status, 1);
  changedInput.segments[0].mp4.sha256 = sha256File(mp4a);
  writeFileSync(statePath, JSON.stringify(changedInput, null, 2));
  assert.equal(run("state.mjs", ["master", "--project", project, "--kind", "close", "--evidence", "x"]).status, 0);
  const closed = JSON.parse(readFileSync(statePath, "utf8"));
  assert.ok(closed.master.final_render?.path, "close 必须生成 final_render");
  assert.ok(existsSync(closed.master.final_render.path), "final.mp4 必须落在 renders/");
  assert.equal(closed.master.final_render.sha256, closed.master.candidate.sha256);
  assert.equal(closed.master.final_render.sha256, sha256File(closed.master.final_render.path));
  assert.ok(existsSync(closed.master.final_render.manifest_path), "final-render.json 必须生成");
  assert.equal(run("gate.mjs", ["final-delivery", "--project", project]).status, 0);
  // 收尾后项目冻结：换片 / 重新 finalize 都必须失败。
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4b]).status, 1);
  assert.equal(run("finalize-master.mjs", ["--project", project]).status, 1);
  // final 被篡改时交付门禁必须拒绝。
  writeFileSync(closed.master.final_render.path, "tampered", { flag: "a" });
  assert.equal(run("gate.mjs", ["final-delivery", "--project", project]).status, 1);

  assert.equal(run("gate.mjs", ["authorized", "--project", project, "--segment", "01"]).status, 0);
  const noApproval = JSON.parse(readFileSync(statePath, "utf8"));
  noApproval.segments[1].approvals.start = true;
  writeFileSync(statePath, JSON.stringify(noApproval, null, 2));
  assert.equal(run("gate.mjs", ["authorized", "--project", project, "--segment", "02"]).status, 1, "truthy true 不是合法授权");
  noApproval.segments[1].approvals.start = null;
  writeFileSync(statePath, JSON.stringify(noApproval, null, 2));
  assert.equal(run("gate.mjs", ["authorized", "--project", project, "--segment", "02"]).status, 1);
});

// 回归：官方生产顺序是「final-look 授权 → 渲染 → set-mp4 → 下一段开始授权」。
// 若 set-mp4 在首次绑定时就作废本段 final-look，下一段的开始授权永远拿不到前段确认，
// 流水线在第 1 段之后直接死锁（生产实测踩中）。
test("回归：final-look 授权 → set-mp4 绑定后，final-look 必须仍在，下一段才能开始", () => {
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
  mkdirSync(join(project, "01-a", "renders"), { recursive: true });
  const mp4a = join(project, "01-a", "renders", "video.mp4");
  makeTinyMp4(mp4a, 1.2);

  // 1) 用户已授权渲染（final look），2) 渲染完成后绑定 MP4。
  setFinalLookApproval(statePath, "01", join(project, "01-a"));
  assert.equal(run("state.mjs", ["set-mp4", "--project", project, "--segment", "01", "--mp4", mp4a]).status, 0);

  // 绑定不得抹掉那次授权。
  const bound = JSON.parse(readFileSync(statePath, "utf8"));
  assert.notEqual(bound.segments[0].approvals.final_look, undefined, "set-mp4 抹掉了本段 final-look 授权");
  assert.equal(bound.segments[0].status, "rendered");

  // 3) 下一段开始授权必须通过（机械确认段 01）。
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "02", "--kind", "start", "--evidence", "x"]).status, 0);
  const next = JSON.parse(readFileSync(statePath, "utf8"));
  assert.equal(next.segments[0].status, "accepted");
  assert.equal(next.segments[1].status, "authorized");
});

test("state approve final-look：preflight 未通过时拒绝写入授权", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-a", lines: [1, 3] }] };
  writePlan(project, plan.segments);
  assert.equal(run("new-video.mjs", ["segment", "--project", project, "--id", "01"]).status, 0);
  assert.equal(run("state.mjs", ["approve", "--project", project, "--segment", "01", "--kind", "start", "--evidence", "x"]).status, 0);
  const r = run("state.mjs", ["approve", "--project", project, "--segment", "01", "--kind", "final-look", "--evidence", "x"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /前置检查未通过/u);
  const state = JSON.parse(readFileSync(join(project, "00-项目总控", "state.json"), "utf8"));
  assert.equal(state.segments[0].approvals.final_look, undefined);
});

test("gate verify：锁稿/TTS 绑定漂移 fail-closed", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-开场", lines: [1, 3] }] };
  writePlan(project, plan.segments);
  assert.equal(run("new-video.mjs", ["segment", "--project", project, "--id", "01"]).status, 0);
  // 严格 verify 在没有任何绑定时必须失败；早期阶段用 --allow-missing 明确放行。
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 1);
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01", "--allow-missing"]).status, 0);
  const seg = join(project, "01-开场");
  mkdirSync(join(seg, "audio"), { recursive: true });
  writeFileSync(join(seg, "audio", "narration.mp3"), "audio");
  writeFileSync(join(seg, "audio", "narration.titles"), "titles");
  writeFileSync(join(seg, "audio", "narration.manifest.json"), "{}");
  const sha = (value) => createHash("sha256").update(value).digest("hex");
  const bindingJson = JSON.stringify({ text_sha256: sha(readFileSync(join(seg, "user_script.txt"))), audio_sha256: sha("audio"), titles_sha256: sha("titles"), manifest_sha256: sha("{}") });
  writeFileSync(join(seg, "audio", "tts-binding.json"), "not-json");
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 1, "损坏的 binding 在严格模式必须失败");
  writeFileSync(join(seg, "audio", "tts-binding.json"), bindingJson);
  // TTS 绑定有了，但 injection-binding 还没有：严格 verify 仍须失败。
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01"]).status, 1);
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01", "--allow-missing"]).status, 0);
  writeFileSync(join(seg, "audio", "narration.titles"), "tampered");
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01", "--allow-missing"]).status, 1);
  writeFileSync(join(project, "01-开场", "user_script.txt"), "改过的口播稿。\n");
  assert.equal(run("gate.mjs", ["verify", "--project", project, "--segment", "01", "--allow-missing"]).status, 1);
});

test("gate layout-guard：可见字号 <28px fail-closed；≥28px 通过", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-a", lines: [1, 3], title: "a" }] };
  writePlan(project, plan.segments);
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

  // 竖屏下 1.5cqw 实际约 16.2px（1080 宽），不能按 1920 宽算成 28.8px。
  writeFileSync(join(project, "01-a", "STORYBOARD.md"), "---\nformat: 1080x1920\n---\n\n## Frame 1 — a\n\n- duration: 3s\n");
  writeFileSync(join(framesDir, "01-a.html"), '<template><div id="root"><span style="font-size: 1.5cqw">a</span></div></template>');
  const portrait = run("gate.mjs", ["layout-guard", "--project", project, "--segment", "01"]);
  assert.equal(portrait.status, 1);
  assert.match(portrait.stderr, /16\.2px/u);

  // clamp() 取下界，不能被当成无法判定而放行。
  writeFileSync(join(framesDir, "01-a.html"), '<template><div id="root"><span style="font-size: clamp(16px, 2vw, 22px)">a</span></div></template>');
  const clamped = run("gate.mjs", ["layout-guard", "--project", project, "--segment", "01"]);
  assert.equal(clamped.status, 1);
  assert.match(clamped.stderr, /16\.0px/u);
});

// §3 第 1 项此前在规则文档里声称「`gate.mjs` 校验 BRIEF.md 含 `## Intent` 胜出概念」，
// 但该门禁**从未实现**——审计时全仓零 BRIEF 校验代码。这是把「写在规则里」当成
// 「已经强制」的典型。下列用例锁定它现在真的存在。
test("gate pitch-round：BRIEF.md 的 `## Intent` 胜出概念缺失/为空 fail-closed", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);

  const brief = join(project, "BRIEF.md");
  // 缺 BRIEF.md
  assert.equal(run("gate.mjs", ["pitch-round", "--project", project]).status, 1);
  // 有 BRIEF.md 但无 ## Intent
  writeFileSync(brief, "---\nflow: explain\n---\n\n## Audience\n新手\n");
  assert.equal(run("gate.mjs", ["pitch-round", "--project", project]).status, 1);
  // ## Intent 存在但为空
  writeFileSync(brief, "---\nflow: explain\n---\n\n## Intent\n\n## Assets\n无\n");
  const empty = run("gate.mjs", ["pitch-round", "--project", project]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /`## Intent` 为空/u);
  // 胜出概念存在
  writeFileSync(brief, "---\nflow: explain\n---\n\n## Intent\n用「你以为的常识其实是错觉」切入。\n\n## Assets\n无\n");
  const ok = run("gate.mjs", ["pitch-round", "--project", project]);
  assert.equal(ok.status, 0, ok.stderr || ok.stdout);
});

test("gate animation-map：官方 animation-map.json 产物缺失 fail-closed", () => {
  const root = TMP();
  const project = join(root, "demo");
  const source = join(root, "package.md");
  writeFileSync(source, PACKAGE);
  assert.equal(run("new-video.mjs", ["init", "--project", project, "--source", source, "--allow-outside-products-root"]).status, 0);
  const plan = { segments: [{ id: "01", dir: "01-a", lines: [1, 3], title: "a" }] };
  writePlan(project, plan.segments);
  assert.equal(run("new-video.mjs", ["segment", "--project", project, "--id", "01"]).status, 0);

  const missing = run("gate.mjs", ["animation-map", "--project", project, "--segment", "01"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /缺少 animation-map\.json/u);

  // 官方脚本默认写到 <composition>/.hyperframes/anim-map/animation-map.json
  const outDir = join(project, "01-a", ".hyperframes", "anim-map");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "animation-map.json"), "{}");
  const emptyMap = run("gate.mjs", ["animation-map", "--project", project, "--segment", "01"]);
  assert.equal(emptyMap.status, 1);
  assert.match(emptyMap.stderr, /为空或形状非法/u);
  writeFileSync(join(outDir, "animation-map.json"), JSON.stringify({ frames: [] }));
  const ok = run("gate.mjs", ["animation-map", "--project", project, "--segment", "01"]);
  assert.equal(ok.status, 0, ok.stderr || ok.stdout);

  // --out 覆盖（官方脚本支持指定输出目录）
  const custom = join(root, "custom-map");
  mkdirSync(custom, { recursive: true });
  assert.equal(run("gate.mjs", ["animation-map", "--project", project, "--segment", "01", "--out", custom]).status, 1);
  writeFileSync(join(custom, "animation-map.json"), JSON.stringify({ frames: [] }));
  assert.equal(run("gate.mjs", ["animation-map", "--project", project, "--segment", "01", "--out", custom]).status, 0);
});
