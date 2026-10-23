import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// vendor/ 是 bootstrap 按锁定 commit 取回的上游产物树（.gitignore 内），不属于本仓：
// 它的 326 份 markdown 由上游维护，其内部相对链接的成败不应让本仓的门禁变红。
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "__pycache__", ".skillhub-pkg"]);

// GitHub 真实锚点算法：转小写 → 去掉标点（保留字母/数字/空白/连字符/下划线）→ 逐个空格换成连字符。
// 关键：空格是「逐个」替换，不折叠，因此 "a · b" 得到 "a--b"（中间那个 `·` 被删，留下两个空格）。
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

function walkMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walkMd(abs, acc);
    else if (extname(name).toLowerCase() === ".md") acc.push(abs);
  }
  return acc;
}

const mdFiles = walkMd(REPO);

test("仓库内所有 markdown 的相对链接均可解析", () => {
  const dead = [];
  let checked = 0;
  for (const file of mdFiles) {
    const text = readFileSync(file, "utf-8");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = m[1];
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const target = link.split("#")[0];
      if (!target) continue;
      checked += 1;
      const abs = resolve(dirname(file), target);
      if (!existsSync(abs)) dead.push(`${relative(REPO, file)} → ${link}`);
    }
  }
  assert.ok(checked > 0, "未检出任何相对链接，测试本身失效");
  assert.deepEqual(dead, [], `存在死链：\n${dead.join("\n")}`);
});

test("README 目录锚点与实际标题一致（中英双份）", () => {
  for (const path of ["README.md", "README.en.md"]) {
    const text = readFileSync(join(REPO, path), "utf-8");
    const headings = new Set();
    for (const m of text.matchAll(/^##\s+(.+)$/gm)) headings.add(slug(m[1]));
    const toc = [...text.matchAll(/^- \[.+?\]\(#(.+?)\)$/gm)].map((m) => m[1]);
    assert.ok(toc.length > 0, `${path} 未检出目录条目`);
    const missing = toc.filter((a) => !headings.has(a));
    assert.deepEqual(missing, [], `${path} 目录锚点无对应标题：${missing.join(", ")}`);
  }
});

test("版本号在四处声明中一致", () => {
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8"));
  const lock = JSON.parse(readFileSync(join(REPO, "package-lock.json"), "utf-8"));
  const cff = readFileSync(join(REPO, "CITATION.cff"), "utf-8");
  const skill = readFileSync(join(REPO, "SKILL.md"), "utf-8");

  const cffVersion = (cff.match(/^version:\s*(\S+)$/m) || [])[1];
  const skillVersion = (skill.match(/^version:\s*(\S+)$/m) || [])[1];

  const declared = [pkg.version, lock.version, lock.packages[""].version, cffVersion, skillVersion];
  assert.equal(
    new Set(declared).size, 1,
    `版本号不一致：package.json=${pkg.version} package-lock=${lock.version}/${lock.packages[""].version} CITATION.cff=${cffVersion} SKILL.md=${skillVersion}`,
  );
});

test("SKILL.md 满足 SkillHub 协议 §8.2 的 frontmatter 要求", () => {
  const text = readFileSync(join(REPO, "SKILL.md"), "utf-8");
  assert.ok(text.startsWith("---\n"), "SKILL.md 首行必须是 frontmatter 起始标记 ---");
  const end = text.indexOf("\n---", 3);
  assert.ok(end > 0, "SKILL.md 缺少 frontmatter 结束标记 ---");
  const body = text.slice(4, end);
  const fields = {};
  for (const line of body.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0 || line.trim().startsWith("#")) continue;
    fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  assert.match(fields.name ?? "", /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "name 必须为 kebab-case");
  assert.match(fields.version ?? "", /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, "version 必须为合法 SemVer");
  assert.ok((fields.displayName ?? "").length > 0, "缺少 displayName");
  assert.ok((fields.description ?? "").length > 0, "缺少 description");
  // 平台解析器只支持单行值，多行会被截断
  assert.ok(!fields.description.includes("\n"), "description 必须是单行");
});

test("SKILL.md 只做路由：正文不复制规则条款", () => {
  const text = readFileSync(join(REPO, "SKILL.md"), "utf-8");
  assert.ok(
    text.includes("只负责路由，不复制规范"),
    "SKILL.md 应声明自己只做路由，避免与 AGENTS.md / docs/rules/ 形成第二信源",
  );
  for (const f of ["AGENTS.md", "docs/rules/production-workflow-rules.md"]) {
    assert.ok(existsSync(join(REPO, f)), `SKILL.md 指向的规则文件不存在：${f}`);
  }
});

test("文档声明的测试数与 tests/ 实际用例数一致", () => {
  // 「新增了用例却没改 README 徽章」是本仓反复出现的漂移形态：
  // 文档说 50、实际 52，两者都没有错，但读者拿到的数是错的。
  const testDir = join(REPO, "tests");
  let actual = 0;
  for (const name of readdirSync(testDir)) {
    if (!name.endsWith(".test.mjs")) continue;
    const text = readFileSync(join(testDir, name), "utf-8");
    // 只认 `test("名称"` 这一种调用形态；`test.skip` / `test.only` 不计入。
    // 注释里的同名形态必须先剥掉，否则本测试自身的说明文字会被计成一个用例。
    const code = text
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/.*$/, ""))
      .join("\n");
    actual += [...code.matchAll(/(?<![\w.])test\(\s*["'`]/g)].length;
  }
  assert.ok(actual > 0, "未统计到任何用例，测试本身失效");

  const claims = [];
  for (const path of ["README.md", "README.en.md"]) {
    const text = readFileSync(join(REPO, path), "utf-8");
    const badge = text.match(/badge\/tests-(\d+)%20total/);
    assert.ok(badge, `${path} 的测试徽章缺失或格式变化`);
    claims.push(`${path} 徽章=${badge[1]}`);
    const inline = text.match(/npm test\s+#\s*(\d+)\s*(?:项测试|tests)/);
    assert.ok(inline, `${path} 的快速开始段缺少测试数声明`);
    claims.push(`${path} 正文=${inline[1]}`);
  }
  const skillText = readFileSync(join(REPO, "SKILL.md"), "utf-8");
  const skillInline = skillText.match(/npm test\s+#\s*(\d+)\s*项测试/);
  assert.ok(skillInline, "SKILL.md 的快速开始段缺少测试数声明");
  claims.push(`SKILL.md=${skillInline[1]}`);

  for (const claim of claims) {
    assert.equal(
      Number(claim.split("=")[1]), actual,
      `文档声明的测试数与实际用例数不符（实际 ${actual}）：${claim}`,
    );
  }
});
