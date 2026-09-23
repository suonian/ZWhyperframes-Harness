#!/usr/bin/env node
// captions-zh.mjs — 中文字幕分组数据（合同唯一算法）+ 官方 caption skin 填充
//   build  --segment <dir>   生成 caption_groups.json + compositions/captions.html（官方 skin 渲染器）
//   verify --segment <dir>   确定性复算，与在盘 caption_groups.json / captions.html 逐字比对（不一致 fail-closed）
// 合同：docs/rules/captions-contract.md（文本逐字取自锁定稿；词级时间只用于显示时间与高亮进度；
// 渲染永远是官方 skin/运行时，本脚本只供分组数据）。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HARNESS_ROOT } from "./lib/harness.mjs";
import { readStoryboard } from "./lib/storyboard.mjs";

const args = process.argv.slice(2);
const command = args[0];
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const MAX_LINE = 22;
const BOUNDARY = new Set(["。", "！", "？", "，", "、", "；", "："]);
const CLOSERS = new Set(["」", "』", "”", "’", "）", ")", "】", "》", "」", "］"]);
const ASCII_WORD = /[A-Za-z0-9]/u;
const TAIL_PAD = 0.12;
const r3 = (x) => Number(x.toFixed(3));

// ── 语块切分：相邻标点之间为一段，标点收尾，收尾引号/括号归前一段 ──────────────
function makeClause(chars, start, end) {
  let s = start;
  let e = end;
  while (s < e && /\s/u.test(chars[s])) s += 1;
  while (e > s && /\s/u.test(chars[e - 1])) e -= 1;
  if (s >= e) return null;
  return { text: chars.slice(s, e).join(""), charStart: s, charEnd: e };
}

export function splitClauses(text) {
  const chars = [...text];
  const clauses = [];
  let start = 0;
  let i = 0;
  while (i < chars.length) {
    if (BOUNDARY.has(chars[i])) {
      let end = i + 1;
      while (end < chars.length && CLOSERS.has(chars[end])) end += 1;
      const clause = makeClause(chars, start, end);
      if (clause) clauses.push(clause);
      start = end;
      i = end;
      continue;
    }
    i += 1;
  }
  if (start < chars.length) {
    const clause = makeClause(chars, start, chars.length);
    if (clause) clauses.push(clause);
  }
  return clauses;
}

// ── 长语块均衡切分（不拆英文/数字词） ─────────────────────────────────────────
function balancedChunks(text, max) {
  const chunks = [];
  let rest = [...text];
  while (rest.length > max) {
    const pieces = Math.ceil(rest.length / max);
    let cut = Math.round(rest.length / pieces);
    // 不拆 Latin 词：向两侧找到最近的词边界（不在 ASCII 词内部切）
    const inside = (idx) => idx > 0 && idx < rest.length && ASCII_WORD.test(rest[idx - 1]) && ASCII_WORD.test(rest[idx]);
    let probe = cut;
    while (inside(probe) && probe < rest.length) probe += 1;
    if (!inside(probe) && probe > 0) cut = probe;
    else {
      probe = cut;
      while (inside(probe) && probe > 0) probe -= 1;
      cut = probe > 0 ? probe : cut;
    }
    chunks.push(rest.slice(0, cut).join(""));
    rest = rest.slice(cut);
  }
  if (rest.length) chunks.push(rest.join(""));
  return chunks;
}

// ── 行计划：一段一行（≤22 整体成行；超长均衡切分并登记 balancedSplit） ────────
export function planLines(clauses, max = MAX_LINE) {
  const lines = [];
  for (const clause of clauses) {
    const len = [...clause.text].length;
    if (len <= max) {
      lines.push({ text: clause.text, charStart: clause.charStart, charEnd: clause.charEnd, balancedSplit: false });
      continue;
    }
    // 超长语块均衡切分：逐块累加字符范围（各块字符区间互不重叠）
    let cursor = clause.charStart;
    for (const chunkText of balancedChunks(clause.text, max)) {
      const chunkLen = [...chunkText].length;
      lines.push({ text: chunkText, charStart: cursor, charEnd: cursor + chunkLen, balancedSplit: true });
      cursor += chunkLen;
    }
  }
  return lines;
}

