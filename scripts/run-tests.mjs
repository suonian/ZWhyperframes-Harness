// 测试入口：既支持仓库全量测试，也在“分发包不含 tests/”时明确失败，
// 避免 `node --test tests/*.test.mjs` 在没有匹配文件时以 0 用例、0 退出码假绿。
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIR = join(ROOT, "tests");

if (!existsSync(TEST_DIR)) {
  console.error("[test] 缺少 tests/ 目录：分发包不包含测试，测试只能在仓库中运行。");
  process.exit(1);
}

const files = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => join(TEST_DIR, name));

if (!files.length) {
  console.error("[test] tests/ 下没有任何 *.test.mjs，拒绝空转通过。");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
  stdio: "inherit",
  timeout: 30 * 60 * 1000,
});
process.exit(result.status ?? 1);
