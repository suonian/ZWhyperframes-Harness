// 质量门禁的判别力验证。
//
// 本仓的门禁有过一次「全绿但成片不合格」的病：黑屏无声片能过、PPT 式片子能过。
// 所以新门禁必须做**双对照验证**：
//   · 空壳片（纯黑 / 无声 / 无 clip）**必须 FAIL**；
//   · 已知合格片**必须 PASS**。
// 只满足「不误伤」的门禁是恒绿，比没有门禁更坏——它会让人以为验过了。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmp } from "./lib/tmp.mjs";
import { analyzeVideoPixels, evaluatePixelQuality } from "../scripts/lib/pixel-quality.mjs";
import { buildMotionSpec, findHeroIds } from "../scripts/lib/motion-spec.mjs";
import { parseCheckEnvelope, collectFindings, formatFindings } from "../scripts/lib/check-envelope.mjs";
import { assertAnimationMap } from "../scripts/lib/animation-map.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", timeout: 300_000 });
  if (r.error) {
    throw new Error(
      `ffmpeg 不可用（${r.error.code ?? r.error.message}）：质量门禁的对照组需要 ffmpeg。` +
        "Windows 上装：winget install Gyan.FFmpeg；CI 的 test-windows job 必须先装 ffmpeg。",
    );
  }
  if (r.status !== 0) throw new Error(`ffmpeg 失败：${r.stderr}`);
}

function makeClips(dir) {
  const black = join(dir, "black.mp4");
  const good = join(dir, "good.mp4");
  // 空壳：纯黑、无声
  ffmpeg(["-f", "lavfi", "-i", "color=c=black:s=1920x1080:r=30", "-t", "2", "-c:v", "libx264", black]);
  // 合格片：白底 + 持续移动的红方块（首帧就有主体，全程有变化）
  ffmpeg([
    "-f", "lavfi",
    "-i", "color=c=white:s=1920x1080:r=30",
    "-f", "lavfi",
    "-i", "color=c=red:s=320x320:r=30",
    "-filter_complex", "[0][1]overlay=x='mod(t*260\\,1400)':y=420",
    "-t", "2",
    "-c:v", "libx264",
    good,
  ]);
  return { black, good };
}

test("像素质检：纯黑空壳必须 FAIL，合成合格片必须 PASS（判别力双对照）", () => {
  const dir = tmp("zw-px-");
  mkdirSync(dir, { recursive: true });
  const clips = makeClips(dir);

  const blackAnalysis = analyzeVideoPixels(clips.black);
  assert.ok(blackAnalysis.ok, `空壳片分析失败：${blackAnalysis.reason}`);
  const blackVerdict = evaluatePixelQuality(blackAnalysis.facts, []);
  assert.equal(blackVerdict.ok, false, "纯黑空壳片竟然通过了像素质检——门禁恒绿，等于没有门禁");
  assert.ok(
    blackVerdict.findings.some((f) => f.includes("首帧")),
    `纯黑空壳的失败原因应指向首帧：${blackVerdict.findings.join(" / ")}`,
  );

  const goodAnalysis = analyzeVideoPixels(clips.good);
  assert.ok(goodAnalysis.ok, `合格片分析失败：${goodAnalysis.reason}`);
  const goodVerdict = evaluatePixelQuality(goodAnalysis.facts, []);
  assert.equal(goodVerdict.ok, true, `合格片被误伤：${goodVerdict.findings.join(" / ")}`);
});

test("像素质检：首帧纯色但后续有运动的片子仍然 FAIL（首帧规则）", () => {
  const dir = tmp("zw-px2-");
  mkdirSync(dir, { recursive: true });
  const clip = join(dir, "late-hero.mp4");
  // 前 1 秒纯白（等待），之后红方块进入 → 首帧无主体，违反 §2 首帧规则
  ffmpeg([
    "-f", "lavfi",
    "-i", "color=c=white:s=1920x1080:r=30",
    "-f", "lavfi",
    "-i", "color=c=red:s=320x320:r=30",
    "-filter_complex", "[0][1]overlay=x='if(lt(t\\,1)\\,1920\\,mod((t-1)*300\\,1400))':y=420",
    "-t", "3",
    "-c:v", "libx264",
    clip,
  ]);
  const analysis = analyzeVideoPixels(clip);
  assert.ok(analysis.ok, `分析失败：${analysis.reason}`);
  const verdict = evaluatePixelQuality(analysis.facts, []);
  assert.equal(verdict.ok, false, "首帧等待的片子不该通过首帧规则");
  assert.ok(verdict.findings.some((f) => f.includes("首帧")), `失败原因应指向首帧：${verdict.findings.join(" / ")}`);
});

