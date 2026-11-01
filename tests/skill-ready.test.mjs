// skill-ready.mjs 的回归锁：它是「加载技能后的唯一准备入口」，坏掉就等于技能无法自举。
//
// 只测**只读**分支（--check-only / 错误 bash），不在这里跑 bootstrap——那会改 node_modules，
// 且 bootstrap 自身有 CI 的 test-windows 覆盖。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(REPO, "scripts", "skill-ready.mjs");
const VENDOR = join(REPO, "vendor", "skills");

const run = (args, env = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, ...env },
  });

test("skill-ready --check-only --json：输出可解析，且退出码与 status 一致", () => {
  const r = run(["--check-only", "--json"]);
  const out = String(r.stdout ?? "");
  const parsed = JSON.parse(out); // 解析失败即说明契约破了（机器可读是本脚本的用途之一）
  assert.ok(["READY", "NOT_READY"].includes(parsed.status), `status 非法：${parsed.status}`);
  const names = (parsed.checks ?? []).map((c) => c.name);
  assert.ok(names.includes("hf-cli"), `缺 hf-cli 检查项：${names.join(",")}`);
  assert.ok(names.includes("skills"), `缺 skills 检查项：${names.join(",")}`);
  assert.equal(r.status, parsed.status === "READY" ? 0 : 1, `退出码 ${r.status} 与 status ${parsed.status} 不一致`);
  // 每项都必须给出可行动的 detail，不能只有布尔值。
  for (const c of parsed.checks) assert.ok(String(c.detail ?? "").length > 0, `${c.name} 缺少 detail`);
});

test("skill-ready：HARNESS_BASH 指向不存在的路径时必须 fail-closed 并指明出口", () => {
  const bogus = process.platform === "win32" ? "C:\\definitely-no\\bash.exe" : "/definitely-no/bash";
  const r = run(["--check-only", "--json"], { HARNESS_BASH: bogus });
  assert.equal(r.status, 1, "指定了不存在的 bash 却返回成功");
  const parsed = JSON.parse(String(r.stdout ?? ""));
  assert.equal(parsed.status, "NOT_READY");
  assert.match(String(parsed.error ?? ""), /HARNESS_BASH/u, "错误信息必须点明 HARNESS_BASH 这个出口");
});

test("skill-ready：vendor 缺失时判 NOT_READY，就位时判 READY（与真实磁盘状态一致）", () => {
  const r = run(["--check-only", "--json"]);
  const parsed = JSON.parse(String(r.stdout ?? ""));
  const skills = (parsed.checks ?? []).find((c) => c.name === "skills");
  assert.ok(skills, "缺 skills 检查项");
  if (existsSync(VENDOR)) {
    assert.equal(skills.ok, true, `vendor 在场却判失败：${skills.detail}`);
    assert.match(skills.detail, /[0-9a-f]{12}/u, "就位时必须给出 vendor commit 证据");
  } else {
    assert.equal(skills.ok, false, "vendor 缺失却判通过——门禁形同虚设");
    assert.match(skills.detail, /vendor/u, "失败原因必须指向 vendor");
    assert.equal(parsed.status, "NOT_READY");
  }
});
