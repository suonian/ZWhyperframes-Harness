#!/usr/bin/env node
// link-official-skills.mjs — 把 vendor/skills/ 下的官方 skills 链接到各客户端的技能发现目录
//
// 为什么不用 `ln -sfn`：
//   POSIX 上 ln -sfn 建软链，替换是 O(1)，且目标始终指向 vendor（单真源）。
//   Windows 上 MSYS 的 ln 不建真软链（core.symlinks=false 或无权限），会**退化成整树复制**。
//   复制出来的副本与 vendor 失去联动：vendor 更新后副本就是陈旧的，
//   智能体读到的是旧版官方合同——正是本仓要防的「规则说 A、实际跑 B」漂移。
//   这里改用 Node 的 fs.symlinkSync：Windows 上指定 'junction' 类型，
//   目录联接不需要管理员权限，且始终指向 vendor。
//
// 性质：单步、幂等、确定性、零 agent 调用。
//   重复执行覆盖同一目标目录；被替换下来的旧版本保留在 superseded 目录，不自动删除。
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const vendorSkills = get("vendor-skills");
const supersededRoot = get("superseded");
const roots = (get("roots") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!vendorSkills || !supersededRoot || !roots.length) {
  console.error("用法: node link-official-skills.mjs --vendor-skills <dir> --superseded <dir> --roots <dir1,dir2>");
  process.exit(2);
}
if (!existsSync(vendorSkills)) {
  console.error(`官方 skills 目录不存在：${vendorSkills}`);
  process.exit(1);
}

const isWindows = process.platform === "win32";
const linkType = isWindows ? "junction" : "dir";
let linked = 0;
let replaced = 0;

for (const root of roots) {
  mkdirSync(root, { recursive: true });
  for (const entry of readdirSync(vendorSkills, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!entry.isDirectory()) continue;
    const src = join(vendorSkills, entry.name);
    if (!existsSync(join(src, "SKILL.md"))) continue;
    const target = join(root, entry.name);

    if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
      const st = lstatSync(target);
      if (st.isSymbolicLink()) {
        // 已有软链：直接替换（指向可能已变）。
        rmSync(target, { recursive: true, force: true });
      } else {
        // 真实目录（用户手工装的旧版本或上一次 Windows 复制）：挪到暂存区保留，不删。
        mkdirSync(supersededRoot, { recursive: true });
        const dest = join(supersededRoot, `${basename(root)}-${entry.name}`);
        rmSync(dest, { recursive: true, force: true });
        renameSync(target, dest);
        replaced += 1;
      }
    }

    symlinkSync(src, target, linkType);
    linked += 1;
  }
}

console.log(`[link] 已链接 ${linked} 个官方 skill 到 ${roots.length} 个发现目录（${isWindows ? "junction" : "symlink"}）`);
if (replaced > 0) console.log(`[link] 被替换的旧版本保留在：${supersededRoot}`);