test("像素质检：Scene 区间内画面完全静止必须 FAIL（末帧末段除外）", () => {
  const dir = tmp("zw-px3-");
  mkdirSync(dir, { recursive: true });
  const clip = join(dir, "mid-static.mp4");
  // 0–1s 有运动，1–2s 完全静止，2–3s 又有运动 → **中间**那个 Scene 是死的。
  // 末段必须也有运动，否则「末帧末段允许保持到底」的豁免会把问题一起吞掉。
  ffmpeg([
    "-f", "lavfi",
    "-i", "color=c=white:s=1920x1080:r=30",
    "-f", "lavfi",
    "-i", "color=c=red:s=320x320:r=30",
    "-filter_complex",
    "[0][1]overlay=x='if(lt(t\\,1)\\,mod(t*300\\,1400)\\,if(lt(t\\,2)\\,700\\,mod((t-2)*300\\,1400)))':y=420",
    "-t", "3",
    "-c:v", "libx264",
    clip,
  ]);
  const analysis = analyzeVideoPixels(clip);
  assert.ok(analysis.ok, `分析失败：${analysis.reason}`);
  const scenes = [
    { frame: 1, index: 1, start: 0, end: 1 },
    { frame: 1, index: 2, start: 1, end: 2 },
    { frame: 1, index: 3, start: 2, end: 3 },
  ];
  const verdict = evaluatePixelQuality(analysis.facts, scenes);
  assert.equal(verdict.ok, false, "中间 Scene 完全静止的片子不该通过");
  assert.ok(verdict.findings.some((f) => f.includes("Scene")), `失败原因应指向 Scene：${verdict.findings.join(" / ")}`);

  // 只把最后一段改成静止（末帧末段允许保持到底）→ 不应再报 Scene 违规
  const finalHold = evaluatePixelQuality(
    analysis.facts,
    [
      { frame: 1, index: 1, start: 0, end: 1 },
      { frame: 1, index: 2, start: 1, end: 2.5 },
      { frame: 1, index: 3, start: 2.5, end: 3 },
    ],
    { lastSceneIsFinalHold: true },
  );
  assert.ok(
    !finalHold.findings.some((f) => f.includes("Scene")),
    `末帧末段应允许保持到底，却仍报了 Scene 违规：${finalHold.findings.join(" / ")}`,
  );
});

test("motion sidecar：帧未声明主体时必须 fail-closed（不猜、不跳过）", () => {
  const dir = tmp("zw-motion-");
  mkdirSync(join(dir, "compositions", "frames"), { recursive: true });
  writeFileSync(
    join(dir, "STORYBOARD.md"),
    "---\nformat: 16:9\n---\n\n## Frame 1 — 标题\n\n- src: compositions/frames/01.html\n- duration: 2s\n",
  );
  writeFileSync(join(dir, "compositions", "frames", "01.html"), "<template><div id=\"a\">x</div></template>");
  assert.throws(
    () => buildMotionSpec(dir),
    /主体元素/,
    "帧没有声明 data-motion-role=\"hero\" 时必须报错——猜错等于把这条检查变成恒绿",
  );
});

test("motion sidecar：声明主体后生成官方 sidecar，断言覆盖 hero 早可见与跨帧顺序", () => {
  const dir = tmp("zw-motion2-");
  mkdirSync(join(dir, "compositions", "frames"), { recursive: true });
  writeFileSync(
    join(dir, "STORYBOARD.md"),
    "---\nformat: 16:9\n---\n\n## Frame 1 — 一\n\n- src: compositions/frames/01.html\n- duration: 2s\n\n## Frame 2 — 二\n\n- src: compositions/frames/02.html\n- duration: 2s\n",
  );
  writeFileSync(
    join(dir, "compositions", "frames", "01.html"),
    '<template><div id="hero-a" data-motion-role="hero">a</div></template>',
  );
  writeFileSync(
    join(dir, "compositions", "frames", "02.html"),
    '<template><div id="hero-b" data-motion-role="hero">b</div></template>',
  );
  // 装配事实：index.html 里的 data-start / data-duration
  writeFileSync(
    join(dir, "index.html"),
    '<div id="el-01" class="scene" data-composition-id="01" data-start="0" data-duration="2"></div>' +
      '<div id="el-02" class="scene" data-composition-id="02" data-start="2" data-duration="2"></div>',
  );
  const { spec, heroes } = buildMotionSpec(dir);
  assert.equal(heroes.length, 2);
  const appears = spec.assertions.filter((a) => a.kind === "appearsBy");
  assert.equal(appears.length, 2);
  // hero 早可见：首帧按 bySec=0 判（规则书 §2 首帧规则：禁纯色等待）；
  // 其余帧按「帧起点 + 0.5s」（规则书 §1：t ≤ 0.5s）。
  assert.equal(appears[0].bySec, 0);
  assert.equal(appears[1].bySec, 2.5);
  const before = spec.assertions.filter((a) => a.kind === "before");
  assert.equal(before.length, 1);
  assert.equal(before[0].a, "#hero-a");
  assert.equal(before[0].b, "#hero-b");
  // 主体 id 必须全局唯一，否则选择器在成片时间轴上不唯一
  assert.deepEqual(
    findHeroIds('<div id="x" data-motion-role="hero"></div>'),
    ["x"],
  );
});

