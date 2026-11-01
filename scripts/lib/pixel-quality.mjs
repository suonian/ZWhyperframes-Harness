// pixel-quality.mjs — 成片像素级质检（官方没有的能力，本仓补件）
//
// 为什么必须有它：
//   官方 `check` 的 motion 阶段数的是「元素的 opacity/transform 有没有变」，
//   不是「画面看起来有没有变」。实测两者会给出**相反**结论——同一支片子：
//     · 官方 keepsMoving（严格阈值）判「有运动」；
//     · 像素探针判「88.1% 的帧是静止的」。
//   前者会被「画面里只要有一个元素在动」掩盖（聚合稀释），
//   后者不会。规则书要的是后者（禁 front-load / 禁 PPT / 全时长揭示）。
//
// 方法论：判据一律落到**渲染像素**上——声称做过的事要能在像素上验证
// （docs/architecture/audit-2026-10-25-zero-trust-review.md 的同一原则）。
//
// 依赖：ffmpeg / ffprobe（与 media-probe.mjs 同一套外部依赖约定）。
// 实现不引入 numpy / PIL 等第三方库——门禁要在任何装了 ffmpeg 的机器上直接能跑。
import { spawnSync } from "node:child_process";

const GRAY_SCALE_DIVISOR = 10; // 1920×1080 → 192×108，足够判「画面有没有变」
const MAX_RAW_BYTES = 96 * 1024 * 1024; // 单次 rawvideo 读入上限
const PIXEL_CHANGE_THRESHOLD = 12; // 灰度差超过它才算「这个像素变了」
const COLOR_DISTANCE_THRESHOLD = 24; // 首帧：与背景色的距离超过它才算「主体」
const COLOR_QUANTIZE_SHIFT = 4; // 首帧配色统计的量化位数（压缩噪点不该算成不同颜色）

function probeVideo(mp4) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,avg_frame_rate,nb_frames,duration", "-of", "json", mp4],
    { encoding: "utf8", timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (r.error) return { ok: false, reason: `无法运行 ffprobe：${r.error.code ?? ""} ${r.error.message ?? ""}`.trim() };
  if (r.status !== 0) return { ok: false, reason: `ffprobe 失败（退出码 ${r.status}）：${(r.stderr ?? "").trim()}` };
  let parsed;
  try {
    parsed = JSON.parse(r.stdout ?? "{}");
  } catch {
    return { ok: false, reason: "ffprobe 输出无法解析" };
  }
  const stream = parsed.streams?.[0];
  if (!stream) return { ok: false, reason: "成片没有视频轨" };
  const [num, den] = String(stream.avg_frame_rate ?? "0/1").split("/").map(Number);
  const fps = den ? num / den : 0;
  return {
    ok: true,
    width: Number(stream.width) || 0,
    height: Number(stream.height) || 0,
    fps: Number.isFinite(fps) && fps > 0 ? fps : 0,
    nbFrames: Number(stream.nb_frames) || 0,
    duration: Number(stream.duration) || 0,
  };
}

/** 读整片灰度帧（缩放后）。返回按帧连续的 Buffer。 */
function readGrayFrames(mp4, width, height) {
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", mp4, "-vf", `scale=${width}:${height}:flags=bilinear,format=gray`, "-f", "rawvideo", "-"],
    { encoding: "buffer", timeout: 20 * 60 * 1000, maxBuffer: MAX_RAW_BYTES },
  );
  if (r.error) return { ok: false, reason: `无法运行 ffmpeg：${r.error.code ?? ""} ${r.error.message ?? ""}`.trim() };
  if (r.status !== 0) {
    const err = Buffer.isBuffer(r.stderr) ? r.stderr.toString("utf8") : String(r.stderr ?? "");
    return { ok: false, reason: `ffmpeg 抽帧失败（退出码 ${r.status}）：${err.trim().slice(0, 400)}` };
  }
  const buf = r.stdout;
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { ok: false, reason: "ffmpeg 没有输出任何像素" };
  const frameSize = width * height;
  return { ok: true, buffer: buf, frameSize, frames: Math.floor(buf.length / frameSize) };
}

