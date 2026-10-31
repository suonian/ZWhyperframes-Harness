// 仓库内路径形态的回归锁。
//
// 这组用例锁的是一类**静默失效**：路径形态错了不会报「路径错」，
// 而是报一个下游的、看起来毫不相关的错（MODULE_NOT_FOUND / ENOENT /
// "必需项未通过"），排查成本极高。
//
// 三个真实缺陷（都是本机实测坐实的，不是推断）：
//   1. scripts/doctor.sh:25 把 MSYS 的 POSIX **绝对**路径直接交给原生 node。
//      登录 shell 预置 MSYS_NO_PATHCONV=1（Git Bash 的 /etc/profile），
//      参数转换被关闭 → /d/foo 原样送达 → node 解析成 <当前盘>\d\foo →
//      MODULE_NOT_FOUND。后果：**官方 doctor 的整份结论丢失**，却报成
//      「必需项未通过」——假阴性，把排查带偏。
//      非登录 shell（bash -c）正常 → 只用非登录 shell 测就永远测不出来。
//   2. scripts/install-skill.sh 同源更严重：登录 shell 下直接 MODULE_NOT_FOUND
//      中止（set -e），技能装不上。
//   3. scripts/bootstrap.sh 的 vendor 哈希用 `xargs $hasher`：文件名含空格
//      就被按空白切词拆开，报 "No such file or directory"，且在
//      set -euo pipefail 下无声中止（exit 123，没有错误提示）。
//
// 约定（AGENTS.md「跨平台」节）：**仓库内的路径一律用相对仓库根的相对路径**；
// 只有仓库外的路径（用户发现目录、产品段目录、临时目录）才需要转换。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmp } from "./lib/tmp.mjs";
import { findBash } from "./lib/shell.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASH = findBash();
if (!BASH) {
  throw new Error(
    "未找到可用的 bash。本仓的 bootstrap.sh / doctor.sh / install-skill.sh / hf-env.sh " +
      "都需要 bash；Windows 上请安装 Git for Windows（Git Bash），或把 bash 放进 PATH。",
  );
}

const CLI_PRESENT = existsSync(join(REPO_ROOT, "node_modules", "hyperframes", "package.json"));

/**
 * 在指定 shell 形态下跑一段 bash。
 *
 * `login: true` 走 `bash -lc`（读 /etc/profile 与 ~/.bash_profile）——
 * Git Bash 的登录 shell 会预置 MSYS_NO_PATHCONV=1，**这正是缺陷 1/2 的触发条件**。
 * `login: false` 走 `bash -c`。
 */
function runBash(code, { login = false, env = {} } = {}) {
  const args = login ? ["-lc", code] : ["-c", code];
  return spawnSync(BASH, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 10 * 60 * 1000,
    windowsHide: true,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME ?? process.env.USERPROFILE,
      ...env,
      // 登录 shell 自己会设 MSYS_NO_PATHCONV；这里不预设，让它按平台真实行为走。
    },
  });
}

test("登录 shell 下 doctor.sh 必须跑完并给出官方 doctor 结论（不得丢结论）", () => {
  const r = runBash("bash scripts/doctor.sh", { login: true });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  assert.ok(
    !/Cannot find module|MODULE_NOT_FOUND/u.test(out),
    `登录 shell 下 doctor 的 node 脚本路径失效（结论会整份丢失）：\n${out}`,
  );
  assert.match(out, /\[doctor\]/u, `doctor.sh 没有产出任何结论行：\n${out}`);
  if (CLI_PRESENT) {
    // CLI 在场时，官方 doctor 的判定行必须出现 —— 它只可能来自 doctor-report.mjs
    // 成功解析了 payload。缺它就说明结论被丢弃了。
    assert.match(
      out,
      /官方 doctor/u,
      `CLI 已安装却没有官方 doctor 判定行（结论被丢弃）：\n${out}`,
    );
  }
});

