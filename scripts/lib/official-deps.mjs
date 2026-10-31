// official-deps.mjs — 官方 skill 脚本所需的 helper 依赖（唯一真源）
//
// 【背景】官方 skills/hyperframes-animation/scripts/animation-map.mjs 不自带依赖，
// 它通过 vendor/skills/hyperframes-animation/scripts/package-loader.mjs 解析
//   @hyperframes/producer、@hyperframes/core、@hyperframes/core/compiler
// 这三个包**不在** hyperframes CLI 包里——只装 CLI 时 node_modules/@hyperframes 根本不存在（实测）。
//
// 【官方 loader 的两条退路都不可接受】
//   1. 缺包时做「一次性临时 bootstrap」：装到 tmp 目录、跑完即删（官方 loader
//      自己的 bootstrapWithNpmInstall 最后 rmSync(installRoot)）。于是**每跑一次
//      animation-map 就重下一次 ~100MB 依赖**——生产链上不可接受。
//   2. 推不出锁定版本时**默认用 @latest**，只打印一行 stderr：
//      "hyperframes: could not determine the bundled version ... using @latest"。
//      实测上游 latest 已是 0.8.223，与本仓锁定的 0.8.36 差 187 个补丁版，
//      而这条漂移是**静默**的——产物照常生成，只是已经不是锁定的那个版本。
//      根因：官方 loader 靠 readBundledHyperframesVersion() 从**自身所在目录的祖先链**
//      里找名为 hyperframes / @hyperframes/cli 的 package.json 来推断版本；
//      本仓的 package.json 叫 zwhyperframes-harness，推断必然落空。
//
// 【本仓的做法】
//   · 按锁定版本把依赖装进**仓库** node_modules（bootstrap.sh 负责，幂等）；
//   · 用 HYPERFRAMES_SKILL_PKG_VERSION 把官方 loader 的版本推断**显式钉死**，
//     官方脚本从此不再有 @latest 退路；
//   · 传递依赖逐个钉死：producer 声明的是 ^0.8.36，范围会飘
//     （实测 @hyperframes/engine 被解到 0.8.223）。
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HARNESS_ROOT, HF_EXPECTED_VERSION } from "./harness.mjs";

/** 官方 animation-map 直接需要的包。 */
export const OFFICIAL_SKILL_PKGS = ["@hyperframes/core", "@hyperframes/producer"];

/**
 * 官方包的传递依赖：版本范围是 ^0.8.36，必须逐个钉到锁定版本，
 * 否则「锁定」只在顶层成立（实测 @hyperframes/engine 会被解到 0.8.223）。
 */
export const OFFICIAL_SKILL_PKG_TRANSITIVES = [
  "@hyperframes/engine",
  "@hyperframes/lint",
  "@hyperframes/parsers",
  "@hyperframes/studio-server",
];

export const OFFICIAL_SKILL_PKG_VERSION = HF_EXPECTED_VERSION;

/**
 * 跑官方 skill 脚本时必须带的环境变量。
 *
 * HYPERFRAMES_SKILL_PKG_VERSION —— 把官方 loader 的版本推断钉死，
 *   消除「推不出版本就退回 @latest」这条静默漂移通路。
 * HYPERFRAMES_SKILL_BOOTSTRAP_DEPS —— 官方 loader 的临时 bootstrap 开关。
 *   包已装好时它根本不会被触发；真缺包时它让官方 loader 走一次性临时安装
 *   （而不是在非 TTY 下直接抛错），而且那次安装也用上面钉住的版本，不是 @latest。
 */
export function officialSkillEnv() {
  return {
    HYPERFRAMES_SKILL_PKG_VERSION: OFFICIAL_SKILL_PKG_VERSION,
    HYPERFRAMES_SKILL_BOOTSTRAP_DEPS: "1",
  };
}

/** 读取某个官方包在仓库 node_modules 里的实际版本；未安装返回 null。 */
export function installedOfficialPkgVersion(name) {
  const manifest = join(HARNESS_ROOT, "node_modules", ...name.split("/"), "package.json");
  if (!existsSync(manifest)) return null;
  try {
    return JSON.parse(readFileSync(manifest, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/**
 * 核对官方依赖是否齐备且版本等于锁定版本。
 * @returns {{ok:boolean, missing:string[], drifted:string[], version:string, installed:object}}
 */
export function checkOfficialDeps() {
  const missing = [];
  const drifted = [];
  const installed = {};
  for (const name of [...OFFICIAL_SKILL_PKGS, ...OFFICIAL_SKILL_PKG_TRANSITIVES]) {
    const v = installedOfficialPkgVersion(name);
    installed[name] = v;
    if (!v) missing.push(name);
    else if (v !== OFFICIAL_SKILL_PKG_VERSION) drifted.push(`${name}@${v}`);
  }
  return {
    ok: missing.length === 0 && drifted.length === 0,
    missing,
    drifted,
    version: OFFICIAL_SKILL_PKG_VERSION,
    installed,
  };
}

/** npm 安装这些包时用的完整规格列表（顶层 + 传递依赖，逐个钉版本）。 */
export function officialPkgSpecs() {
  return [...OFFICIAL_SKILL_PKGS, ...OFFICIAL_SKILL_PKG_TRANSITIVES].map(
    (name) => `${name}@${OFFICIAL_SKILL_PKG_VERSION}`,
  );
}

// ── CLI：node scripts/lib/official-deps.mjs --check ─────────────────────
// 主模块判定沿用仓库既有做法（scripts/captions-zh.mjs）：两边都取 realpath 再比。
// Windows 的文件系统不区分大小写，argv[1] 与 import.meta.url 的大小写/分隔符可能不同，
// 纯字符串比较会判 false → 脚本静默什么都不做（exit 0、零输出）。
const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const result = checkOfficialDeps();
  if (result.ok) {
    console.log(
      `官方 skill 依赖齐备（${Object.keys(result.installed).length} 个包，全部 ${result.version}）`,
    );
    process.exit(0);
  }
  if (result.missing.length) console.error(`官方 skill 依赖缺失：${result.missing.join(", ")}`);
  if (result.drifted.length) {
    console.error(
      `官方 skill 依赖版本漂移（期望 ${result.version}）：${result.drifted.join(", ")}`,
    );
  }
  console.error("先运行 ./scripts/bootstrap.sh 按锁定版本安装。");
  process.exit(1);
}