/** 读首帧 RGB（缩放后），用于「首帧是不是一片纯色」判定。 */
function readFirstFrameRgb(mp4, width, height) {
  const r = spawnSync(
    "ffmpeg",
    ["-v", "error", "-i", mp4, "-vframes", "1", "-vf", `scale=${width}:${height}:flags=bilinear,format=rgb24`, "-f", "rawvideo", "-"],
    { encoding: "buffer", timeout: 5 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (r.error || r.status !== 0 || !Buffer.isBuffer(r.stdout) || r.stdout.length === 0) {
    return { ok: false, reason: "ffmpeg 抽首帧失败" };
  }
  return { ok: true, buffer: r.stdout };
}

/** 首帧分析：唯一色数 + 非背景像素占比。 */
export function analyzeFirstFrame(rgb, width, height) {
  const pixels = width * height;
  const counts = new Map();
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 3;
    const key = ((rgb[o] >> COLOR_QUANTIZE_SHIFT) << 16) | ((rgb[o + 1] >> COLOR_QUANTIZE_SHIFT) << 8) | (rgb[o + 2] >> COLOR_QUANTIZE_SHIFT);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, r: rgb[o], g: rgb[o + 1], b: rgb[o + 2] });
  }
  // 背景色 = 出现最多的颜色（画面通常是大面积底色）。
  // 必须记**原始 RGB**：量化后的值与原始像素差几十级，直接拿它比会把整帧判成主体。
  let background = { count: -1, r: 0, g: 0, b: 0 };
  for (const entry of counts.values()) {
    if (entry.count > background.count) background = entry;
  }
  let subject = 0;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 3;
    const distance = Math.max(
      Math.abs(rgb[o] - background.r),
      Math.abs(rgb[o + 1] - background.g),
      Math.abs(rgb[o + 2] - background.b),
    );
    if (distance > COLOR_DISTANCE_THRESHOLD) subject += 1;
  }
  return {
    uniqueColors: counts.size,
    subjectRatio: subject / pixels,
    backgroundShare: background.count / pixels,
  };
}

/**
 * 全片分析：帧差、静止占比、最长静止段、逐窗口活动量。
 * 返回的事实是「事实」，不是「结论」——判定在 evaluatePixelQuality 里做。
 */
