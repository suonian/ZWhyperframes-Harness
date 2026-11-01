// 官方 STORYBOARD.md 的轻量读取器（管理层用途：语音/字幕/音频元数据注入）。
// 只读元数据；渲染与状态语义仍以官方 parser（@hyperframes/core/storyboard）为真源。
import { existsSync, readFileSync } from "node:fs";

const FRAME_HEADING = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\b[\s:：—-]*(.*)$/iu;
const BULLET = /^-\s*([^:：]+?)\s*[：:]\s*(.*)$/u;
const VOICE_KEYS = new Set(["voiceover", "vo", "voice_over", "narration"]);

export function parseStoryboard(md) {
  const lines = String(md).split(/\r?\n/u);
  const globals = {};
  const frames = [];
  let current = null;
  // unknown → open → done：只允许文件开头的第一个 --- 打开 frontmatter；
  // 关闭后绝不再把正文里的水平分隔线 --- 误当成 frontmatter 开关。
  let frontmatter = "unknown";

  const flush = () => {
    if (current) {
      frames.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (frontmatter === "unknown") {
      if (line.trim() === "") continue;
      if (line.trim() === "---") {
        frontmatter = "open";
        continue;
      }
      frontmatter = "done";
    } else if (frontmatter === "open") {
      if (line.trim() === "---") {
        frontmatter = "done";
        continue;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/u.exec(line);
      if (m) globals[m[1]] = m[2].trim();
      continue;
    }
    const heading = FRAME_HEADING.exec(line);
    if (heading) {
      flush();
      current = { number: Number(heading[1]), title: heading[2].trim(), meta: {} };
      continue;
    }
    if (current) {
      const bullet = BULLET.exec(line);
      if (bullet) {
        const key = bullet[1].trim().toLowerCase();
        let value = bullet[2].trim();
        if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
          value = value.slice(1, -1);
        }
        current.meta[key] = value;
      }
    }
  }
  flush();
  for (const frame of frames) {
    frame.voiceover = [...VOICE_KEYS].map((k) => frame.meta[k]).find((v) => v != null) ?? "";
  }
  return { globals, frames };
}

export function readStoryboard(segmentDir) {
  const path = `${segmentDir}/STORYBOARD.md`;
  if (!existsSync(path)) throw new Error(`缺少 STORYBOARD.md：${path}`);
  return parseStoryboard(readFileSync(path, "utf8"));
}

/**
 * 段时长事实：期望总时长 + 不可解析的 duration 行。
 *
 * 为什么要有这个函数（而不是各处各写一遍正则）：
 *   旧实现用全文正则 `/^- duration:\s*(.+?)\s*$/` 扫 STORYBOARD，实测有两个缺陷——
 *   1. 只认半角冒号 → `- duration：4s`（全角）解析出 0 个时长 → expected=0 →
 *      **整条时长校验被静默跳过**：坏片照样能绑定（fail-open）。
 *   2. 扫全文 → 帧块之外多一行 `- duration: 30s` 会被算进去 → 期望总时长虚高 →
 *      **正确的 MP4 反被拒绝绑定**（假阳性）。
 *
 * 结构化解析（readStoryboard）只取「帧块内的 bullet」，且冒号全半角都认。
 *
 * 两种「没有可比对的时长」必须区分开：
 *   · 帧**完全没有** duration 行 —— 官方合法形态（官方 sync-durations 只更新
 *     已有行、从不新增；缺行时它自己也只是打印一行提示）。此时无从比对，跳过是对的。
 *   · **有** duration 行却解析不出数字 —— 写坏了。此时静默跳过等于把校验关掉，
 *     必须显式暴露（malformed 非空即失败）。
 */
export function storyboardDurationFacts(segmentDir) {
  const board = readStoryboard(segmentDir);
  const rows = board.frames
    .filter((frame) => frame.meta.duration != null)
    .map((frame) => ({
      number: frame.number,
      raw: String(frame.meta.duration),
      seconds: Number.parseFloat(String(frame.meta.duration).replace(/s$/u, "")),
    }));
  const malformed = rows.filter((row) => !Number.isFinite(row.seconds) || row.seconds <= 0);
  const expected = rows
    .filter((row) => Number.isFinite(row.seconds) && row.seconds > 0)
    .reduce((sum, row) => sum + row.seconds, 0);
  return { board, expected, malformed, hasDurations: rows.length > 0 };
}

// ── Scene 区间 ────────────────────────────────────────────────────────────
// STORYBOARD 的正文里有 `Scene N (a–b): 描述` 行（帧内**相对**时间）。
// 它们是「一页一个叙事职责」的唯一结构化落点，也是像素级质检的对照基准。
const SCENE_HEADING = /^Scene\s+(\d+)\s*[（(]\s*([\d.]+)\s*[–\-—~～]\s*([\d.]+)\s*s?\s*[）)]\s*[:：]?\s*(.*)$/u;

/** 从一段 markdown 正文里解析 Scene 行（时间为帧内相对时间）。 */
export function parseSceneLines(md) {
  const out = [];
  for (const line of String(md).split(/\r?\n/u)) {
    const m = SCENE_HEADING.exec(line.trim());
    if (!m) continue;
    const from = Number.parseFloat(m[2]);
    const to = Number.parseFloat(m[3]);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    out.push({ index: Number(m[1]), from, to, text: m[4].trim() });
  }
  return out;
}

/**
 * 帧在**成片时间轴**上的起点。
 *
 * 优先用 index.html（官方装配产物）里的 data-start / data-duration：
 * 那是**装配事实**（渲染真正用的时间轴），比 STORYBOARD 里各帧 duration 的求和更可信
 * —— 官方 sync-durations 只更新已有行，缺行时求和会偏。
 * 拿不到 index.html 时回落到 STORYBOARD 的累计时长。
 */
export function readFrameTimeline(segmentDir) {
  const indexPath = `${segmentDir}/index.html`;
  const byCompositionId = new Map();
  if (existsSync(indexPath)) {
    const html = readFileSync(indexPath, "utf8");
    const re = /data-composition-id="([^"]+)"[^>]*?data-start="([\d.]+)"[^>]*?data-duration="([\d.]+)"/gu;
    for (const m of html.matchAll(re)) {
      byCompositionId.set(m[1], { start: Number(m[2]), duration: Number(m[3]) });
    }
  }
  const board = readStoryboard(segmentDir);
  let cursor = 0;
  return board.frames.map((frame) => {
    const src = String(frame.meta.src ?? "");
    const compositionId = src ? src.split("/").pop().replace(/\.html$/u, "") : "";
    const assembled = byCompositionId.get(compositionId);
    const duration = Number.parseFloat(String(frame.meta.duration ?? "").replace(/s$/u, ""));
    const start = assembled ? assembled.start : cursor;
    const length = assembled ? assembled.duration : Number.isFinite(duration) ? duration : 0;
    cursor = start + length;
    return { number: frame.number, compositionId, start, duration: length, source: assembled ? "index.html" : "STORYBOARD.md" };
  });
}

