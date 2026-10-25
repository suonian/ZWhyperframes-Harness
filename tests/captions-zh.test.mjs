import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { splitClauses, planLines, alignCharsToTokens, buildGroups } from "../scripts/captions-zh.mjs";
import { tmp } from "./lib/tmp.mjs";

const TMP = () => tmp("zw-captions-zh-");

// 该用例会把官方 faceless-explainer 的 captions.mjs 作为模块导入——那是
// 「渲染永远走官方」的真实路径，值得被真正执行。但它依赖 bootstrap 按锁定 commit
// 取回的官方 skill，新克隆尚未 bootstrap 时**明确跳过**（而非含混失败）；CI 会先跑
// bootstrap 从而完整覆盖这条路径。
//
// 只认 vendor/skills/：各发现目录下的同名 skill 可能来自任意版本，用它们「通过」
// 并不等于验证了锁定版本的官方产物。
const HAS_OFFICIAL_SKILL = existsSync(
  join(import.meta.dirname, "..", "vendor", "skills", "faceless-explainer", "scripts", "captions.mjs"),
);

const SKIP_REASON = "需要官方 faceless-explainer skill（先运行 npm run bootstrap；CI 中会先 bootstrap）";

test("语块切分：标点收尾、收尾引号归前段、不吞下一段", () => {
  const text = "“降本裁员”为目的的 AI 落地项目，不是好项目。用 AI 帮企业。";
  const clauses = splitClauses(text);
  assert.equal(clauses[0].text, "“降本裁员”为目的的 AI 落地项目，");
  assert.equal(clauses[1].text, "不是好项目。");
  assert.equal(clauses[2].text, "用 AI 帮企业。");
  // 每段以标点结尾，且不以标点开端
  for (const c of clauses) {
    assert.match(c.text, /[。！？，、；：][」』”’）)】》]*$/u, `clause should end with punctuation: ${c.text}`);
    assert.doesNotMatch(c.text, /^[。！？，、；：]/u);
  }
});

test("连续终止标点不产出以标点开端的独立行", () => {
  const clauses = splitClauses("什么？！真的。");
  assert.deepEqual(clauses.map((c) => c.text), ["什么？！", "真的。"]);
  const lines = planLines(clauses);
  for (const line of lines) {
    assert.doesNotMatch(line.text, /^[。！？，、；：]/u);
  }
});

test("行计划：≤22 一段一行；超长均衡切分且不拆英文词", () => {
  const text = "短句，这是一个特别特别特别特别特别特别特别特别特别特别长的没有标点的英文AI落地项目句子。";
  const lines = planLines(splitClauses(text));
  assert.equal(lines[0].text, "短句，");
  const long = lines.filter((l) => l.balancedSplit);
  assert.ok(long.length >= 2, "long clause should be split into balanced chunks");
  for (const l of lines) assert.ok([...l.text].length <= 22, `line ≤22: ${l.text}`);
  const joined = lines.map((l) => l.text).join("");
  assert.equal(joined, text, "lines must cover the text verbatim");
  // 英文词不被切开
  for (const l of lines) {
    assert.ok(!/[A-Za-z]$/u.test(l.text) || /[A-Za-z]$/u.test(l.text.slice(-2)), "no mid-word cut");
  }
});

test("均衡切分：不拆中文词、引号、破折号与功能词", () => {
  const cases = [
    "反而八十个人都是冲着“吃垮自助餐”来的超级算力消耗者。",
    "在机房里一天烧掉的显卡和电力成本就能达到几十甚至上百块钱。",
    "它未来会以什么样的方式进入我们每一个普通人的日常生活？",
    "玩的都是同一个套路——在商业上叫“健身房模式”。",
    "还顺便补贴了剩下两成天天去洗澡练胸的重度撸铁狂人。",
    "后台却吃掉了厂商几百块钱的真实电费和芯片折旧。",
    "互联网最擅长的“免费烧钱”和“几十块钱包月无限用”，",
  ];
  for (const text of cases) {
    const lines = planLines(splitClauses(text));
    assert.equal(lines.map((l) => l.text).join(""), text, `逐字覆盖：${text}`);
    for (const line of lines) {
      assert.ok([...line.text].length <= 22, `行 ≤22：${line.text}`);
      assert.ok(!/[自成才我]\s*$/u.test(line.text), `不以拆词单字结尾：${line.text}`);
      assert.ok(!/^[么们本是]/u.test(line.text), `不以拆词单字开头：${line.text}`);
    }
  }
  const quoted = planLines(splitClauses("互联网最擅长的“免费烧钱”和“几十块钱包月无限用”，"));
  assert.equal(quoted[0].text, "互联网最擅长的“免费烧钱”", "开/闭引号必须同侧");
  assert.equal(quoted[1].text, "和“几十块钱包月无限用”，");
  const dash = planLines(splitClauses("玩的都是同一个套路——在商业上叫“健身房模式”。"));
  assert.ok(dash[0].text.endsWith("——"), "破折号不能被拆到两行");
  const word = planLines(splitClauses("反而八十个人都是冲着“吃垮自助餐”来的超级算力消耗者。"));
  assert.ok(word[0].text.includes("自助餐”"), "不能把「自助餐」拆开");
});

