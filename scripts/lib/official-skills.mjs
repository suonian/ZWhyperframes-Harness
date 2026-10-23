import { existsSync } from "node:fs";
import { join } from "node:path";
import { HARNESS_ROOT } from "./harness.mjs";

// 官方 skill 的**唯一真源**：scripts/bootstrap.sh 按锁定 commit（v0.8.36 / f86aae6）
// 取回并逐项 fail-closed 校验过的 vendor/skills/。
//
// 这里刻意**不**回退到 ~/.claude/skills、~/.agents/skills、~/.config/opencode/skills：
// 那三处的同名 skill 可能来自任意版本——上游 CLI 的 skills update（拉的是 main 的实时
// HEAD）、npx skills add（实测不真正固定 commit）、或用户手工安装。用它们「通过」的
// 门禁，并不等于验证了锁定版本的官方产物，那正是本仓要消灭的「规则说 A、实际跑 B」。
// bootstrap 会把 vendor 软链到各发现目录，因此只认 vendor 不会损失可用性。
export const VENDOR_SKILLS_DIR = join(HARNESS_ROOT, "vendor", "skills");

/** 官方 skill 目录；不存在返回 null。 */
export function findOfficialSkill(name) {
  const dir = join(VENDOR_SKILLS_DIR, name);
  return existsSync(join(dir, "SKILL.md")) ? dir : null;
}

/** 官方 skill 目录；不存在即 fail-closed，并指向 bootstrap。 */
export function requireOfficialSkill(name) {
  const dir = findOfficialSkill(name);
  if (!dir) {
    throw new Error(
      `未找到官方 ${name} skill（唯一真源 vendor/skills/，由 bootstrap 按锁定 commit 取回）。` +
      `请先运行 ./scripts/bootstrap.sh。`,
    );
  }
  return dir;
}

/** 官方 skill 内的脚本文件路径；skill 或文件缺失均 fail-closed。 */
export function requireOfficialScript(name, relPath) {
  const file = join(requireOfficialSkill(name), relPath);
  if (!existsSync(file)) {
    throw new Error(
      `官方 ${name} skill 缺少 ${relPath}（唯一真源 vendor/skills/，由 bootstrap 按锁定 commit 取回）。` +
      `请先运行 ./scripts/bootstrap.sh。`,
    );
  }
  return file;
}
