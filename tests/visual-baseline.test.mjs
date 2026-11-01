// 视觉基线门禁的判别力验证。
//
// 为什么要有这个文件：本仓有过「规则写了但机器不判」的病——
// `visual-production-rulebook.md` 一直写着「最小字号 28px」，但官方 `check`
// 只做 WCAG 对比度、**不查字号下限，也不查色板归属**。worker 随手写个 14px
// 标签、或自造一个 #FF00AA，官方门禁全绿。
//
// 所以这里做**双对照**：每一个判定都必须有「已知合格 → PASS」与
// 「已知缺陷 → FAIL」两半。只满足「不误伤」的门禁是恒绿，比没有门禁更坏。
//
// 本文件锁定的是本轮实测发现的两个真缺陷（都曾让门禁失效）：
//   1. 色板越界按 alpha 比较 → 官方 preset 的 radial glow / shadow（同色不同
//      alpha）被误判为越界，门禁变成对官方 preset 的误伤；
//   2. chrome 豁免只按 px 值匹配 → `capsule` 的 `label: px 14` 让 worker 随手
//      写的 14px 正文标签蒙混过关。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkPaletteConfinement, checkFontSizeFloor, checkVoiceProfile,
  readTypographyPxTokens, resolveChromePx, sameColor, normalizeColor,
  parseFontSizePx, MIN_TEXT_PX,
} from "../scripts/lib/visual-baseline.mjs";

// 色板判定要 import **官方** `faceless-explainer/scripts/lib/tokens.mjs`（vendor/skills，
// 由 bootstrap 按锁定 commit 取回）。CI 的 windows-smoke 刻意不跑 bootstrap，
// 那里没有官方产物——依赖官方 skill 的用例必须跳过并写明原因，而不是判失败。
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OFFICIAL_TOKENS = join(REPO_ROOT, "vendor", "skills", "faceless-explainer", "scripts", "lib", "tokens.mjs");
const NO_VENDOR_REASON = existsSync(OFFICIAL_TOKENS)
  ? false
  : "需要官方 faceless-explainer skill（先运行 npm run bootstrap）";

// 官方 `capsule` preset 的 colors 块（vendor/skills/hyperframes-creative/frame-presets/capsule/FRAME.md）。
// 与本项目交付段的 frame.md 完全一致——交付段是官方 capsule 的 CJK remix。
const CAPSULE_FRAME_MD = `---
name: Capsule — Frame (video / frame layer)
colors:
  cream: "#F5F5F0"
  ink: "#1A1A1A"
  outline: "#1E1E1E"
  white: "#FFFFFF"
  coral: "#E85D4E"
  lime: "#C4D94E"
  lavender: "#C5B5E0"
  sky: "#8BB4F7"
  violet: "#A06CE8"
  yellow: "#F2D160"
  peach: "#F5B895"
  mint: "#A8E6CF"
  shadow: "rgba(26,26,26,0.08)"
typography:
  body:      { fontFamily: "Noto Sans SC", cqw: 0.85, weight: 400, lineHeight: 1.6 }
  pill-text: { fontFamily: "Noto Sans SC", cqw: 0.75, weight: 700, tracking: "0.12em", upper: true }
  label:     { fontFamily: "Noto Sans SC", px: 28, weight: 500, tracking: "0.1em", upper: true }
  counter:   { fontFamily: "Noto Sans SC", px: 13, weight: 400 }
components:
  pill:
    rounded: "9999px"
---
`;

// ── 颜色比较 ───────────────────────────────────────────────────────────────────

test("色板比较：同色不同 alpha 视为同色（官方 radial glow / shadow 不得误判越界）", () => {
  // 官方 capsule 的 atmosphere 组件：「1–3 radial candy glows（6–15% opacity）」
  // ——这是同一种品牌色的不同透明度，不是第二个颜色。
  assert.equal(sameColor("#E85D4E", "rgba(232, 93, 78, 0.15)"), true, "coral 的低透明度应与 coral 同色");
  assert.equal(sameColor("rgba(26,26,26,0.08)", "#1A1A1A"), true, "shadow 的 RGB 应与 ink 同色");
  assert.equal(sameColor("#E85D4E", "#FF00AA"), false, "不同 RGB 必须判为不同色");
});

test("色板比较：颜色归一化能吃 hex/rgba 各种写法", () => {
  assert.equal(normalizeColor("#e85d4e"), "#E85D4E");
  assert.equal(normalizeColor("#fff"), "#FFFFFF");
  assert.equal(normalizeColor('"#1A1A1A"'), "#1A1A1A");
  assert.equal(normalizeColor("not-a-color"), null);
});

// ── 色板越界（判别力双对照）────────────────────────────────────────────────────

test("色板越界：官方 preset 风格的帧必须 PASS（不误伤）", { skip: NO_VENDOR_REASON }, async () => {
  const html = `
    <div style="background: #F5F5F0; color: #1A1A1A;">
      <h1 style="color: #E85D4E; font-size: 120px;">标题</h1>
      <div style="background: radial-gradient(circle, rgba(232,93,78,0.15), transparent 60%);"></div>
      <div style="box-shadow: 0 4px 0 rgba(26,26,26,0.08);"></div>
    </div>`;
  const result = await checkPaletteConfinement(CAPSULE_FRAME_MD, html);
  assert.equal(result.ok, true, `官方风格帧被误判越界：${result.violations.join(" / ")}`);
});

test("色板越界：worker 自造的颜色必须 FAIL（判别力）", { skip: NO_VENDOR_REASON }, async () => {
  const html = `<div style="color: #FF00AA; font-size: 40px;">自造色</div>`;
  const result = await checkPaletteConfinement(CAPSULE_FRAME_MD, html);
  assert.equal(result.ok, false, "自造色 #FF00AA 竟然通过了色板检查——门禁恒绿");
  assert.ok(
    result.violations.some((v) => v.includes("#FF00AA")),
    `失败原因应指名道姓说出越界色：${result.violations.join(" / ")}`,
  );
});

