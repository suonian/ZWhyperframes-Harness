import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILDER = join(REPO, "scripts", "build-skill-package.mjs");

// 用一个最小合成仓库驱动打包脚本，而不是直接打本仓：
// 本仓是否已 bootstrap 决定 vendor/ 是否存在，用例不该依赖开发机的当前状态。
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "hf-pkg-"));
  writeFileSync(
    join(root, "SKILL.md"),
    "---\nname: fixture\nversion: 0.0.1\ndescription: fixture\n---\n\n# fixture\n",
  );
  writeFileSync(join(root, "keep.txt"), "keep\n");
  // vendor/ 是 bootstrap 取回的上游产物树，模拟其体量足以撞破平台上限。
  for (let i = 0; i < 120; i += 1) {
    const dir = join(root, "vendor", "skills", `skill-${i}`, "scripts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "file.mjs"), `export const x = ${i};\n`);
  }
  return root;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

test("打包排除 vendor/：上游产物树不得进入技能包", () => {
  const root = makeFixture();
  const out = join(root, "out");
  try {
    execFileSync("node", [BUILDER, "--root", root, "--out", out], { stdio: "pipe" });
    const files = walk(out);
    const rel = files.map((f) => relative(out, f).split("\\").join("/"));
    assert.ok(
      rel.every((p) => !p.startsWith("vendor/")),
      `产物中混入了 vendor/：\n${rel.filter((p) => p.startsWith("vendor/")).join("\n")}`,
    );
    assert.ok(rel.includes("SKILL.md"), "产物缺少 SKILL.md");
    assert.ok(rel.includes("keep.txt"), "产物缺少普通文件");
    assert.ok(rel.includes("package-manifest.json"), "产物缺少 package-manifest.json");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("打包在 vendor/ 存在时仍满足平台上限（≤100 文件）", () => {
  const root = makeFixture();
  const out = join(root, "out");
  try {
    // 未排除 vendor/ 时，合成 fixture 的 120×2 个文件会撞破 100 上限并被拒绝——
    // 这条断言在缺陷存在时会以「打包失败」而非「文件数超限」的形式报错，同样能捕获。
    const stdout = execFileSync("node", [BUILDER, "--root", root, "--out", out], {
      stdio: "pipe",
      encoding: "utf-8",
    });
    assert.match(stdout, /纳入 \d+ 个文件/, "打包未报告文件数");
    const count = walk(out).length;
    assert.ok(count <= 100, `产物文件数 ${count} 超过平台上限 100`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
