// visual-baseline.mjs — 项目级视觉基线判定（纯函数，无 IO 副作用）
//
// 定位：本仓**不重造**官方能力。官方 `vendor/skills/faceless-explainer/scripts/lib/tokens.mjs`
// 负责「解析」frame.md 的 colors 块与语义角色映射；本文件只做官方不做的那一步——
// **判定**：帧实际用到的东西，是否与项目声明的基线一致。
//
// 三条判定：
//   1. 色板越界   —— 帧里出现的颜色必须在 frame.md 的 colors 声明内（白名单化比较）
//   2. 字号下限   —— 承载性文字 ≥28px@1920；官方 chrome px 令牌豁免（口径见 docs/rules/visual-baseline.md §4）
//   3. 音色一致   —— 段内 TTS manifest 的 voice_profile 与真源一致
//
// 全部 fail-closed：无法判定 = 不通过。猜错等于把检查变成恒绿。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { requireOfficialScript } from "./official-skills.mjs";
import { runPython } from "./python-runtime.mjs";

/**
 * 官方 tokens.mjs 的动态加载。
 *
 * 为什么动态 import 而不是静态 `import ... from "../../vendor/..."`：
 * vendor/ 是 bootstrap 按锁定 commit 取回的官方产物，**不随本仓分发**
 * （见 scripts/build-skill-package.mjs 的 EXCLUDE_DIRS）。静态 import 会让技能包
 * 一装就 ERR_MODULE_NOT_FOUND——整个门禁跟着不可用。
 * requireOfficialScript() 走的是仓库既有的唯一真源约定（vendor/skills/），
 * 缺失时 fail-closed 并指向 bootstrap。
 */
let tokensModulePromise = null;
export async function loadOfficialTokens() {
  if (!tokensModulePromise) {
    const script = requireOfficialScript("faceless-explainer", "scripts/lib/tokens.mjs");
    tokensModulePromise = import(pathToFileURL(script).href);
  }
  return tokensModulePromise;
}

// ── 常量 ────────────────────────────────────────────────────────────────────────

/** 承载性文字下限（1920×1080 基准）。用户确认的项目级底线，严于官方 1.4cqw≈26.9px。 */
export const MIN_TEXT_PX = 28;

/** 关键词级下限。 */
export const MIN_KEYWORD_PX = 40;

/** 展示级（大词/大数字）下限。 */
export const MIN_DISPLAY_PX = 80;

/**
 * 官方「chrome 令牌」的判定线索——**只认真正的元信息语义**。
 *
 * 官方 13/13 preset 明写「px labels are chrome only」：页码、计数器、colophon
 * 这类**元信息**用小号 px 令牌，官方把它们排除在 legibility floor 之外。
 * 本仓接受该豁免，但必须精确——早期版本把 `label` 也算作 chrome，结果
 * `capsule` 的 `label: px 14` 让 worker 随手写的 14px 正文标签蒙混过关（变异
 * 验证实测发现）。所以这里只列**语义上就是元信息**的令牌名：
 *
 *   ✓ counter / pagenum / rail / colophon / credit / footnote / meta / chrome
 *   ✗ label / tag / kicker / caption / badge / overline / attribution
 *     （这些是承载性文字——官方自己的 caption 令牌也走 cqw 承载级）
 */
const CHROME_TOKEN_HINTS =
  /^(?:mono-?chrome|chrome|page-?num|pagenum|counter|count|colophon|credit|footnote|meta|rail|folio)/iu;

/**
 * 承载性令牌名——出现即说明该 px 令牌**不是** chrome。
 * 官方 preset 里 `label`/`tag`/`kicker` 等是承载性文字的小号版本，
 * 不适用官方「chrome only」豁免。
 */
const CARRYING_TOKEN_HINTS =
  /(?:label|tag|kicker|caption|badge|overline|attribution|subtitle|body|title|headline|item|section)/iu;

// ── frame.md 解析 ──────────────────────────────────────────────────────────────

/**
 * 取出 frame.md 的 colors 块（官方 tokens.mjs 的 parseColors）。
 * @returns {Promise<Array<[string,string]>>}
 */
export async function readFrameColors(frameMd) {
  const { parseColors } = await loadOfficialTokens();
  return parseColors(frameMd);
}