test("字符对齐：TTS 折叠（缺 token、大小写、标点独立 token）容忍", () => {
  const lock = "AI 落地，找 bug。";
  const tokens = [
    { text: "AI", startAbs: 0, endAbs: 0.4 },
    { text: "落", startAbs: 0.4, endAbs: 0.6 },
    { text: "地", startAbs: 0.6, endAbs: 0.8 },
    { text: "，", startAbs: 0.8, endAbs: 0.85 },
    { text: "找", startAbs: 0.85, endAbs: 1.0 },
    { text: "bu", startAbs: 1.0, endAbs: 1.2 },
    { text: "g", startAbs: 1.2, endAbs: 1.3 },
    { text: "。", startAbs: 1.3, endAbs: 1.35 },
  ];
  const ids = alignCharsToTokens([...lock], tokens);
  const chars = [...lock];
  assert.equal(ids[chars.indexOf("A")], 0);
  assert.equal(ids[chars.indexOf("b")], 5);
  assert.equal(ids[chars.indexOf("g")], 6);
  assert.equal(ids[chars.indexOf("。")], 7);
  const frames = { map: new Map([["1", 0]]), frameOf: () => 1 };
  const groups = buildGroups({ text: lock, tokens, frameStart: frames, totalDuration: 1.5 });
  assert.equal(groups.length, 2);
  assert.equal(groups[0].text, "AI 落地，");
  assert.equal(groups[1].text, "找 bug。");
  // 行内 span 拼接 = 行文本（逐字一致，文本取自锁稿）
  for (const g of groups) assert.equal(g.words.map((w) => w.text).join(""), g.text);
  assert.equal(groups[1].words.at(-1).end, 1.35);
});

test("captions-zh build/verify：确定性产物 + 官方 skin 填充", { skip: HAS_OFFICIAL_SKILL ? false : SKIP_REASON }, () => {
  const root = TMP();
  const seg = join(root, "01-demo");
  mkdirSync(join(seg, ".hyperframes"), { recursive: true });
  mkdirSync(join(seg, "compositions"), { recursive: true });
  writeFileSync(join(seg, "user_script.txt"), "这是第一句，这是第二句。\n");
  writeFileSync(join(seg, "frame.md"), "---\nversion: alpha\ncolors:\n  bg: \"#fdfae7\"\n  text: \"#111111\"\n  primary: \"#1e2bfa\"\ntypography:\n  body: { fontFamily: \"Noto Sans SC\", weight: 400 }\n  h1: { fontFamily: \"Noto Sans SC\", weight: 700 }\n---\n");
  writeFileSync(join(seg, "STORYBOARD.md"), `---\nformat: 1920x1080\n---\n\n## Frame 1 — a\n\n- voiceover: "这是第一句，这是第二句。"\n- duration: 2.5s\n- status: animated\n`);
  writeFileSync(join(seg, "audio_meta.json"), JSON.stringify({
    voices: [{ frame: 1, duration_s: 2.4, words: [
      { id: "w0", text: "这", start: 0, end: 0.15 }, { id: "w1", text: "是", start: 0.15, end: 0.3 },
      { id: "w2", text: "第", start: 0.3, end: 0.45 }, { id: "w3", text: "一", start: 0.45, end: 0.6 },
      { id: "w4", text: "句", start: 0.6, end: 0.75 }, { id: "w5", text: "，", start: 0.75, end: 0.8 },
      { id: "w6", text: "这", start: 0.8, end: 0.95 }, { id: "w7", text: "是", start: 0.95, end: 1.1 },
      { id: "w8", text: "第", start: 1.1, end: 1.25 }, { id: "w9", text: "二", start: 1.25, end: 1.4 },
      { id: "w10", text: "句", start: 1.4, end: 1.55 }, { id: "w11", text: "。", start: 1.55, end: 1.6 },
    ] }],
  }, null, 2));
  writeFileSync(join(seg, ".hyperframes", "caption-skin.html"), `<style data-brand-tokens></style>
<style>
  .caption-group { position: absolute; opacity: 0; }
  .caption-word { color: #111111; }
</style>
<div id="captions-root" data-composition-id="captions" data-start="0" data-duration="0" data-width="0" data-height="0">
  <div id="caption-stage" class="caption-stage"></div>
</div>
<script>
  var GROUPS = [];
  var DURATION = 0;
  window.__timelines = window.__timelines || {};
  window.__timelines["captions"] = window.__timelines["captions"] || { paused: true };
</script>
`);

  const build = spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "captions-zh.mjs"), "build", "--segment", seg], { encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const groups = JSON.parse(readFileSync(join(seg, "caption_groups.json"), "utf8"));
  assert.equal(groups.groups.length, 2);
  assert.equal(groups.groups[0].text, "这是第一句，");
  assert.equal(groups.groups[1].text, "这是第二句。");
  const html = readFileSync(join(seg, "compositions", "captions.html"), "utf8");
  assert.match(html, /这是第一句，/u);
  assert.match(html, /var DURATION = 2\.5;/u);
  assert.equal(readFileSync(join(seg, "caption-overrides.json"), "utf8").trim(), "[]");

  const verify = spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "captions-zh.mjs"), "verify", "--segment", seg], { encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr || verify.stdout);

  // 手改分组数据必须被 verify 拒绝
  const tampered = JSON.parse(readFileSync(join(seg, "caption_groups.json"), "utf8"));
  tampered.groups[0].text += "改";
  writeFileSync(join(seg, "caption_groups.json"), JSON.stringify(tampered, null, 2));
  const bad = spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "captions-zh.mjs"), "verify", "--segment", seg], { encoding: "utf8" });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /不一致/u);

  // HTML 也是受校验的确定性产物。
  writeFileSync(join(seg, "caption_groups.json"), JSON.stringify(groups, null, 2) + "\n");
  writeFileSync(join(seg, "compositions", "captions.html"), html + "<!-- tampered -->");
  const badHtml = spawnSync(process.execPath, [join(import.meta.dirname, "..", "scripts", "captions-zh.mjs"), "verify", "--segment", seg], { encoding: "utf8" });
  assert.equal(badHtml.status, 1);
  assert.match(badHtml.stderr, /captions\.html/u);
});
