import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { CHANGELOG_MAX_BYTES, truncateChangelog } from "../scripts/lib/package-limits.mjs";

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
  mkdirSync(join(root, "presets", "creative-mode-zh"), { recursive: true });
  writeFileSync(join(root, "presets", "creative-mode-zh", "FRAME.md"), "# zh preset\n");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "frame-guard.mjs"), "// dev only\n");
  writeFileSync(join(root, "scripts", "css-selector-audit.mjs"), "// dev only\n");
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
    assert.ok(rel.includes("presets/creative-mode-zh/FRAME.md"), "中文 preset 必须进入分发包");
    assert.ok(!rel.includes("scripts/frame-guard.mjs") && !rel.includes("scripts/css-selector-audit.mjs"), "开发期预筛脚本不应进入分发包");
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

test("打包排除 chrome/：官方 CLI 的浏览器下载缓存不得进入技能包", () => {
  const root = makeFixture();
  const out = join(root, "out");
  try {
    // hyperframes browser ensure 把 Chrome 下载缓存写在 <cwd>/chrome/。
    // 这里用一个**扩展名在平台白名单内**的文件，验证排除靠的是路径而不是扩展名兜底——
    // 否则未来白名单一放宽，本机上百 MB 的浏览器就会跟着进包。
    mkdirSync(join(root, "chrome"), { recursive: true });
    writeFileSync(join(root, "chrome", "158.0.0.0-chrome-mac-arm64.zip"), "binary-ish");
    writeFileSync(join(root, "chrome", "build.json"), "{}\n");
    execFileSync("node", [BUILDER, "--root", root, "--out", out], { stdio: "pipe" });
    const rel = walk(out).map((f) => relative(out, f).split("\\").join("/"));
    assert.ok(
      rel.every((p) => !p.startsWith("chrome/")),
      `产物中混入了 chrome/：\n${rel.filter((p) => p.startsWith("chrome/")).join("\n")}`,
    );
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
    // 超限现在会先在**打包阶段**被拦下（口径已统一），发布脚本的闸是第二道。
    // 两种口径的措辞都接受，但都必须点名是体积问题。
    assert.match(r.stderr + r.stdout, /超过.*(上限|发布闸)/u, "错误信息须说明是体积超限");
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

test("打包期就应拒绝产出「发布必失败」的包（体积按真实请求体判）", () => {
  // 回归锁：此前打包按「文件字节和」判、发布按「真实请求体」判，两条线口径不同，
  // 于是能产出「打包通过、发布必失败」的包——请求体比文件字节和多十几 KB
  // （multipart 头 + changelog 字段）。这里用一份超大的内容验证：
  // 打包阶段就必须拒绝，而不是等到发布那一刻才炸。
  const root = makeFixture();
  const out = join(root, "out");
  try {
    writeFileSync(join(root, "huge.txt"), "x".repeat(500 * 1024));
    const r = spawnSync("node", [BUILDER, "--root", root, "--out", out], { encoding: "utf-8" });
    assert.notEqual(r.status, 0, "超限时打包必须以非零码退出");
    assert.match(r.stderr + r.stdout, /超过.*(上限|发布闸)/u, "错误信息须说明是体积超限");
    assert.ok(!existsSync(out), "超限时不得产出包目录");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("打包期与发布期的体积口径必须一致（估计值 == 真实请求体）", () => {
  // 发布脚本会用真实 body 长度与打包期用的估计函数对账，不等即拒发。
  // 这里直接跑本仓：干跑通过 ⟺ 两条口径对得上（发布脚本一旦发现漂移就退出非零）。
  const out = join(tmpdir(), `hf-pkg-selfcheck-${process.pid}`);
  try {
    const build = spawnSync("node", [BUILDER, "--root", REPO, "--out", out], { encoding: "utf-8" });
    assert.equal(build.status, 0, `打包失败：${build.stderr}`);
    const manifest = JSON.parse(
      readFileSync(join(dirname(out), `${basename(out)}.manifest.json`), "utf-8"),
    );
    assert.ok(manifest.estimatedBodyBytes > 0, "清单必须记录请求体估计值");
    assert.ok(
      manifest.estimatedBodyBytes <= manifest.limits.maxBodyBytes,
      `清单里的请求体估计 ${manifest.estimatedBodyBytes} 超过发布闸 ${manifest.limits.maxBodyBytes}`,
    );

    const publish = spawnSync("node", [PUBLISHER, "--root", REPO, "--dry-run"], { encoding: "utf-8" });
    assert.equal(publish.status, 0, `发布干跑失败（口径可能已漂移）：${publish.stderr}`);
    const m = publish.stdout.match(/请求体\s+([\d.]+)\s*KB/u);
    assert.ok(m, `发布干跑未报告请求体体积：${publish.stdout}`);
    const realKb = Number(m[1]);
    // 干跑只打印到 0.1KB，比较时留 200 字节的舍入余量。
    assert.ok(
      Math.abs(manifest.estimatedBodyBytes / 1024 - realKb) < 0.2,
      `打包期估计 ${(manifest.estimatedBodyBytes / 1024).toFixed(1)} KB 与发布期真实 ${realKb} KB 不一致`,
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("changelog 字段超上限时必须截断并标注（不能静默丢内容）", () => {
  const long = "发布说明。".repeat(4000); // 远超 CHANGELOG_MAX_BYTES
  const truncated = truncateChangelog(long);
  assert.ok(Buffer.byteLength(truncated, "utf-8") <= CHANGELOG_MAX_BYTES, "截断后仍超上限");
  assert.match(truncated, /已截断/u, "截断必须留显式标记，否则读者会以为看到的是全文");
  assert.ok(long.startsWith(truncated.slice(0, 40)), "截断必须保留开头");
  const short = "短说明";
  assert.equal(truncateChangelog(short), short, "未超上限时不应被改动");
});
