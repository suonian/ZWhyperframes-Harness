// 官方 skill 依赖的**版本钉死**回归锁。
//
// 【为什么需要这道锁】
// 官方 skills/hyperframes-animation/scripts/animation-map.mjs 自带依赖解析：
// 它要 @hyperframes/producer 与 @hyperframes/core（两者**不在** hyperframes CLI 包里），
// 由 vendor/skills/hyperframes-animation/scripts/package-loader.mjs 负责。
// 官方 loader 的两条退路对本仓都不可接受：
//   1. 缺包时装到 tmp 目录、跑完即删 → 每跑一次 animation-map 就重下 ~100MB；
//   2. 推不出版本时**默认用 @latest**，只打印一行 stderr —— 实测上游 latest 已是
//      0.8.223，与锁定值差 187 个补丁版，而这条漂移是**静默**的。
//
// 根因：官方靠 readBundledHyperframesVersion() 从自身所在目录的祖先链里找名为
// hyperframes / @hyperframes/cli 的 package.json 推断版本；本仓的包名是
// zwhyperframes-harness，推断必然落空。
//
// 所以本仓做两件事：bootstrap 按锁定版本把依赖装进仓库 node_modules；
// hf-env.sh 导出 HYPERFRAMES_SKILL_PKG_VERSION 把官方 loader 的推断**显式钉死**。
// 这道锁防的是「钉死机制被悄悄拆掉」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  OFFICIAL_SKILL_PKG_TRANSITIVES,
  OFFICIAL_SKILL_PKGS,
  OFFICIAL_SKILL_PKG_VERSION,
  checkOfficialDeps,
  installedOfficialPkgVersion,
  officialPkgSpecs,
  officialSkillEnv,
} from "../scripts/lib/official-deps.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOADER = join(REPO_ROOT, "vendor", "skills", "hyperframes-animation", "scripts", "package-loader.mjs");
// vendor/skills 由 bootstrap 按锁定 commit 取回。CI 的 windows-smoke 刻意**不**跑
// bootstrap（它只验 Node / 测试 / Git Bash 边界），此时官方产物不存在——
// 依赖官方 skill 的用例必须**跳过**并写明原因，而不是把「没取回」当成失败
// （那会让 smoke job 永远红，也会掩盖真正的缺陷）。
const NO_VENDOR_REASON = existsSync(LOADER)
  ? false
  : "需要官方 hyperframes-animation skill（先运行 npm run bootstrap）";

