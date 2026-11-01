// 视觉主题声明（0.2.11）的回归锁。
//
// 背景：项目是公开的，不同使用者要用不同模板。生产前必须显式声明主题，
// 声明写进 00-项目总控/visual.json 并记录该 preset 的 colors 键名指纹；
// `gate baseline` 用指纹反查「这段用的是不是声明的那套」。
// 为什么要反查：官方 `--tokens` remix 只改值不改键，所以换色不该误伤；
// 换 preset 或手改键名必须被拦住。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkDeclaredTheme, colorKeySet } from "../scripts/lib/visual-baseline.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const NEW_VIDEO = join(REPO, "scripts", "new-video.mjs");
const REPO_PRESET = "creative-mode-zh"; // 仓库自带 preset：不依赖 vendor 是否取回

const MD = `---\nname: Capsule\ncolors:\n  cream: "#F5F5F0"\n  ink: "#1A1A1A"\n  coral: "#E85D4E"\ntypography:\n  body: { px: 28 }\n`;

test("colorKeySet：只取 colors 块的二级键，且排序稳定", () => {
  assert.deepEqual(colorKeySet(MD), ["coral", "cream", "ink"]);
  assert.deepEqual(colorKeySet("# 没有 colors 块"), []);
});

test("checkDeclaredTheme：键集合一致才通过，缺/多键都要报出来", () => {
  assert.equal(checkDeclaredTheme(["coral", "cream", "ink"], MD).ok, true);
  const missing = checkDeclaredTheme(["coral", "cream", "ink", "mint"], MD);
  assert.equal(missing.ok, false);
  assert.match(missing.violations.join(""), /缺：mint/u, "缺键必须点名");
  const extra = checkDeclaredTheme(["coral", "cream"], MD);
  assert.equal(extra.ok, false);
  assert.match(extra.violations.join(""), /多：ink/u, "多键必须点名");
  // 声明缺失（老项目/手写 visual.json）不是「通过」，而是明确失败。
  assert.equal(checkDeclaredTheme([], MD).ok, false);
});

test("new-video init：没有 --theme 必须 exit 2 并列出可选主题", () => {
  const r = spawnSync(process.execPath, [NEW_VIDEO, "init", "--project", "x", "--source", "y"], { encoding: "utf8" });
  assert.equal(r.status, 2, `缺 --theme 时应为用法错误 exit 2，实际 ${r.status}`);
  assert.match(r.stderr, /--theme/u);
  assert.match(r.stderr, /可选主题/u, "必须列出可选主题，否则使用者只能靠猜");
});

test("new-video init：声明主题后 visual.json 带主题、来源与色键指纹", () => {
  const root = mkdtempSync(join(tmpdir(), "hf-theme-"));
  const src = join(root, "src");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "锁稿.md"), "locked:script:start\n第一句。\nlocked:script:end\n");
  const project = join(root, "proj");
  try {
    const r = spawnSync(
      process.execPath,
      [NEW_VIDEO, "init", "--project", project, "--source", src, "--products-root", root, "--theme", REPO_PRESET],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 0, `init 失败：${r.stderr}`);
    const declPath = join(project, "00-项目总控", "visual.json");
    assert.ok(existsSync(declPath), "缺少 00-项目总控/visual.json");
    const decl = JSON.parse(readFileSync(declPath, "utf8"));
    assert.equal(decl.theme, REPO_PRESET);
    assert.equal(decl.source, "repo", "仓库 preset 的来源必须记为 repo");
    const presetMd = readFileSync(join(REPO, "presets", REPO_PRESET, "FRAME.md"), "utf8");
    assert.deepEqual(decl.color_keys, colorKeySet(presetMd), "指纹必须来自该 preset 的 colors 键集合");
    assert.ok(decl.color_keys.length >= 5, "色键数量异常，指纹不可用");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