test("非登录 shell 下 doctor.sh 的结论与登录 shell 一致（路径形态不得依赖 shell 形态）", () => {
  const login = runBash("bash scripts/doctor.sh", { login: true });
  const plain = runBash("bash scripts/doctor.sh", { login: false });
  const norm = (text) =>
    String(text ?? "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("[doctor]"))
      .join("\n");
  assert.equal(
    norm(login.stdout),
    norm(plain.stdout),
    "登录/非登录 shell 的 doctor 结论不一致——说明有路径形态依赖 shell 形态",
  );
});

test("登录 shell 下 install-skill.sh 必须安装成功", () => {
  const dir = tmp("zw-install-");
  const r = runBash(`bash scripts/install-skill.sh --dir "${dir}"`, { login: true });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  assert.ok(
    !/Cannot find module|MODULE_NOT_FOUND/u.test(out),
    `登录 shell 下 install-skill.sh 的 node 路径失效：\n${out}`,
  );
  assert.equal(r.status, 0, `install-skill.sh 失败：\n${out}`);
  assert.ok(existsSync(join(dir, "zwhyperframes-harness", "SKILL.md")), "安装产物缺少 SKILL.md");
});

test("内容树哈希必须能处理文件名里的空格（不得按空白切词）", () => {
  const dir = tmp("zw-treehash-");
  mkdirSync(join(dir, "My Dir"), { recursive: true });
  writeFileSync(join(dir, "My Dir", "f.txt"), "hello\n");
  writeFileSync(join(dir, "plain.txt"), "world\n");

  const script = `
    set -euo pipefail
    source "${join(REPO_ROOT, "scripts", "lib", "tree-hash.sh").replace(/\\/gu, "/")}"
    tree_hash "${dir.replace(/\\/gu, "/")}"
  `;
  const r = runBash(script, { login: false });
  assert.equal(r.status, 0, `tree_hash 执行失败（文件名含空格时被切词）：\n${r.stdout}\n${r.stderr}`);
  const hash = String(r.stdout ?? "").trim();
  assert.match(hash, /^[0-9a-f]{40,64}$/u, `tree_hash 输出不是哈希：${hash}`);

  // 哈希必须与安装位置无关：把同一棵树复制到别处，哈希不变。
  const other = tmp("zw-treehash2-");
  cpSync(dir, other, { recursive: true });
  const script2 = `
    set -euo pipefail
    source "${join(REPO_ROOT, "scripts", "lib", "tree-hash.sh").replace(/\\/gu, "/")}"
    tree_hash "${other.replace(/\\/gu, "/")}"
  `;
  const r2 = runBash(script2, { login: false });
  assert.equal(r2.status, 0, `tree_hash 第二次执行失败：\n${r2.stdout}\n${r2.stderr}`);
  assert.equal(
    String(r2.stdout ?? "").trim(),
    hash,
    "同一棵树放在不同位置得到不同哈希——说明把安装位置也算进内容了",
  );

  // 内容变了，哈希必须变。
  writeFileSync(join(dir, "plain.txt"), "changed\n");
  const script3 = `
    set -euo pipefail
    source "${join(REPO_ROOT, "scripts", "lib", "tree-hash.sh").replace(/\\/gu, "/")}"
    tree_hash "${dir.replace(/\\/gu, "/")}"
  `;
  const r3 = runBash(script3, { login: false });
  assert.notEqual(String(r3.stdout ?? "").trim(), hash, "内容改了哈希没变——哈希没有覆盖内容");
});

test("仓库内脚本不得把 MSYS 的绝对 POSIX 路径直接交给原生 node", () => {
  // 结构式守卫：这类 bug 只有在登录 shell 下才发作，靠逐个脚本试跑挡不住。
  // 规则：node 的实参必须是**相对路径**（相对仓库根），或经 native_path 转换。
  const scriptsDir = join(REPO_ROOT, "scripts");
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, name.name);
      if (name.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.name.endsWith(".sh")) continue;
      const text = readFileSync(abs, "utf8");
      for (const m of text.matchAll(/node\s+"([^"]+)"/gu)) {
        const arg = m[1];
        if (arg.startsWith("$")) continue; // 变量来源另行人工确认
        if (arg.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(arg)) {
          offenders.push(`${name.name}: node "${arg}"`);
        }
      }
      // 直接把仓库根的绝对路径塞给 node 的写法（无 native_path 包裹）
      for (const m of text.matchAll(/node\s+"\$HARNESS_ROOT[^"]*"/gu)) {
        offenders.push(`${name.name}: node "${m[0]}"`);
      }
    }
  };
  walk(scriptsDir);
  assert.deepEqual(
    offenders,
    [],
    `这些写法把绝对路径交给原生 node（登录 shell 下会失效）：\n${offenders.join("\n")}`,
  );
});
