import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILDER = join(REPO, "scripts", "build-skill-package.mjs");
const PUBLISHER = join(REPO, "scripts", "publish-skillhub.mjs");

// 用一个最小合成仓库驱动打包脚本，而不是直接打本仓：
// 本仓是否已 bootstrap 决定 vendor/ 是否存在，用例不该依赖开发机的当前状态。
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "hf-pkg-"));
  writeFileSync(
    join(root, "SKILL.md"),
    "---\nname: fixture\nslug: fixture\nversion: 0.0.1\ndisplayName: Fixture\n" +
    "summary: fixture\ndescription: fixture\n---\n\n# fixture\n",
  );
  writeFileSync(join(root, "keep.txt"), "keep\n");
  writeFileSync(join(root, "RELEASE-HANDBOOK.md"), "local only\n");
  writeFileSync(join(root, "README.md"), "[dead](CHANGELOG.md)\n");
  writeFileSync(join(root, "README.package.md"), "# package readme\n");
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
    assert.ok(rel.includes("README.md"), "产物缺少 README");
    assert.match(readFileSync(join(out, "README.md"), "utf8"), /package readme/u);
    assert.ok(!rel.includes("README.package.md"), "README.package.md 只作为映射源，不应原样入包");
    assert.ok(!rel.includes("RELEASE-HANDBOOK.md"), "本地专用手册不得进入发布包");
    // 清单是**关于**包的元数据，不是包的内容：它写在包目录的同级，
    // 放进包里会让包多带一份自指的文件。
    assert.ok(!rel.includes("package-manifest.json"), "清单不应打进包内");
    assert.ok(
      existsSync(join(dirname(out), `${basename(out)}.manifest.json`)),
      "清单应写在包目录的同级",
    );
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

test("发布：请求体超过服务端实测上限时 fail-closed，不发出请求", () => {
  const root = makeFixture();
  try {
    // 造一个超过服务端实测上限（476KB）的技能目录。
    writeFileSync(join(root, "huge.txt"), "x".repeat(500 * 1024));
    const r = spawnSync("node", [PUBLISHER, "--root", root, "--dry-run"], { encoding: "utf-8" });
    assert.notEqual(r.status, 0, "超限时必须以非零码退出");
    assert.match(r.stderr + r.stdout, /超过.*上限/u, "错误信息须说明是体积超限");
    // 关键：不得发出任何请求——干跑模式下即使体积合格也不会请求，
    // 所以这里只需确认失败发生在体积闸门上（而非打包或凭据环节）。
    assert.doesNotMatch(r.stdout, /HTTP \d+/u, "体积超限时不得发出请求");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("发布：体积在上限内时通过闸门并完成干跑", () => {
  const root = makeFixture();
  try {
    const r = spawnSync("node", [PUBLISHER, "--root", root, "--dry-run"], { encoding: "utf-8" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Dry-run passed/u, "干跑应报告通过");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