/** 直接调用**官方**的版本推断函数，看它在本仓布局下会给出什么。 */
function officialSpec(env) {
  if (!existsSync(LOADER)) return null;
  const code =
    `import(${JSON.stringify(pathToFileURL(LOADER).href)})` +
    `.then((m) => { process.stdout.write(m.hyperframesPackageSpec("@hyperframes/core")); })` +
    `.catch((e) => { process.stderr.write(String(e)); process.exit(9); });`;
  const r = spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 60_000,
  });
  if (r.status !== 0) return { error: (r.stderr ?? "").trim(), stdout: (r.stdout ?? "").trim() };
  return { stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

test("官方 loader 在本仓布局下确实会退回 @latest（危险真实存在）", { skip: NO_VENDOR_REASON }, () => {
  const result = officialSpec({ HYPERFRAMES_SKILL_PKG_VERSION: "" });
  assert.ok(result, "vendor/skills 未取回，本用例无法判定");
  assert.equal(result.error, undefined, `官方 loader 导入失败：${result.error}`);
  assert.equal(
    result.stdout,
    "@hyperframes/core@latest",
    "官方 loader 在本仓布局下居然推出了版本——若属实说明推断路径变了，本用例需重新评估",
  );
  assert.match(result.stderr, /using @latest/u, "官方 loader 应打印 @latest 退路提示");
});

test("官方 loader 在 HYPERFRAMES_SKILL_PKG_VERSION 钉死后必须给出精确版本", { skip: NO_VENDOR_REASON }, () => {
  const result = officialSpec({ HYPERFRAMES_SKILL_PKG_VERSION: OFFICIAL_SKILL_PKG_VERSION });
  assert.ok(result, "vendor/skills 未取回，本用例无法判定");
  assert.equal(result.error, undefined, `官方 loader 导入失败：${result.error}`);
  assert.equal(
    result.stdout,
    `@hyperframes/core@${OFFICIAL_SKILL_PKG_VERSION}`,
    "钉死版本后官方 loader 仍给出别的版本——钉死机制失效",
  );
  assert.doesNotMatch(result.stderr, /using @latest/u, "钉死版本后不应再出现 @latest 退路提示");
});

test("officialSkillEnv 必须同时钉住版本并开启官方的一次性引导", () => {
  const env = officialSkillEnv();
  assert.equal(env.HYPERFRAMES_SKILL_PKG_VERSION, OFFICIAL_SKILL_PKG_VERSION);
  assert.equal(env.HYPERFRAMES_SKILL_BOOTSTRAP_DEPS, "1");
  assert.equal(OFFICIAL_SKILL_PKG_VERSION, "0.8.36", "锁定版本被改动——它是本仓的单一真源");
});

test("安装规格逐个钉死版本，不允许范围或 latest", () => {
  const specs = officialPkgSpecs();
  assert.ok(specs.includes("@hyperframes/core@0.8.36"), "必须包含 @hyperframes/core");
  assert.ok(specs.includes("@hyperframes/producer@0.8.36"), "必须包含 @hyperframes/producer");
  for (const spec of specs) {
    assert.match(spec, /@0\.8\.36$/u, `规格 ${spec} 不是精确版本`);
    assert.doesNotMatch(spec, /[\^~*]|latest/u, `规格 ${spec} 含版本范围或 latest——会漂移`);
  }
  // producer 声明的传递依赖是 ^0.8.36，范围会飘（实测 engine 被解到 0.8.223）。
  for (const name of OFFICIAL_SKILL_PKG_TRANSITIVES) {
    assert.ok(specs.includes(`${name}@0.8.36`), `传递依赖 ${name} 未被钉死`);
  }
});

test("依赖核对：ok 时每个已装版本都必须等于锁定版本", () => {
  const result = checkOfficialDeps();
  assert.equal(typeof result.ok, "boolean");
  assert.equal(result.version, OFFICIAL_SKILL_PKG_VERSION);
  if (result.ok) {
    for (const [name, v] of Object.entries(result.installed)) {
      assert.equal(v, OFFICIAL_SKILL_PKG_VERSION, `${name} 版本不等于锁定值`);
    }
  } else {
    // 不 ok 时必须说清是缺包还是漂移，不能含糊。
    assert.ok(
      result.missing.length > 0 || result.drifted.length > 0,
      "不 ok 却既没报缺包也没报漂移——核对逻辑坏了",
    );
  }
  assert.equal(installedOfficialPkgVersion("@hyperframes/不存在的包"), null);
  for (const name of OFFICIAL_SKILL_PKGS) {
    assert.ok(name.startsWith("@hyperframes/"), `包名形态异常：${name}`);
  }
});

test("结构式守卫：官方依赖的钉死机制不能被悄悄拆掉", () => {
  const hfEnv = readFileSync(join(REPO_ROOT, "hf-env.sh"), "utf8");
  assert.match(
    hfEnv,
    /export HYPERFRAMES_SKILL_PKG_VERSION=/u,
    "hf-env.sh 必须导出 HYPERFRAMES_SKILL_PKG_VERSION，否则官方 loader 又会退回 @latest",
  );

  const bootstrap = readFileSync(join(REPO_ROOT, "scripts", "bootstrap.sh"), "utf8");
  assert.match(bootstrap, /official-deps\.mjs/u, "bootstrap 必须核对官方依赖");
  assert.match(bootstrap, /@hyperframes\/core@\$\{HF_EXPECTED_VERSION\}/u, "bootstrap 必须按锁定版本安装官方依赖");
  assert.match(bootstrap, /--no-save/u, "官方依赖不应写进 package.json（会进分发包并撑大包体）");

  // 仓库里任何脚本都不允许把 @latest 作为安装规格。
  const scriptDir = join(REPO_ROOT, "scripts");
  const targets = [
    join(REPO_ROOT, "hf-env.sh"),
    ...readdirSync(scriptDir)
      .filter((n) => n.endsWith(".sh") || n.endsWith(".mjs"))
      .map((n) => join(scriptDir, n)),
  ];
  for (const file of targets) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      assert.doesNotMatch(
        line,
        /npm\s+install[^\n]*@latest/u,
        `${file.replace(REPO_ROOT, ".")} 里出现了 @latest 安装规格——官方依赖必须钉死版本`,
      );
    }
  }
});

test("门禁确实接上了官方 animation-map 的调用入口", () => {
  const gate = readFileSync(join(REPO_ROOT, "scripts", "gate.mjs"), "utf8");
  assert.match(gate, /runOfficialAnimationMap/u, "gate 必须接入官方 animation-map 的调用");
  assert.match(gate, /--generate/u, "gate 必须提供 --generate：产物缺失时先调用官方脚本再断言");
  const lib = readFileSync(join(REPO_ROOT, "scripts", "lib", "animation-map.mjs"), "utf8");
  assert.match(lib, /officialSkillEnv/u, "调用官方脚本时必须带上钉死的版本环境变量");
  assert.ok(existsSync(join(REPO_ROOT, "scripts", "lib", "official-deps.mjs")));
});