/**
 * 取出 frame.md typography 块里所有 **chrome 语义**的 px 固定值集合。
 *
 * 官方 preset 的 chrome 令牌（`counter: px 13` 之类）是官方「px labels are
 * chrome only」条款的落点；本仓用它们作为 §4 豁免的白名单。
 *
 * **双重条件**（缺一不可）：
 *   1. 令牌名命中 chrome 语义（counter/pagenum/rail/…）；
 *   2. 令牌名**不**命中承载性语义（label/tag/kicker/caption/…）。
 *
 * 为什么必须双重：早期版本只看「值是否出现在 frame.md 的 px 令牌里」，
 * 于是 `capsule` 的 `label: px 14` 让 worker 随手写的 14px 正文标签蒙混过关
 * （变异验证实测发现：30px → 14px 变异竟然通过）。值匹配本身不携带语义，
 * 必须由令牌名判定——这正是官方 chrome-only 条款的本意。
 *
 * 解析只认 `px:` 数值——cqw/vw/rem 不算（那是承载性尺寸）。
 */
export function resolveChromePx(frameMd) {
  const out = new Set();
  for (const { token, px, chrome } of readTypographyPxTokens(frameMd)) {
    if (chrome) out.add(px);
  }
  return out;
}

/**
 * 取出 frame.md typography 块里所有 token 名 + px 值。
 *
 * `chrome` 的判定：命中 chrome 语义线索，且**不**命中承载性语义线索。
 * 承载性令牌优先——宁可少豁免（误伤一个 chrome 令牌），不可多豁免
 * （放行一个 14px 正文标签）。
 *
 * @returns {Array<{token:string,px:number,chrome:boolean}>}
 */
export function readTypographyPxTokens(frameMd) {
  const out = [];
  let inTypography = false;
  for (const line of String(frameMd).split(/\r?\n/u)) {
    if (/^typography:\s*$/u.test(line)) {
      inTypography = true;
      continue;
    }
    if (!inTypography) continue;
    if (/^[A-Za-z_][\w-]*:\s*$/u.test(line)) break;
    const m = /^\s*([\w-]+)\s*:\s*\{[^}]*\bpx:\s*([\d.]+)/u.exec(line);
    if (!m) continue;
    const px = Number(m[2]);
    if (!Number.isFinite(px)) continue;
    const token = m[1];
    const carrying = CARRYING_TOKEN_HINTS.test(token);
    const chrome = !carrying && CHROME_TOKEN_HINTS.test(token);
    out.push({ token, px, chrome });
  }
  return out;
}

// ── 颜色比较 ───────────────────────────────────────────────────────────────────

