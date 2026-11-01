#!/usr/bin/env node
// skill-ready.mjs — 技能准备入口：找 bash → 幂等 bootstrap → 复检 → READY/NOT_READY。
// 用法：[--check-only] [--doctor] [--json]；HARNESS_BASH=... 可指定 bash；退出码 0=READY。
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { HARNESS_ROOT, HF_EXPECTED_VERSION } from "./lib/harness.mjs";
const A = new Set(process.argv.slice(2));
const CHECK_ONLY = A.has("--check-only");
const WITH_DOCTOR = A.has("--doctor");
const JSON_OUT = A.has("--json");
const WIN = process.platform === "win32";
const VENDOR = join(HARNESS_ROOT, "vendor", "skills");
const STAMP = join(HARNESS_ROOT, "vendor", ".skills-commit");
const SENTINELS = ["faceless-explainer/SKILL.md", "hyperframes-animation/scripts/animation-map.mjs", "hyperframes-core/references/review-loop.md"];

function probe(p) {
  const r = spawnSync(p, ["-c", "uname -s"], { encoding: "utf8", timeout: 20_000 });
  const u = String(r.stdout ?? "").trim();
  if (r.status !== 0 || !u) return null;
  if (WIN && !/^(MINGW|MSYS|CYGWIN)/u.test(u)) return null;
  return { path: p, uname: u };
}

function fromRegistry() {
  for (const h of ["HKLM", "HKCU"]) {
    const r = spawnSync("reg", ["query", `${h}\\SOFTWARE\\GitForWindows`, "/v", "InstallPath"], { encoding: "utf8", timeout: 15_000 });
    const m = /InstallPath\s+REG_SZ\s+(.+)/u.exec(String(r.stdout ?? ""));
    if (m && existsSync(join(m[1].trim(), "bin", "bash.exe"))) return join(m[1].trim(), "bin", "bash.exe");
  }
  return null;
}

function findBash() {
  if (process.env.HARNESS_BASH) {
    return probe(process.env.HARNESS_BASH) ?? { error: `HARNESS_BASH 不可用：${process.env.HARNESS_BASH}` };
  }
  const c = [];
  if (process.env.EXEPATH) c.push(join(process.env.EXEPATH, "bash.exe"));
  if (process.env.BASH) c.push(process.env.BASH);
  if (WIN) {
    if (/^[A-Za-z]:\\/u.test(process.env.SHELL ?? "")) c.push(process.env.SHELL);
    for (const b of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]) {
      if (b) c.push(join(b, "Git", "bin", "bash.exe"), join(b, "Programs", "Git", "bin", "bash.exe"));
    }
    const w = spawnSync("where.exe", ["bash"], { encoding: "utf8", timeout: 15_000 });
    c.push(...String(w.stdout ?? "").split(/\r?\n/u).map((s) => s.trim()).filter(Boolean), fromRegistry());
  } else {
    c.push("/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "bash");
  }
  for (const p of c) {
    if (!p) continue;
    if (WIN && !/[\\/]bash(\.exe)?$/u.test(p)) continue;
    if (!WIN && /[\\/]/u.test(p) && !existsSync(p)) continue;
    const ok = probe(p);
    if (ok) return ok;
  }
  return {
    error: WIN
      ? "未找到可用的 Git Bash：请装 Git for Windows，或用 HARNESS_BASH 指定 bash（PowerShell 的 bash 常是 WSL 存根）"
      : "未找到可用的 bash（预期 /bin/bash）",
  };
}

function checkCli() {
  const p = join(HARNESS_ROOT, "node_modules", "hyperframes", "package.json");
  if (!existsSync(p)) return { ok: false, detail: "node_modules/hyperframes 缺失（未 bootstrap）" };
  let v = "";
  try {
    v = JSON.parse(readFileSync(p, "utf8")).version ?? "";
  } catch {
    return { ok: false, detail: "hyperframes/package.json 不可解析" };
  }
  return v === HF_EXPECTED_VERSION ? { ok: true, detail: v } : { ok: false, detail: `${v || "未知"} ≠ 锁定 ${HF_EXPECTED_VERSION}` };
}

function checkSkills() {
  if (!existsSync(VENDOR)) return { ok: false, detail: "vendor/skills 不存在（未取回官方 skills）" };
  const miss = SENTINELS.filter((r) => !existsSync(join(VENDOR, r)));
  if (miss.length) return { ok: false, detail: `缺关键产物：${miss.join(", ")}` };
  try {
    return { ok: true, detail: `${readFileSync(STAMP, "utf8").trim().slice(0, 12)}（${readdirSync(VENDOR).filter((x) => !x.startsWith(".")).length} 项）` };
  } catch {
    return { ok: false, detail: "缺 vendor/.skills-commit" };
  }
}

const run = (b, s) => spawnSync(b, ["-c", `bash ${s}`], { cwd: HARNESS_ROOT, encoding: "utf8", timeout: 30 * 60 * 1000, env: process.env });
const tail = (t, n = 20) => String(t ?? "").trim().split(/\r?\n/u).slice(-n).join("\n");

function finish(checks, x) {
  const ok = checks.every((c) => c.ok) && x.doctorOk !== false;
  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify({ status: ok ? "READY" : "NOT_READY", root: HARNESS_ROOT, ...x, checks }, null, 2)}\n`);
  } else {
    process.stdout.write(`[skill-ready] root      : ${HARNESS_ROOT}\n[skill-ready] bash      : ${x.bash}\n[skill-ready] bootstrap : ${x.bootstrap}\n`);
    for (const c of checks) process.stdout.write(`[skill-ready] ${String(c.name).padEnd(8)}: ${c.ok ? "✓" : "✗"} ${c.detail}\n`);
    if (x.doctor) process.stdout.write(`[skill-ready] doctor    : ${x.doctor}\n`);
    process.stdout.write(`[skill-ready] 结论      : ${ok ? "READY" : "NOT_READY"}\n`);
  }
  process.exit(ok ? 0 : 1);
}

const bash = findBash();
if (bash.error) {
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ status: "NOT_READY", error: bash.error }, null, 2)}\n`);
  else process.stderr.write(`[skill-ready] ✗ ${bash.error}\n`);
  process.exit(1);
}

let boot = "跳过（--check-only）";
if (!CHECK_ONLY) {
  const r = run(bash.path, "scripts/bootstrap.sh");
  if (r.status !== 0) {
    process.stderr.write(`[skill-ready] ✗ bootstrap 失败（exit ${r.status}）：\n${tail(r.stdout)}\n${tail(r.stderr)}\n`);
    if (JSON_OUT) process.stdout.write(`${JSON.stringify({ status: "NOT_READY", bash: bash.path, bootstrap: "failed", exit: r.status }, null, 2)}\n`);
    process.exit(1);
  }
  boot = "执行成功（幂等；已就绪时不重新取回 skills）";
}

const x = { bash: bash.path, bootstrap: boot };
if (WITH_DOCTOR) {
  const r = run(bash.path, "scripts/doctor.sh");
  x.doctorOk = r.status === 0;
  x.doctor = x.doctorOk ? "全绿" : `✗（exit ${r.status}）`;
  if (!x.doctorOk) process.stderr.write(`${tail(r.stdout, 12)}\n`);
}

finish([{ name: "hf-cli", ...checkCli() }, { name: "skills", ...checkSkills() }], x);
