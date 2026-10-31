// animation-map.mjs — 官方 animation-map.json 的**内容**断言
//
// 为什么：官方脚本把判据都算出来了（deadZones / staggers / tween flags），
// 但本仓的 gate 之前只验「文件存在且非空」——**结论全被丢弃**。
// 而且官方脚本本身**恒 exit 0、无 verdict、无 severity**，官方 prose 文档
// 零记录任何阈值。所以「哪个 flag 该阻断」是**本仓自定的政策**，在这里定档。
//
// 阻断级（真缺陷：动画根本没发生 / 画面静止）：
//   · degenerate  —— 采样到的盒子全是零宽或零高，这个补间等于没动
//   · invisible   —— 补间全程 opacity < 0.01，等于什么都没显示
//   · deadZones   —— 连续 ≥1s 没有任何补间在跑（画面静止）
// 告警级（风格问题，不阻断，但必须让人看见）：
//   · offscreen / paced-fast / paced-slow / collision / stagger 不一致
//
// 为什么 collision 只告警：内容重叠已被官方 `check --strict` 的 content_overlap
// （held 500ms 即 error）覆盖，本仓不重复阻断，只在 animation-map 侧提示。
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { requireOfficialScript } from "./official-skills.mjs";
import { checkOfficialDeps, officialSkillEnv } from "./official-deps.mjs";

export const BLOCKING_FLAGS = new Set(["degenerate", "invisible"]);
export const WARNING_FLAGS = new Set(["offscreen", "paced-fast", "paced-slow", "collision"]);
export const DEAD_ZONE_MIN_SEC = 1.0; // 官方 findDeadZones 的同款阈值

/** 官方 animation-map 产物的相对路径（官方默认输出目录）。 */
export const ANIMATION_MAP_REL = join(".hyperframes", "anim-map", "animation-map.json");

/**
 * 调用**官方** animation-map 脚本生成产物。
 *
 * 为什么由本仓代跑：官方脚本自身不带依赖，它通过 package-loader.mjs 解析
 * @hyperframes/producer 与 @hyperframes/core（都不在 hyperframes CLI 包里）。
 * 缺包时官方 loader 的退路有两条，都不可接受：
 *   · 一次性临时 bootstrap——装到 tmp 目录、跑完即删，于是**每跑一次就重下一次
 *     ~100MB 依赖**；
 *   · 推不出版本时默认 @latest——静默漂移（实测上游 latest 已到 0.8.223）。
 * scripts/lib/official-deps.mjs 把依赖按锁定版本装进仓库 node_modules，
 * 这里再把 HYPERFRAMES_SKILL_PKG_VERSION 显式钉死，官方脚本从此没有 @latest 退路。
 *
 * cwd 必须是段目录：官方脚本用 resolve(".hyperframes/anim-map") 决定输出目录，
 * resolve 相对 **cwd** 而不是 composition 目录——cwd 不对，产物就落到别处。
 */
export function runOfficialAnimationMap(segmentDir, { outDir = null, timeoutMs = 15 * 60 * 1000 } = {}) {
  const script = requireOfficialScript("hyperframes-animation", "scripts/animation-map.mjs");
  const dir = resolve(segmentDir);
  // 官方脚本用 resolve(args.out ?? ".hyperframes/anim-map") 决定输出目录，
  // resolve 相对 **cwd**；cwd 已是段目录，所以默认落在 <段目录>/.hyperframes/anim-map。
  // 指定 outDir 时传绝对路径，避免 resolve 再次解释相对路径。
  const args = [script, dir];
  if (outDir) args.push("--out", resolve(outDir));
  const result = spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...officialSkillEnv() },
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ? String(result.error.message ?? result.error) : null,
    deps: checkOfficialDeps(),
    outPath: join(outDir ? resolve(outDir) : dir, "animation-map.json"),
  };
}

/**
 * 读取并断言 animation-map.json。
 * @returns {{ok:boolean, findings:string[], warnings:string[], facts:object}}
 */
export function assertAnimationMap(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { ok: false, findings: [`animation-map.json 无法解析：${path}`], warnings: [], facts: {} };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    return { ok: false, findings: [`animation-map.json 为空或形状非法：${path}`], warnings: [], facts: {} };
  }

  const findings = [];
  const warnings = [];
  const tweens = Array.isArray(parsed.tweens) ? parsed.tweens : [];
  const deadZones = Array.isArray(parsed.deadZones) ? parsed.deadZones : [];
  const staggers = Array.isArray(parsed.staggers) ? parsed.staggers : [];
  const density = Array.isArray(parsed.density) ? parsed.density : [];

  // 死区：画面静止 ≥1s（官方 findDeadZones 的同款阈值）
  for (const zone of deadZones) {
    const start = Number(zone.start);
    const end = Number(zone.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end - start >= DEAD_ZONE_MIN_SEC) {
      findings.push(`存在 ${(end - start).toFixed(2)}s 的死区（${start.toFixed(2)}–${end.toFixed(2)}s）：这段时间画面完全没有补间在跑（规则书 §1 全时长揭示 / 禁 front-load）`);
    }
  }

  // tween flags
  const flagCounts = {};
  for (const tween of tweens) {
    const flags = Array.isArray(tween.flags) ? tween.flags : [];
    for (const flag of flags) {
      flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
      const selector = tween.selector ?? "(未知元素)";
      if (BLOCKING_FLAGS.has(flag)) {
        findings.push(`补间 ${selector} 命中阻断级 flag「${flag}」：这个动画等于没发生`);
      } else if (WARNING_FLAGS.has(flag)) {
        warnings.push(`补间 ${selector} 命中告警级 flag「${flag}」`);
      }
    }
  }

  // stagger 一致性：官方判据 maxDrift < avgInterval * 0.3
  for (const stagger of staggers) {
    if (stagger.consistent === false) {
      warnings.push(
        `stagger 不一致：${(stagger.elements ?? []).join(", ")}（avgInterval ${stagger.avgInterval}s，官方判据 maxDrift < avgInterval×0.3）`,
      );
    }
  }

  // 密度分布：前半段有补间、后半段完全没有 → front-load
  if (density.length >= 4) {
    const half = Math.floor(density.length / 2);
    const headActive = density.slice(0, half).reduce((sum, d) => sum + (Number(d.activeTweens) || 0), 0);
    const tailActive = density.slice(half).reduce((sum, d) => sum + (Number(d.activeTweens) || 0), 0);
    if (headActive > 0 && tailActive === 0) {
      warnings.push("补间全部集中在前半段，后半段没有任何补间在跑（front-load）");
    }
  }

  const facts = {
    tweenCount: tweens.length,
    deadZoneCount: deadZones.length,
    staggerCount: staggers.length,
    densityBuckets: density.length,
    flagCounts,
  };
  return { ok: findings.length === 0, findings, warnings, facts };
}
