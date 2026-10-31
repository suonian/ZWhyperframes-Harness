import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { tmp } from "./lib/tmp.mjs";

const ROOT = join(import.meta.dirname, "..");
const TMP = () => tmp("zw-frame-tools-");

function frame(dir, name, body) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `<template>${body}</template>`);
}

test("frame-guard：缺 compId / clip 时 fail-closed，合法帧通过", () => {
  const root = TMP();
  const frames = join(root, "compositions", "frames");
  frame(frames, "01-ok.html", '<div id="root" data-composition-id="01-ok"><div class="clip" data-start="0" data-duration="1" data-track-index="0"></div></div>');
  let r = spawnSync(process.execPath, [join(ROOT, "scripts", "frame-guard.mjs"), root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  frame(frames, "02-bad.html", '<div id="root" data-composition-id="wrong"><span data-start="0" data-duration="1" data-track-index="0"></span></div>');
  r = spawnSync(process.execPath, [join(ROOT, "scripts", "frame-guard.mjs"), root], { encoding: "utf8" });
  assert.notEqual(r.status, 0, "缺 compId 绑定/class=clip 必须失败");
  assert.match(r.stdout + r.stderr, /data-composition-id|class="clip"/u);
});

test("css-selector-audit：CSS 选择器与 DOM 不匹配时 fail-closed", () => {
  const root = TMP();
  frame(root, "01-a.html", '<div id="root" data-composition-id="01-a"><div class="clip" data-start="0" data-duration="1" data-track-index="0"></div></div><style>.missing-class{color:red}</style>');
  let r = spawnSync(process.execPath, [join(ROOT, "scripts", "css-selector-audit.mjs"), root], { encoding: "utf8" });
  assert.notEqual(r.status, 0, "未匹配的 class 必须失败");
  assert.match(r.stdout + r.stderr, /missing-class/u);
  frame(root, "01-a.html", '<div id="root" data-composition-id="01-a"><div class="clip" data-start="0" data-duration="1" data-track-index="0"></div></div><style>.clip{color:red}</style>');
  r = spawnSync(process.execPath, [join(ROOT, "scripts", "css-selector-audit.mjs"), root], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("creative-mode-zh：无旧英文 preset 文案/24px，字幕当前行有 accent 高亮", () => {
  const frameMd = readFileSync(join(ROOT, "presets", "creative-mode-zh", "FRAME.md"), "utf8");
  assert.doesNotMatch(frameMd, /Archivo Black|JetBrains Mono|all four accents|never all four|no rounded cards/iu);
  assert.match(frameMd, /body:\s*\{[^}]*px: 28[^}]*cqw: 1\.46/u);
  const skin = readFileSync(join(ROOT, "presets", "creative-mode-zh", "caption-skin.html"), "utf8");
  assert.match(skin, /\.caption-word\.is-active\s*\{[^}]*color:\s*var\(--cap-accent/u);
  assert.doesNotMatch(skin, /\.caption-word\.is-active,[\s\S]*?is-spoken\s*\{[^}]*color:\s*var\(--cap-ink/u);
});