export function analyzeVideoPixels(mp4) {
  const probe = probeVideo(mp4);
  if (!probe.ok) return { ok: false, reason: probe.reason };
  if (!probe.width || !probe.height) return { ok: false, reason: "成片尺寸异常" };

  // 目标缩放尺寸：保持 1/10 比例并取偶数（rawvideo 不在乎奇偶，但偶数更安全）
  let scaleW = Math.max(2, Math.round(probe.width / GRAY_SCALE_DIVISOR / 2) * 2);
  let scaleH = Math.max(2, Math.round(probe.height / GRAY_SCALE_DIVISOR / 2) * 2);
  const estimatedFrames = probe.nbFrames || Math.ceil(probe.duration * (probe.fps || 30));
  // 估算超过上限就再缩一半，避免 spawnSync 的 maxBuffer 爆掉
  while (scaleW * scaleH * Math.max(1, estimatedFrames) > MAX_RAW_BYTES) {
    scaleW = Math.max(2, scaleW >> 1);
    scaleH = Math.max(2, scaleH >> 1);
  }

  const gray = readGrayFrames(mp4, scaleW, scaleH);
  if (!gray.ok) return { ok: false, reason: gray.reason };
  const { buffer, frameSize, frames } = gray;
  if (frames < 2) return { ok: false, reason: `成片只有 ${frames} 帧，无法做逐帧比对` };

  const changedRatios = [];
  for (let f = 1; f < frames; f += 1) {
    const a = (f - 1) * frameSize;
    const b = f * frameSize;
    let changed = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const diff = buffer[a + i] - buffer[b + i];
      if (diff > PIXEL_CHANGE_THRESHOLD || diff < -PIXEL_CHANGE_THRESHOLD) changed += 1;
    }
    changedRatios.push(changed / frameSize);
  }

  const fps = probe.fps || 30;
  const staticPairs = changedRatios.filter((r) => r <= 0).length;
  let longestStatic = 0;
  let currentStatic = 0;
  let longestStaticStart = 0;
  let currentStaticStart = 0;
  for (let i = 0; i < changedRatios.length; i += 1) {
    if (changedRatios[i] <= 0) {
      if (currentStatic === 0) currentStaticStart = i;
      currentStatic += 1;
      if (currentStatic > longestStatic) {
        longestStatic = currentStatic;
        longestStaticStart = currentStaticStart;
      }
    } else {
      currentStatic = 0;
    }
  }

  // 逐 1 秒窗口的活动量。
  // 同时给 sum 与 mean（每帧平均变化像素比例）：
  // 用 sum 比较会让**末尾不满一窗**的窗口天然偏低（帧数少 → 累加少），
  // 看起来像「尾部空」。判 front-load 必须用 mean。
  const windowSec = 1;
  const windowCount = Math.max(1, Math.ceil((frames / fps) / windowSec));
  const windows = [];
  for (let w = 0; w < windowCount; w += 1) {
    const from = Math.floor(w * windowSec * fps);
    const to = Math.min(changedRatios.length, Math.floor((w + 1) * windowSec * fps));
    let sum = 0;
    for (let i = from; i < to; i += 1) sum += changedRatios[i];
    const count = Math.max(1, to - from);
    windows.push({
      t0: +(w * windowSec).toFixed(2),
      t1: +((w + 1) * windowSec).toFixed(2),
      frames: count,
      activity: +sum.toFixed(4),
      meanActivity: +(sum / count).toFixed(5),
    });
  }

  // 末尾死区：最后一段完全静止的时长
  let deadTailSec = 0;
  for (let i = changedRatios.length - 1; i >= 0 && changedRatios[i] <= 0; i -= 1) deadTailSec += 1 / fps;

  const first = readFirstFrameRgb(mp4, Math.min(192, probe.width), Math.min(192, probe.height));
  let firstFrame = { uniqueColors: 0, subjectRatio: 0, backgroundShare: 1 };
  if (first.ok) {
    const w = Math.min(192, probe.width);
    const h = Math.min(192, probe.height);
    firstFrame = analyzeFirstFrame(first.buffer, w, h);
  }

  return {
    ok: true,
    facts: {
      width: probe.width,
      height: probe.height,
      fps,
      frames,
      duration: +(frames / fps).toFixed(3),
      scale: { width: scaleW, height: scaleH },
      meanChangedRatio: +(changedRatios.reduce((s, r) => s + r, 0) / changedRatios.length).toFixed(5),
      staticRatio: +(staticPairs / changedRatios.length).toFixed(4),
      longestStaticSec: +(longestStatic / fps).toFixed(3),
      longestStaticStartSec: +(longestStaticStart / fps).toFixed(3),
      deadTailSec: +deadTailSec.toFixed(3),
      firstFrame,
      windows,
      changedRatios,
    },
  };
}

// ── 判定 ──────────────────────────────────────────────────────────────────
// 阈值分两档：
//   · **阻断级**：判据无歧义、且规则书有明文依据（首帧规则 / 全时长揭示）。
//   · **告警级**：判据依赖「什么样算好片」的主观量，没有基线就硬阻断会误伤。
//     本仓当前**没有**历史合格片基线，所以这两条只告警并把数值打出来，
//     等基线建立后再升级为阻断（升级条件写在 docs/rules/production-workflow-rules.md）。
export const THRESHOLDS = {
  firstFrameSubjectRatioMin: 0.005, // 首帧非背景像素 ≥ 0.5%
  firstFrameUniqueColorsMin: 3, // 首帧至少 3 种颜色（纯色等待 → 1 种）
  staticRatioWarn: 0.85, // 帧级静止占比告警线
  deadTailWarnRatio: 0.25, // 末尾死区：超过时长的这个比例就告警
  deadTailWarnSec: 1.5, // 末尾死区：超过这个秒数就告警
  frontLoadRatio: 0.25, // 末段活动量低于中位的这个比例 → 告警 front-load
};

/**
 * 像素级判定。
 *
 * @param {object} facts analyzeVideoPixels().facts
 * @param {Array<{start:number,end:number,frame:number,index:number}>} scenes 绝对时间的 Scene 区间
 * @param {boolean} lastSceneIsFinalHold 末帧末段允许静止（画面保持到底）
 */
