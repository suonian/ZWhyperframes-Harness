import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractChangelog } from "../scripts/lib/changelog.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("changelog 提取：取到目标版本的正文", () => {
  const md = [
    "# 更新日志",
    "",
    "## [0.2.2] — 2026-10-23",
    "",
    "第二版的正文。",
    "",
    "### 新增",
    "- 某条目",
    "",
    "## [0.2.1] — 2026-10-09",
    "",
    "第一版的正文。",
  ].join("\n");
  const got = extractChangelog(md, "0.2.2");
  assert.match(got, /第二版的正文/u, "应取到目标版本正文");
  assert.match(got, /某条目/u, "应包含该节的子条目");
  assert.doesNotMatch(got, /第一版的正文/u, "不应串到下一个版本");
});

test("changelog 提取：最后一节也能取到（不以 $ 作为结束条件）", () => {
  const md = ["## [0.3.0] — 2026-10-24", "", "末版正文。"].join("\n");
  const got = extractChangelog(md, "0.3.0");
  assert.match(got, /末版正文/u, "末尾版本节应能取到");
});

test("changelog 提取：版本不存在时返回空串而非抛错", () => {
  assert.equal(extractChangelog("## [0.1.0]\n\nx", "9.9.9"), "");
});

test("changelog 提取：结果恒不为空（回归：多行正则的前瞻带 $ 会恒匹配空）", () => {
  // 这条断言针对的是一个真实缺陷：原实现用 /^## \[v\][^\n]*\n([\s\S]*?)(?=\n## \[|$)/m，
  // 而 multiline 模式下 $ 会在任意行尾匹配，非贪婪捕获组因此恒为空——
  // 上传的 changelog 恒为空，平台显示为默认文案 "Initial release"，且不报错。
  const md = readFileSync(join(REPO, "CHANGELOG.md"), "utf-8");
  const pkg = JSON.parse(readFileSync(join(REPO, "package.json"), "utf-8"));
  const got = extractChangelog(md, pkg.version);
  assert.ok(got.length > 0, `CHANGELOG 中 [${pkg.version}] 节提取结果为空`);
  assert.ok(got.length > 100, `提取结果过短（${got.length} 字符），疑似空匹配`);
});
