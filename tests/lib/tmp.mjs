// 测试用临时目录的统一入口：创建即登记，测试文件结束时自动递归删除。
//
// 为什么必须有：直接用 mkdtempSync 而不回收，等于每次 npm test 都往 TMPDIR 里
// 漏一批目录。本机已累积 500+ 个（450MB），且只会越来越多。
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after } from "node:test";

const created = [];

/** 建一个测试临时目录，退出时自动清理。prefix 用于在 TMPDIR 里辨认来源。 */
export function tmp(prefix = "zw-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

after(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});
