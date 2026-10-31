// motion-spec.mjs — 生成官方 `*.motion.json` 运动意图 sidecar
//
// 为什么需要它：
//   官方 `check` 的 motion 阶段**默认是关的**（实测：无 sidecar 时
//   `motion.enabled=false, samples=0`）。官方文档原话：
//   "With no sidecar, `check` behaves exactly as before."
//   也就是说：官方那条「最接近自动看片的代理检查」在本仓**一直是零覆盖**——
//   不是没跑，是压根没启用。本模块把运动意图写成官方 sidecar，让它真的跑起来。
//
// 断言从哪里来（不发明）：
//   · **hero 早可见 t≤0.5s** → 规则书 §1 官方合同摘要明文。
//     hero 由帧 HTML 里 `data-motion-role="hero"` 声明（帧 worker 知道哪个是主体）。
//   · **跨帧顺序** → 后一帧的主体必须晚于前一帧出现（before）。
//   · **不出画** → 规则书 §2 画布安全边界（staysInFrame）。
//   · 时间基准用 index.html 的 data-start（装配事实），不是 STORYBOARD 的时长求和。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readStoryboard, readFrameTimeline } from "./storyboard.mjs";

const HERO_ATTR = "data-motion-role";
const HERO_ROLE = "hero";
const HERO_BY_SEC = 0.5; // 规则书 §1：hero 早可见（t ≤ 0.5s）

/** 从一份帧 HTML 里找出声明为 hero 的元素 id。 */
export function findHeroIds(html) {
  const ids = [];
  const re = /<([a-zA-Z][\w-]*)\b[^>]*\bid="([^"]+)"[^>]*>/gu;
  for (const m of html.matchAll(re)) {
    const tag = m[0];
    if (!new RegExp(`${HERO_ATTR}\\s*=\\s*["']${HERO_ROLE}["']`, "u").test(tag)) continue;
    ids.push(m[2]);
  }
  return ids;
}

/**
 * 构造 sidecar。
 *
 * fail-closed 的地方：
 *   · 帧没有声明 hero → 直接抛错（不猜、不跳过）。理由：hero 是规则书 §1 的硬要求，
 *     猜错等于把这条检查变成恒绿。
 *   · 一帧声明了多个 hero → 抛错（断言对象不唯一 = 检查无意义）。
 *   · 两个帧的 hero id 相同 → 抛错（选择器在成片时间轴上不唯一）。
 */
export function buildMotionSpec(segmentDir) {
  const board = readStoryboard(segmentDir);
  const timeline = readFrameTimeline(segmentDir);
  const heroes = [];
  const problems = [];

  for (const frame of board.frames) {
    const slot = timeline.find((entry) => entry.number === frame.number);
    const src = String(frame.meta.src ?? "");
    if (!src) {
      problems.push(`帧 ${frame.number} 没有 src（无法定位它的帧 HTML）`);
      continue;
    }
    const htmlPath = join(segmentDir, src);
    if (!existsSync(htmlPath)) {
      problems.push(`帧 ${frame.number} 的 src 不存在：${src}`);
      continue;
    }
    const ids = findHeroIds(readFileSync(htmlPath, "utf8"));
    if (ids.length === 0) {
      problems.push(
        `帧 ${frame.number}（${src}）没有声明主体元素：` +
          `需要一个带 ${HERO_ATTR}="${HERO_ROLE}" 的元素（规则书 §1「hero 早可见 t≤0.5s」要能自动校验）`,
      );
      continue;
    }
    if (ids.length > 1) {
      problems.push(`帧 ${frame.number}（${src}）声明了 ${ids.length} 个主体元素（${ids.join(", ")}）：断言对象必须唯一`);
      continue;
    }
    heroes.push({ frame: frame.number, id: ids[0], start: slot ? slot.start : 0 });
  }

  if (problems.length) {
    throw new Error(`motion sidecar 无法生成：\n  · ${problems.join("\n  · ")}`);
  }

  const seen = new Map();
  for (const hero of heroes) {
    if (seen.has(hero.id)) {
      problems.push(`主体 id 重复：${hero.id}（帧 ${seen.get(hero.id)} 与帧 ${hero.frame}）——选择器在成片时间轴上不唯一`);
    } else {
      seen.set(hero.id, hero.frame);
    }
  }
  if (problems.length) throw new Error(`motion sidecar 无法生成：\n  · ${problems.join("\n  · ")}`);

  const duration = timeline.reduce((sum, entry) => sum + (entry.duration || 0), 0);
  const assertions = [];
  for (const hero of heroes) {
    // hero 早可见：按**该帧在成片里的起点**换算成绝对时间。
    //
    // 首帧额外收紧到 bySec=0：规则书 §2「首帧规则」说的是「0–2 秒必须有可辨认的
    // 价值……禁纯色等待」——如果首帧的主体还没出现，后面 0.5s 内出现也算「纯色等待」。
    // 首帧是唯一能被「首帧规则」直接表达的位置，所以按 0 判。
    // 其余帧按「帧起点 + 0.5s」（规则书 §1：hero 早可见 t ≤ 0.5s）。
    const bySec = hero.start <= 0 ? 0 : +(hero.start + HERO_BY_SEC).toFixed(3);
    assertions.push({ kind: "appearsBy", selector: `#${hero.id}`, bySec });
    assertions.push({ kind: "staysInFrame", selector: `#${hero.id}` });
  }
  for (let i = 0; i < heroes.length - 1; i += 1) {
    assertions.push({ kind: "before", a: `#${heroes[i].id}`, b: `#${heroes[i + 1].id}` });
  }

  return {
    spec: { duration: +duration.toFixed(3), assertions },
    heroes,
    timeline,
  };
}

/** 生成并写入 `<segmentDir>/index.motion.json`（官方 check 自动发现同目录同基名的 sidecar）。 */
export function writeMotionSpec(segmentDir) {
  const { spec, heroes } = buildMotionSpec(segmentDir);
  const path = join(segmentDir, "index.motion.json");
  const text = `${JSON.stringify(spec, null, 2)}\n`;
  // 幂等 + 确定性：内容相同就不写盘，避免无谓的文件时间戳变动。
  if (!existsSync(path) || readFileSync(path, "utf8") !== text) writeFileSync(path, text);
  return { path, spec, heroes };
}