// ── 字符对齐（LCS）：锁稿字符 ↔ MiniMax token 字符（大小写不敏感） ────────────
// 返回 lockCharTokenId[i] = token 序号或 -1（未匹配，时间继承邻居）。
export function alignCharsToTokens(lockChars, tokens) {
  const tokenChars = [];
  tokens.forEach((tok, ti) => {
    for (const ch of [...tok.text]) tokenChars.push({ ch: ch.toLowerCase(), tokenIndex: ti });
  });
  const n = lockChars.length;
  const m = tokenChars.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const idx = i * (m + 1) + j;
      dp[idx] = lockChars[i].toLowerCase() === tokenChars[j].ch
        ? dp[(i + 1) * (m + 1) + j + 1] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }
  const ids = new Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (lockChars[i].toLowerCase() === tokenChars[j].ch) {
      ids[i] = tokenChars[j].tokenIndex;
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return ids;
}

// ── 行 → 分组（显示文本取自锁稿切片；词级时间只驱动显示与高亮） ──────────────
export function buildGroups({ text, tokens, frameStart, totalDuration }) {
  const chars = [...text];
  const clauses = splitClauses(text);
  const lines = planLines(clauses);
  const ids = alignCharsToTokens(chars, tokens);
  const groups = [];
  for (const [gi, line] of lines.entries()) {
    // 行内 span：同 token 连续字符成组，未匹配字符并入前 span（段首并入后 span）
    const spans = [];
    for (let ci = line.charStart; ci < line.charEnd; ci += 1) {
      const tokId = ids[ci];
      const last = spans[spans.length - 1];
      if (last && last.tokenId === tokId) {
        last.text += chars[ci];
        last.charEnd = ci + 1;
      } else if (tokId === -1 && last) {
        last.text += chars[ci];
        last.charEnd = ci + 1;
      } else {
        spans.push({ tokenId: tokId, text: chars[ci], charStart: ci, charEnd: ci + 1 });
      }
    }
    // 纯标点 span 并入前 span（无前则并入后）——标点跟随前词，不单独起高亮
    for (let si = spans.length - 1; si >= 0; si -= 1) {
      const s = spans[si];
      if (/^[。！？，、；：""''（）《》…—·]+$/u.test(s.text)) {
        const absorbEnd = s.tokenId >= 0 ? tokens[s.tokenId].endAbs : null;
        if (si > 0) {
          spans[si - 1].text += s.text;
          spans[si - 1].charEnd = s.charEnd;
          if (absorbEnd != null) spans[si - 1].absorbEnd = Math.max(spans[si - 1].absorbEnd ?? 0, absorbEnd);
        } else if (spans.length > 1) {
          spans[1].text = s.text + spans[1].text;
          spans[1].charStart = s.charStart;
        }
        spans.splice(si, 1);
      }
    }
    const words = [];
    for (const s of spans) {
      const tok = s.tokenId >= 0 ? tokens[s.tokenId] : null;
      const start = tok ? tok.startAbs : null;
      const end = tok ? Math.max(tok.endAbs, s.absorbEnd ?? 0) : (s.absorbEnd ?? null);
      words.push({ span: s, token: tok, start, end });
    }
    // 未匹配（无 token）span 继承邻居时间
    for (let wi = 0; wi < words.length; wi += 1) {
      if (words[wi].start != null) continue;
      const prev = [...words.slice(0, wi)].reverse().find((w) => w.end != null);
      const next = words.slice(wi + 1).find((w) => w.start != null);
      words[wi].start = prev ? prev.end : next ? next.start : 0;
      words[wi].end = prev ? prev.end : next ? next.start : 0;
    }
    if (!words.length) throw new Error(`行「${line.text}」无词级时间`);
    const start = r3(Math.max(0, words[0].start));
    const end = r3(Math.min(words[words.length - 1].end + TAIL_PAD, totalDuration));
    const frame = frameStart.frameOf(start);
    groups.push({
      id: `caption-group-${gi}`,
      frame: frame ?? null,
      start,
      end,
      text: line.text,
      balancedSplit: line.balancedSplit || undefined,
      // 单 span = 整行：字幕按行出现，不做逐字标记（用户指令）；文本取自锁稿切片，逐字一致。
      words: [
        {
          id: `caption-word-${gi}-0`,
          text: line.text,
          start,
          end: r3(Math.max(start, words[words.length - 1].end)),
        },
      ],
    });
  }
  // 组间隔断：end 不得超过下一组 start（官方 skin 单组显示）
  for (let gi = 0; gi < groups.length - 1; gi += 1) {
    if (groups[gi].end > groups[gi + 1].start) groups[gi].end = groups[gi + 1].start;
    if (groups[gi].end <= groups[gi].start) groups[gi].end = r3(groups[gi].start + 0.01);
  }
  return groups;
}