/**
 * Scene 区间（**成片绝对时间**）。
 *
 * STORYBOARD 里的 Scene 时间是帧内相对时间，直接拿去和成片对账会错位——
 * 每一帧都得加上它在成片里的起点偏移。
 */
export function readStoryboardScenes(segmentDir) {
  const board = readStoryboard(segmentDir);
  const timeline = readFrameTimeline(segmentDir);
  const scenes = [];
  for (const frame of board.frames) {
    const slot = timeline.find((entry) => entry.number === frame.number);
    if (!slot) continue;
    const narrative = readStoryboardNarrative(segmentDir, frame.number);
    for (const scene of parseSceneLines(narrative)) {
      scenes.push({
        frame: frame.number,
        index: scene.index,
        start: slot.start + scene.from,
        end: slot.start + scene.to,
        relativeFrom: scene.from,
        relativeTo: scene.to,
        text: scene.text,
      });
    }
  }
  return { scenes, timeline };
}

/** 取某一帧标题之后的正文（帧块内的自由文本部分）。 */
export function readStoryboardNarrative(segmentDir, frameNumber) {
  const path = `${segmentDir}/STORYBOARD.md`;
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  const collected = [];
  let current = null;
  for (const line of lines) {
    const heading = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\b/iu.exec(line);
    if (heading) {
      current = Number(heading[1]);
      continue;
    }
    if (current === frameNumber) collected.push(line);
  }
  return collected.join("\n");
}