// ── 字号下限（判别力双对照）────────────────────────────────────────────────────

test("字号下限：官方 chrome 令牌（counter px 13）豁免，承载性令牌不豁免", () => {
  const tokens = readTypographyPxTokens(CAPSULE_FRAME_MD);
  const byToken = Object.fromEntries(tokens.map((t) => [t.token, t]));
  assert.equal(byToken.counter.chrome, true, "counter 是元信息令牌，应享 chrome 豁免");
  assert.equal(byToken.label.chrome, false, "label 是承载性令牌，不得豁免（否则 14px 正文标签蒙混过关）");
});

test("chrome 豁免白名单只收 chrome 语义令牌的值", () => {
  const chromePx = resolveChromePx(CAPSULE_FRAME_MD);
  assert.ok(chromePx.has(13), "counter 的 13px 应进白名单");
  assert.ok(!chromePx.has(28), "label 的 28px 不该进白名单");
});

test("字号下限：达标字号必须 PASS（不误伤）", () => {
  const html = `<div style="font-size: 120px;">大标题</div><span style="font-size: 30px;">正文</span>`;
  const result = checkFontSizeFloor(CAPSULE_FRAME_MD, html, 1920);
  assert.equal(result.ok, true, `达标字号被误伤：${result.violations.join(" / ")}`);
});

test("字号下限：worker 随手写的 14px 必须 FAIL（判别力）", () => {
  const html = `<span style="font-size: 14px;">随手写的小字</span>`;
  const result = checkFontSizeFloor(CAPSULE_FRAME_MD, html, 1920);
  assert.equal(result.ok, false, "14px 竟然通过了字号检查——门禁恒绿");
  assert.ok(result.violations.some((v) => v.includes("14px")), `失败原因应指出 14px：${result.violations.join(" / ")}`);
});

test("字号下限：官方 chrome 令牌值（13px counter）豁免但记为豁免项", () => {
  const html = `<span style="font-size: 13px;">3</span>`;
  const result = checkFontSizeFloor(CAPSULE_FRAME_MD, html, 1920);
  assert.equal(result.ok, true, `官方 chrome 令牌被误伤：${result.violations.join(" / ")}`);
  assert.equal(result.exempt.length, 1, "应记为豁免项，让它可见而不是静默放过");
});

test("字号下限：无法静态判定的 font-size 必须 FAIL（fail-closed）", () => {
  const html = `<span style="font-size: var(--size);">动态值</span>`;
  const result = checkFontSizeFloor(CAPSULE_FRAME_MD, html, 1920);
  assert.equal(result.ok, false, "无法判定的字号必须 fail-closed，不能当成通过");
});

test("字号换算：cqw 按画布宽度折算，rem/em 按 16px 根字号估算", () => {
  assert.equal(parseFontSizePx("30px", 1920), 30);
  assert.equal(parseFontSizePx("1.5cqw", 1920), 28.8);
  assert.equal(parseFontSizePx("2vw", 1920), 38.4);
  assert.equal(parseFontSizePx("2rem", 1920), 32);
  assert.equal(parseFontSizePx("var(--x)", 1920), null);
  assert.ok(MIN_TEXT_PX === 28, "承载性文字下限必须仍是 28px（用户确认的项目级底线）");
});

// ── 音色一致性（判别力双对照）──────────────────────────────────────────────────

const VOICE_TRUTH = {
  model: "speech-2.8-hd",
  language: "zh",
  voice_id: "ttv-voice-2026040916452526-mc0nlrpN",
  speed: 1.27,
  pitch: 1,
  vol: 1.16,
  sample_rate: 44100,
  bitrate: 256000,
  format: "mp3",
  channel: 1,
};

test("音色一致：与真源相同的 manifest 必须 PASS（不误伤）", () => {
  const result = checkVoiceProfile({ voice_profile: { ...VOICE_TRUTH } }, VOICE_TRUTH);
  assert.equal(result.ok, true, `相同音色被误伤：${result.violations.join(" / ")}`);
});

test("音色一致：voice_id 漂移必须 FAIL（判别力）", () => {
  const result = checkVoiceProfile(
    { voice_profile: { ...VOICE_TRUTH, voice_id: "ttv-voice-OTHER" } },
    VOICE_TRUTH,
  );
  assert.equal(result.ok, false, "音色漂移竟然通过了——门禁恒绿");
  assert.ok(
    result.violations.some((v) => v.includes("voice_id")),
    `失败原因应指向 voice_id：${result.violations.join(" / ")}`,
  );
});

test("音色一致：speed 等参数漂移也必须 FAIL（不只查 voice_id）", () => {
  const result = checkVoiceProfile({ voice_profile: { ...VOICE_TRUTH, speed: 1.0 } }, VOICE_TRUTH);
  assert.equal(result.ok, false, "语速漂移未被拦住");
  assert.ok(result.violations.some((v) => v.includes("speed")), `失败原因应指向 speed：${result.violations.join(" / ")}`);
});

test("音色一致：manifest 缺 voice_profile 或不可解析必须 FAIL（fail-closed）", () => {
  assert.equal(checkVoiceProfile(null, VOICE_TRUTH).ok, false, "manifest 缺失必须失败");
  assert.equal(checkVoiceProfile({}, VOICE_TRUTH).ok, false, "缺 voice_profile 必须失败");
  assert.equal(checkVoiceProfile({ voice_profile: null }, VOICE_TRUTH).ok, false, "voice_profile 为 null 必须失败");
});