// ── 官方运行时加载（captions.mjs 的 buildFromSkin / brandFontFaces + 官方 tokens 库） ──
function resolveFacelessSkillsDir() {
  const candidates = [
    join(HARNESS_ROOT, "vendor", "skills", "faceless-explainer"),
    join(process.env.HOME ?? "", ".claude", "skills", "faceless-explainer"),
    join(process.env.HOME ?? "", ".agents", "skills", "faceless-explainer"),
    join(process.env.HOME ?? "", ".config", "opencode", "skills", "faceless-explainer"),
  ];
  for (const dir of candidates) if (existsSync(join(dir, "scripts", "captions.mjs"))) return dir;
  throw new Error("未找到官方 faceless-explainer skill（先运行 ./scripts/bootstrap.sh）");
}

async function loadOfficialCaptionsModule() {
  const dir = resolveFacelessSkillsDir();
  const mod = await import(pathToFileURL(join(dir, "scripts", "captions.mjs")).href);
  const tokensLib = await import(pathToFileURL(join(dir, "scripts", "lib", "tokens.mjs")).href);
  const dimensionsLib = await import(pathToFileURL(join(dir, "scripts", "lib", "dimensions.mjs")).href);
  return { mod, tokensLib, dimensionsLib, dir };
}

function readInputs(segmentDir) {
  const scriptPath = join(segmentDir, "user_script.txt");
  const metaPath = join(segmentDir, "audio_meta.json");
  const boardPath = join(segmentDir, "STORYBOARD.md");
  if (!existsSync(scriptPath)) throw new Error(`缺少 user_script.txt：${scriptPath}`);
  if (!existsSync(metaPath)) throw new Error(`缺少 audio_meta.json：${metaPath}`);
  if (!existsSync(boardPath)) throw new Error(`缺少 STORYBOARD.md：${boardPath}`);
  const text = readFileSync(scriptPath, "utf8").trim();
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const board = readStoryboard(segmentDir);
  if (!Array.isArray(meta.voices) || !meta.voices.length) throw new Error("audio_meta.json 无 voices");
  // 帧起点：按 STORYBOARD 帧顺序累计 duration
  const frameStarts = new Map();
  let acc = 0;
  const frameOrder = [];
  for (const frame of board.frames) {
    frameStarts.set(String(frame.number), acc);
    frameOrder.push({ number: frame.number, start: acc, duration: Number(String(frame.meta.duration ?? "0").replace(/s$/u, "")) || 0 });
    acc += Number(String(frame.meta.duration ?? "0").replace(/s$/u, "")) || 0;
  }
  const totalDuration = r3(acc);
  const tokens = [];
  for (const voice of meta.voices) {
    const base = frameStarts.get(String(voice.frame));
    if (base == null) throw new Error(`audio_meta voice frame ${voice.frame} 不在 STORYBOARD 中`);
    for (const w of voice.words ?? []) {
      tokens.push({
        text: String(w.text ?? ""),
        startAbs: r3(base + Number(w.start ?? 0)),
        endAbs: r3(base + Number(w.end ?? 0)),
      });
    }
  }
  tokens.sort((a, b) => a.startAbs - b.startAbs);
  const frameOf = (t) => {
    let current = frameOrder[0]?.number ?? null;
    for (const f of frameOrder) if (t >= f.start - 0.001) current = f.number;
    return current;
  };
  return { text, meta, board, tokens, totalDuration, frameStart: { map: frameStarts, frameOf } };
}

function buildTokensCss(framePath, H, tokensLib, dimensionsLib) {
  const band = dimensionsLib.captionBand(H);
  const out = [];
  if (existsSync(framePath)) {
    const md = readFileSync(framePath, "utf8");
    const colors = tokensLib.parseColors(md);
    const sem = tokensLib.semanticColors(colors);
    if (sem.ink) out.push(`      --cap-ink: ${sem.ink};`);
    if (sem.canvas) out.push(`      --cap-canvas: ${sem.canvas};`);
    if (sem.accent) out.push(`      --cap-accent: ${sem.accent};`);
    if (sem.accent2) out.push(`      --cap-accent-2: ${sem.accent2};`);
    const { display, body } = tokensLib.parseFonts(md);
    if (display) out.push(`      --font-display: ${display}, system-ui, serif;`);
    if (body) out.push(`      --font-body: ${body}, system-ui, sans-serif;`);
  }
  out.push(`      --cap-band-top: ${band.bandTopY}px;`);
  out.push(`      --cap-band-height: ${band.bandHeight}px;`);
  return `      :root {\n${out.join("\n")}\n      }`;
}