export function evaluatePixelQuality(facts, scenes = [], { lastSceneIsFinalHold = true } = {}) {
  const findings = [];
  const warnings = [];
  const f = facts;

  // Q1 首帧非背景像素占比（§2 首帧规则：禁纯色等待、孤立标题淡入）
  if (f.firstFrame.subjectRatio < THRESHOLDS.firstFrameSubjectRatioMin) {
    findings.push(
      `首帧几乎没有可辨认主体：非背景像素占比 ${(f.firstFrame.subjectRatio * 100).toFixed(3)}% < ` +
        `${(THRESHOLDS.firstFrameSubjectRatioMin * 100).toFixed(1)}%（规则书 §2 首帧规则：0–2 秒必须有可辨认的价值/冲突/结果/证据）`,
    );
  }
  // Q2 首帧唯一色数（纯色 → 1 种）
  if (f.firstFrame.uniqueColors < THRESHOLDS.firstFrameUniqueColorsMin) {
    findings.push(
      `首帧近乎纯色：只有 ${f.firstFrame.uniqueColors} 种颜色 < ${THRESHOLDS.firstFrameUniqueColorsMin} 种` +
        "（规则书 §2 首帧规则：禁纯色等待）",
    );
  }

  // Q3 每个 Scene 区间内必须有变化（§1 全时长揭示、禁 front-load；§2 一页一个职责）
  //
  // 窗口只统计**严格落在区间内部**的帧间变化（start < t < end）：
  // 区间起点那一帧的跳变属于上一段的收尾、区间终点那一帧属于下一段的开头，
  // 把它们算进来会让「本段静止、下一段动了一下」的段看起来是活的。
  const deadScenes = [];
  for (const scene of scenes) {
    const from = Math.max(0, Math.floor(scene.start * f.fps));
    const to = Math.min(f.changedRatios.length, Math.ceil(scene.end * f.fps) - 1);
    let activity = 0;
    for (let i = from; i < to; i += 1) activity += f.changedRatios[i];
    const isFinalHold = lastSceneIsFinalHold && scene === scenes[scenes.length - 1];
    if (activity <= 0 && !isFinalHold) {
      deadScenes.push(`帧 ${scene.frame} Scene ${scene.index}（${scene.start.toFixed(2)}–${scene.end.toFixed(2)}s）`);
    }
  }
  if (deadScenes.length) {
    findings.push(
      `这些 Scene 区间内画面没有任何变化（规则书 §1 全时长揭示 / 禁 front-load）：\n    · ${deadScenes.join("\n    · ")}`,
    );
  }

  // 告警级（无基线，只提示）
  if (f.staticRatio > THRESHOLDS.staticRatioWarn) {
    warnings.push(
      `帧级静止占比 ${(f.staticRatio * 100).toFixed(1)}% > ${(THRESHOLDS.staticRatioWarn * 100).toFixed(0)}%` +
        `（最长静止段 ${f.longestStaticSec}s @ ${f.longestStaticStartSec}s）——画面偏 PPT；` +
        "该判据尚无合格片基线，当前只告警",
    );
  }
  const deadTailLimit = Math.min(THRESHOLDS.deadTailWarnSec, f.duration * THRESHOLDS.deadTailWarnRatio);
  if (f.deadTailSec > deadTailLimit) {
    warnings.push(
      `末尾静止 ${f.deadTailSec}s > ${deadTailLimit.toFixed(2)}s（成片时长 ${f.duration}s）——尾部留了一段空画面`,
    );
  }

  // front-load：末段活动量显著低于全片中位水平 = 「前紧后松」。
  // 用每帧平均变化像素比例（meanActivity）比，末尾不满一窗才不会天然偏低。
  if (f.windows.length >= 3) {
    const means = f.windows.map((w) => w.meanActivity).sort((a, b) => a - b);
    const median = means[Math.floor(means.length / 2)];
    const lastQuarter = f.windows.slice(Math.floor((f.windows.length * 3) / 4));
    const tailMean = lastQuarter.reduce((s, w) => s + w.meanActivity, 0) / Math.max(1, lastQuarter.length);
    if (median > 0 && tailMean < median * THRESHOLDS.frontLoadRatio) {
      warnings.push(
        `末段活动量 ${(tailMean / median * 100).toFixed(0)}% 低于全片中位 ${(median * 100).toFixed(2)}%` +
          "（规则书 §1 禁 front-load / 禁 PPT）——揭示集中在前段",
      );
    }
  }

  return { ok: findings.length === 0, findings, warnings };
}