/** 归一化颜色字符串 → 大写 hex 或带 alpha 的 rgba() 文本；无法归一返回 null。 */
export function normalizeColor(raw) {
  const value = String(raw).trim().replace(/^["']|["']$/gu, "");
  const hex = /^#?([0-9a-fA-F]{3,8})$/u.exec(value);
  if (hex) {
    let h = hex[1].toUpperCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return h.length === 6 ? `#${h}` : `#${h.slice(0, 6)}`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/iu.exec(value);
  if (rgb) {
    const alpha = rgb[4] ?? "1";
    return `RGBA(${Math.round(Number(rgb[1]))},${Math.round(Number(rgb[2]))},${Math.round(Number(rgb[3]))},${alpha})`;
  }
  return null;
}

/**
 * 两个颜色是否「同一个颜色」。
 *
 * 判定口径（**按 RGB 比，不按 alpha 比**）：
 * - hex 与 hex → 精确相等。
 * - 带 alpha 的 rgba 与 hex → 比较 RGB，**忽略 alpha**。
 * - 两者都带 alpha → 比较 RGB，**忽略 alpha**。
 *
 * 为什么忽略 alpha：官方 preset 的 `atmosphere` 组件（capsule/FRAME.md:107-109
 * 「1–3 radial candy glows（6–15% opacity）over {colors.cream}」）与 shadow
 * 令牌（rgba(26,26,26,0.08)）在帧里必然以**不同透明度**出现——那是同一个
 * 品牌色在不同 alpha 下的表现，不是第二个颜色。若按 alpha 比，官方自己的
 * 氛围层会被判成「色板越界」，门禁就成了对官方 preset 的误伤。
 * alpha 变化属于**透明度**问题，官方 `check` 的 WCAG 对比度阶段负责。
 */
export function sameColor(a, b) {
  const na = normalizeColor(a);
  const nb = normalizeColor(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const parse = (v) => {
    if (v.startsWith("RGBA(")) {
      const m = /^RGBA\((\d+),(\d+),(\d+),(.+)\)$/u.exec(v);
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    }
    const h = v.slice(1);
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  };
  const pa = parse(na);
  const pb = parse(nb);
  return pa.r === pb.r && pa.g === pb.g && pa.b === pb.b;
}

/**
 * 从帧 HTML 里抽出出现的颜色字面量（hex + rgb()/rgba()）。
 * 只认字面量——CSS 变量、`color-mix()`、当前Color 等动态值无法静态判定，
 * 由调用方按「无法判定 → fail-closed」处理。
 */
export function extractUsedColors(html) {
  const found = new Map();
  const push = (raw) => {
    const norm = normalizeColor(raw);
    if (!norm) return;
    if (found.has(norm)) return;
    found.set(norm, raw.trim());
  };
  for (const m of String(html).matchAll(/#[0-9a-fA-F]{3,8}\b/gu)) push(m[0]);
  for (const m of String(html).matchAll(/\brgba?\(\s*[^)"']+\)/giu)) push(m[0]);
  return [...found.values()];
}

/**
 * 判定帧用色是否越出 frame.md 声明的色板。
 *
 * 豁免（刻意）：
 * - `transparent` / `currentColor` / `inherit` 之类不是真颜色，抽取阶段已排除。
 * - 纯白 `#FFFFFF` 与纯黑 `#000000`：几乎所有 preset 都在 body/背景上用它们，
 *   且官方 `check` 的 WCAG 阶段会独立校验对比度——在这里判红只会制造误报。
 * - 浏览器 UA 默认链接色（官方 `UA_DEFAULT_COLORS`）与语义状态色
 *   （官方 `STATUS_ROLE_KEY`）：官方 remix 明确把它们排除在品牌色之外，
 *   它们出现在帧里不等于「色板越界」。
 *
 * @returns {{violations:string[], ok:boolean, used:number, declared:number}}
 */
export async function checkPaletteConfinement(frameMd, frameHtml) {
  const { parseColors, UA_DEFAULT_COLORS, STATUS_ROLE_KEY } = await loadOfficialTokens();
  const declared = parseColors(frameMd);
  const declaredList = declared.map(([, v]) => v);
  const violations = [];

  for (const used of extractUsedColors(frameHtml)) {
    const norm = normalizeColor(used);
    if (!norm) continue;
    if (/^#(?:FFFFFF|000000)$/u.test(norm)) continue;
    if (UA_DEFAULT_COLORS.has(norm)) continue;

    const hit = declaredList.find((d) => sameColor(d, used));
    if (hit) continue;

    // 语义状态色豁免：键名命中官方 STATUS_ROLE_KEY 时不算越界。
    const statusKey = declared.find(([k]) => STATUS_ROLE_KEY.test(k));
    if (statusKey && sameColor(statusKey[1], used)) continue;

    violations.push(`帧内颜色 ${used} 不在 frame.md 声明的色板内`);
  }

  return {
    violations,
    ok: violations.length === 0,
    used: extractUsedColors(frameHtml).length,
    declared: declared.length,
  };
}

// ── 字号判定 ───────────────────────────────────────────────────────────────────

/**
 * 静态判定 font-size 字面量 → 像素值（相对画布宽度换算）。
 * @returns {number|null} null = 无法判定（必须 fail-closed）
 */
export function parseFontSizePx(raw, canvasWidth = 1920) {
  let value = String(raw).trim().replace(/\s*!important\s*$/iu, "").trim();
  const clamp = /^clamp\(([^,]+),/iu.exec(value);
  if (clamp) value = clamp[1].trim();
  const m = /^(-?[\d.]+)\s*(px|cqw|vw|rem|em)\b/iu.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === "px") return n;
  if (unit === "cqw" || unit === "vw") return (n * canvasWidth) / 100;
  return n * 16; // rem/em：按 16px 根字号保守估算
}

/**
 * 判定帧内字号是否达标。
 *
 * 口径（docs/rules/visual-baseline.md §4）：
 * - 承载性文字 <28px → 违规；
 * - 等于 frame.md typography 里声明的 **chrome px 令牌值** → 豁免（官方 chrome 口径）；
 * - 无法静态判定 → 违规（fail-closed）。
 *
 * @returns {{violations:string[], exempt:string[], ok:boolean}}
 */
export function checkFontSizeFloor(frameMd, frameHtml, canvasWidth = 1920) {
  const chromePx = resolveChromePx(frameMd);
  const violations = [];
  const exempt = [];

  const source = String(frameHtml).replace(/\/\*[\s\S]*?\*\//gu, "");
  for (const match of source.matchAll(/font-size\s*:\s*([^;}"']+)/giu)) {
    const raw = match[1].trim();
    const px = parseFontSizePx(raw, canvasWidth);
    if (px == null) {
      violations.push(`无法静态判定 font-size: ${raw}`);
      continue;
    }
    if (px >= MIN_TEXT_PX) continue;
    if (chromePx.has(px)) {
      exempt.push(`${raw} ≈ ${px}px（frame.md 声明的 chrome 令牌，官方 chrome-only 口径豁免）`);
      continue;
    }
    violations.push(`font-size ${raw} ≈ ${px.toFixed(1)}px < ${MIN_TEXT_PX}px（宽度基准 ${canvasWidth}px）`);
  }

  return { violations, exempt, ok: violations.length === 0 };
}

// ── 音色判定 ───────────────────────────────────────────────────────────────────

/**
 * 判定段内 TTS manifest 的 voice_profile 是否与真源一致。
 *
 * 真源是 `tools/minimax/scripts/minimax_tts.py` 的 `VOICE_PROFILE`（唯一真源，
 * 规则书 §3）。这里比较**语义字段**（忽略字典顺序与额外键）。
 *
 * @param {object} manifest 段内 *.manifest.json 的解析结果
 * @param {object} expected 真源 voice_profile
 * @returns {{ok:boolean, violations:string[], fields:string[]}}
 */
export function checkVoiceProfile(manifest, expected) {
  const violations = [];
  if (!manifest || typeof manifest !== "object") {
    return { ok: false, violations: ["manifest 缺失或不可解析"], fields: [] };
  }
  const actual = manifest.voice_profile;
  if (!actual || typeof actual !== "object") {
    return { ok: false, violations: ["manifest 缺少 voice_profile 字段"], fields: [] };
  }
  const fields = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = actual[key];
    fields.push(key);
    if (got === undefined) {
      violations.push(`voice_profile 缺少 ${key}`);
      continue;
    }
    if (String(got) !== String(want)) {
      violations.push(`voice_profile.${key} = ${got}，与真源 ${want} 不一致`);
    }
  }
  return { ok: violations.length === 0, violations, fields };
}

/**
 * 从一段的 audio 目录里找出 TTS manifest（*.manifest.json）。
 * @returns {string[]} 绝对路径
 */
export function findTtsManifests(segmentDir) {
  const audioDir = join(segmentDir, "audio");
  if (!existsSync(audioDir)) return [];
  return readdirSync(audioDir)
    .filter((f) => f.endsWith(".manifest.json"))
    .map((f) => join(audioDir, f))
    .sort();
}

/** 读取段内 manifest（宽容：读不了就返回 null，由判定层 fail-closed）。 */
export function readTtsManifests(segmentDir) {
  return findTtsManifests(segmentDir)
    .map((path) => {
      try {
        return { path, data: JSON.parse(readFileSync(path, "utf8")) };
      } catch {
        return { path, data: null };
      }
    });
}

/**
 * 读取音色的**唯一真源**：`tools/minimax/scripts/minimax_tts.py` 的 VOICE_PROFILE。
 *
 * 通过 Python 侧的 `--dump-voice-profile` 只读出口取回——不复制常量。
 * 复制就会出现两份真源：改了一处忘了另一处，门禁会拿旧值判绿。
 *
 * @returns {{ok:boolean, profile:object|null, error?:string}}
 */
export function readVoiceProfileTruth(harnessRoot) {
  const script = join(harnessRoot, "tools", "minimax", "scripts", "minimax_tts.py");
  if (!existsSync(script)) {
    return { ok: false, profile: null, error: `找不到音色真源：${script}` };
  }
  const run = runPython([script, "--dump-voice-profile"], { timeoutMs: 60_000 });
  if (!run.ok) {
    return {
      ok: false,
      profile: null,
      error: `读取音色真源失败（Python 不可用或脚本报错）：${(run.stderr || run.stdout).trim().slice(0, 400)}`,
    };
  }
  try {
    const profile = JSON.parse(run.stdout);
    if (!profile || typeof profile !== "object" || !profile.voice_id) {
      return { ok: false, profile: null, error: "音色真源输出不含 voice_id" };
    }
    return { ok: true, profile };
  } catch (error) {
    return { ok: false, profile: null, error: `音色真源输出不可解析：${error.message}` };
  }
}