async function buildHtml(segmentDir, inputs, groups, onDiskDimensions = null) {
  const { mod, tokensLib, dimensionsLib } = await loadOfficialCaptionsModule();
  const skinPath = join(segmentDir, ".hyperframes", "caption-skin.html");
  if (!existsSync(skinPath)) throw new Error("缺少 .hyperframes/caption-skin.html（官方 Step 2 产出）");
  const framePath = join(segmentDir, "frame.md");
  const [width, height] = onDiskDimensions ?? (() => {
    const fmt = String(inputs.board.globals.format ?? "1920x1080");
    const m = /^(\d+)x(\d+)$/u.exec(fmt);
    if (!m) throw new Error(`STORYBOARD format 无法解析：${fmt}`);
    return [Number(m[1]), Number(m[2])];
  })();
  const tokens = buildTokensCss(framePath, height, tokensLib, dimensionsLib);
  const faces = mod.brandFontFaces(framePath, segmentDir);
  const fonts = existsSync(framePath) ? tokensLib.parseFonts(readFileSync(framePath, "utf8")) : {};
  const die = (m) => { throw new Error(`caption-skin.html 填充失败：${m}`); };
  return { html: mod.buildFromSkin(readFileSync(skinPath, "utf8"), groups, inputs.totalDuration, width, height, tokens, die, faces, fonts), width, height };
}

async function runBuild(segmentDir) {
  const inputs = readInputs(segmentDir);
  const groups = buildGroups({ text: inputs.text, tokens: inputs.tokens, frameStart: inputs.frameStart, totalDuration: inputs.totalDuration });
  const { html, width, height } = await buildHtml(segmentDir, inputs, groups);
  const groupsPath = join(segmentDir, "caption_groups.json");
  const htmlPath = join(segmentDir, "compositions", "captions.html");
  mkdirSync(join(segmentDir, "compositions"), { recursive: true });
  writeFileSync(groupsPath, `${JSON.stringify({ total_duration_s: inputs.totalDuration, width, height, groups }, null, 2)}\n`);
  writeFileSync(htmlPath, html);
  console.log(`✓ captions-zh build: ${groups.length} 组 / ${inputs.tokens.length} 词级 token → ${htmlPath}`);
  return { groups, html, groupsPath, htmlPath };
}

async function runVerify(segmentDir) {
  const inputs = readInputs(segmentDir);
  const groups = buildGroups({ text: inputs.text, tokens: inputs.tokens, frameStart: inputs.frameStart, totalDuration: inputs.totalDuration });
  const groupsPath = join(segmentDir, "caption_groups.json");
  const htmlPath = join(segmentDir, "compositions", "captions.html");
  if (!existsSync(groupsPath)) throw new Error("缺少 caption_groups.json（先 build）");
  const onDisk = JSON.parse(readFileSync(groupsPath, "utf8"));
  if (!Number.isInteger(onDisk.width) || !Number.isInteger(onDisk.height)) throw new Error("caption_groups.json 缺少有效画布尺寸");
  const recomputed = { total_duration_s: inputs.totalDuration, width: onDisk.width, height: onDisk.height, groups };
  if (JSON.stringify(recomputed) !== JSON.stringify(onDisk)) throw new Error("caption_groups.json 与本仓脚本确定性复算不一致（fail-closed，禁止手改分组数据）");
  const { html } = await buildHtml(segmentDir, inputs, groups, [onDisk.width, onDisk.height]);
  if (!existsSync(htmlPath) || readFileSync(htmlPath, "utf8") !== html) throw new Error("captions.html 与官方 skin 确定性复算不一致（fail-closed）");
  console.log("✓ captions-zh verify: 分组数据与 HTML 产物复算一致");
}

const isMainModule = (() => {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  try {
    const segmentDir = resolve(get("segment") ?? process.cwd());
    if (command === "build") await runBuild(segmentDir);
    else if (command === "verify") await runVerify(segmentDir);
    else {
      console.error("用法: node captions-zh.mjs build|verify --segment <段目录>");
      process.exit(2);
    }
  } catch (error) {
    console.error(`captions-zh.mjs 失败：${error.message}`);
    process.exit(1);
  }
}