test("官方 check 信封：带 [INFO] 前缀的 stdout 也能解析，且 finding 归因完整", () => {
  const stdout = [
    "[INFO] [Compiler] Fetched 9 font face(s) for \"Noto Sans SC\"",
    "[hyperframes] browserGpuMode probe → hardware",
    JSON.stringify({
      ok: false,
      lint: { ok: true, errorCount: 0, findings: [] },
      layout: {
        ok: false,
        errorCount: 1,
        findings: [
          {
            code: "content_overlap",
            severity: "error",
            selector: "#m01-card",
            sourceFile: "compositions/frames/01-opening.html",
            time: 1.2,
            message: "content overlap held 700ms",
            fixHint: "give them different tracks",
          },
        ],
      },
      motion: { ok: true, errorCount: 0, findings: [], enabled: true, samples: 69 },
    }),
  ].join("\n");
  const envelope = parseCheckEnvelope(stdout);
  assert.ok(envelope, "带 INFO 前缀的 stdout 必须能解析出 JSON 信封");
  const findings = collectFindings(envelope);
  assert.equal(findings.length, 1);
  const formatted = formatFindings(findings).join("\n");
  assert.match(formatted, /content_overlap/u);
  assert.match(formatted, /#m01-card/u);
  assert.match(formatted, /01-opening\.html/u);
  assert.match(formatted, /t=1\.2/u);
  assert.match(formatted, /give them different tracks/u);
});

test("animation-map：死区与退化补间必须阻断，正常产物必须通过", () => {
  const dir = tmp("zw-amap-");
  mkdirSync(dir, { recursive: true });

  const good = join(dir, "good.json");
  writeFileSync(
    good,
    JSON.stringify({
      tweens: [{ selector: "#a", props: ["opacity"], flags: [] }],
      density: [{ t: 0, activeTweens: 2 }, { t: 0.5, activeTweens: 2 }, { t: 1, activeTweens: 1 }, { t: 1.5, activeTweens: 0 }],
      deadZones: [],
      staggers: [],
    }),
  );
  const goodVerdict = assertAnimationMap(good);
  assert.equal(goodVerdict.ok, true, `正常 animation-map 被误伤：${goodVerdict.findings.join(" / ")}`);

  const bad = join(dir, "bad.json");
  writeFileSync(
    bad,
    JSON.stringify({
      tweens: [{ selector: "#a", props: ["scale"], flags: ["degenerate"] }],
      density: [{ t: 0, activeTweens: 1 }, { t: 0.5, activeTweens: 1 }, { t: 1, activeTweens: 0 }, { t: 1.5, activeTweens: 0 }],
      deadZones: [{ start: 1, end: 2.5 }],
      staggers: [],
    }),
  );
  const badVerdict = assertAnimationMap(bad);
  assert.equal(badVerdict.ok, false, "有死区 + 退化补间的 animation-map 必须阻断");
  assert.ok(badVerdict.findings.some((f) => f.includes("死区")), "应报死区");
  assert.ok(badVerdict.findings.some((f) => f.includes("degenerate")), "应报退化补间");
});

test("仓库内不存在把官方 JSON 结论丢掉只留退出码的调用点", () => {
  // 结构式守卫：`check --strict` 必须带 --json 并解析信封。
  const text = readFileSync(join(REPO_ROOT, "scripts", "gate.mjs"), "utf8");
  assert.match(text, /check", "--strict", "--json"/u, "gate 的 check 必须带 --json");
  assert.match(text, /parseCheckEnvelope/u, "gate 必须解析官方 check 的 JSON 信封");
  assert.doesNotMatch(
    text,
    /runHf\(\["check"[^\]]*\]\)\s*;/u,
    "gate 里还有只判退出码、不解析信封的 check 调用",
  );
});

test("仓库内不存在未接线的质量门禁入口", () => {
  const text = readFileSync(join(REPO_ROOT, "scripts", "gate.mjs"), "utf8");
  for (const cmd of ["motion-spec", "quality"]) {
    assert.ok(text.includes(`command === "${cmd}"`), `gate 未接线 ${cmd} 子命令`);
  }
  assert.ok(existsSync(join(REPO_ROOT, "scripts", "lib", "pixel-quality.mjs")));
  assert.ok(existsSync(join(REPO_ROOT, "scripts", "lib", "motion-spec.mjs")));
  assert.ok(existsSync(join(REPO_ROOT, "scripts", "lib", "animation-map.mjs")));
  assert.ok(existsSync(join(REPO_ROOT, "scripts", "lib", "check-envelope.mjs")));
});
