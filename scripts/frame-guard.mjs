#!/usr/bin/env node
// frame-guard.mjs — 本地快速检查器：复刻官方 assemble-index.mjs 的 per-frame guard ②
// 与 compId 绑定检查，并追加本项目自有的硬底线扫描（字号/字体/对比度/禁写）。
// 用法：node scripts/frame-guard.mjs <段目录> [--frame NN]
// 纯读，不改任何文件；官方 assemble/check 仍是唯一权威门禁。

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const segDir = process.argv[2];
if (!segDir) {
  console.error("用法: node frame-guard.mjs <段目录> [--frame NN]");
  process.exit(2);
}
const fIdx = process.argv.indexOf("--frame");
const only = fIdx > -1 ? process.argv[fIdx + 1] : null;

const framesDir = join(segDir, "compositions", "frames");
const files = readdirSync(framesDir).filter((f) => f.endsWith(".html")).sort();

const OPEN_TAG = "<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>";
const attrPresent = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?:[\\s=]|$)`).test(attrs);
const attrValue = (attrs, name) => {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : null;
};
const isRootish = (attrs) =>
  /(?:^|\s)id\s*=\s*["']root["']/.test(attrs) ||
  attrPresent(attrs, "data-composition-id") ||
  attrPresent(attrs, "data-composition-src");

// 项目色板 WCAG 比值（官方 contrast-audit 口径：大字 ≥24px → 3.0:1）
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const h = hex.replace("#", "");
  return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const HEX = /^#[0-9a-fA-F]{6}$/;
const PALETTE = ["#F7F7F5", "#ECEEF3", "#0F0F0F", "#2A2A2A", "#12B76A", "#0B8A4E", "#F5539E", "#D13C82", "#F97316", "#FACC15", "#2F6BFF", "#1E4FD6", "#FCF9EB"];
// 已知安全的 (前景, 背景) 组合
const SAFE_PAIRS = new Set();
for (const [fg, bg] of [
  ["#0F0F0F", "#F7F7F5"], ["#0F0F0F", "#ECEEF3"], ["#0F0F0F", "#12B76A"], ["#0F0F0F", "#F5539E"],
  ["#0F0F0F", "#F97316"], ["#0F0F0F", "#FACC15"], ["#2A2A2A", "#F7F7F5"], ["#2A2A2A", "#ECEEF3"],
  ["#2A2A2A", "#12B76A"], ["#2A2A2A", "#F5539E"], ["#2A2A2A", "#F97316"], ["#2A2A2A", "#FACC15"],
  ["#F7F7F5", "#0F0F0F"], ["#F7F7F5", "#0B8A4E"], ["#F7F7F5", "#D13C82"], ["#F7F7F5", "#2F6BFF"], ["#F7F7F5", "#1E4FD6"],
  ["#2F6BFF", "#F7F7F5"], ["#2F6BFF", "#ECEEF3"], ["#2F6BFF", "#0F0F0F"],
  ["#1E4FD6", "#F7F7F5"], ["#1E4FD6", "#ECEEF3"], ["#1E4FD6", "#FACC15"],
  ["#12B76A", "#0F0F0F"], ["#12B76A", "#2A2A2A"], ["#F5539E", "#0F0F0F"], ["#F5539E", "#2A2A2A"],
  ["#F97316", "#0F0F0F"], ["#F97316", "#2A2A2A"], ["#FACC15", "#0F0F0F"], ["#FACC15", "#2A2A2A"],
  ["#F7F7F5", "#FCF9EB"], ["#0F0F0F", "#FCF9EB"],
]) SAFE_PAIRS.add(`${fg}|${bg}`);

let bad = 0;
for (const file of files) {
  const compId = basename(file).replace(/\.html?$/i, "");
  if (only && compId !== only) continue;
  const html = readFileSync(join(framesDir, file), "utf8");
  const errs = [];

  // ① compId 绑定
  if (!html.includes(`data-composition-id="${compId}"`) && !html.includes(`data-composition-id='${compId}'`)) {
    errs.push(`缺 data-composition-id="${compId}"（装配时直接 die）`);
  }
  // ② guard ②：timed 元素需 class=clip；同轨不重叠
  const scan = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<script\b[\s\S]*?<\/script[^>]*>/gi, " ").replace(/<style\b[\s\S]*?<\/style[^>]*>/gi, " ");
  const re = new RegExp(OPEN_TAG, "g");
  const clips = [];
  let m;
  while ((m = re.exec(scan))) {
    const attrs = m[2];
    if (!attrPresent(attrs, "data-start") || !attrPresent(attrs, "data-duration") || !attrPresent(attrs, "data-track-index")) continue;
    if (isRootish(attrs)) continue;
    if (!/(?:^|\s)class\s*=\s*["'][^"']*\bclip\b[^"']*["']/.test(attrs)) {
      errs.push(`timed <${m[1]}> 无 class="clip"（会整帧显示）`);
    }
    const track = attrValue(attrs, "data-track-index");
    const start = parseFloat(attrValue(attrs, "data-start"));
    const dur = parseFloat(attrValue(attrs, "data-duration"));
    if (track != null && Number.isFinite(start) && Number.isFinite(dur)) clips.push({ track, start, end: start + dur, id: attrValue(attrs, "id") });
  }
  const byTrack = new Map();
  for (const c of clips) { if (!byTrack.has(c.track)) byTrack.set(c.track, []); byTrack.get(c.track).push(c); }
  for (const [track, list] of byTrack) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      if (list[i].start < list[i - 1].end - 1e-3) {
        errs.push(`track ${track} 重叠：${list[i - 1].id} 结束 ${list[i - 1].end.toFixed(3)}s 晚于 ${list[i].id} 起点 ${list[i].start.toFixed(3)}s`);
        break;
      }
    }
  }

  // 项目硬底线
  const bare = html.replace(/\/\*[\s\S]*?\*\//g, "");
  // 官方 lint composition_file_too_large：结构行数（<style> 块被剔除后计数）> 300 → warning → --strict 失败
  const structural = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>").split("\n").length;
  if (structural > 300) errs.push(`结构行数 ${structural} > 300（官方 lint composition_file_too_large，--strict 下失败）`);
  // 官方 lint gsap_repeated_fromto_without_baseline / overlapping_gsap_tweens
  // 精确复刻官方语义：只有 immediateRender !== false 的 fromTo 计入；同选择器 ≥2 条且无前置 tl.set 基线 → warning
  const gsapCalls = [];
  {
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
    const CTRL = new Set(["duration", "ease", "immediateRender", "delay", "onUpdate", "onComplete", "onStart", "onReverseComplete", "overwrite", "stagger", "repeat", "yoyo", "repeatDelay", "id", "runBackwards", "paused", "repeatRefresh", "startAt", "keyframes", "defaults", "inherit", "lazy", "onRepeat", "onReverseComplete"]);
    const grab = (src, from) => {
      let i = src.indexOf(from, from === "tl.to(" ? 0 : 0);
      while (i !== -1) {
        let depth = 0, j = src.indexOf("(", i);
        if (j === -1) return null;
        let k = j;
        for (; k < src.length; k++) {
          if (src[k] === "(") depth++;
          else if (src[k] === ")") { depth--; if (depth === 0) break; }
        }
        const body = src.slice(j + 1, k);
        const args = [];
        // 字符串感知：引号内的逗号不是参数分隔符。
        // 否则 tl.fromTo("#a, #b, #c", {...}, {...}, t) 会被拆成一堆伪参数，
        // 导致 to 变量取错位置（immediateRender / duration 检测全部失真）。
        let d = 0, cur = "", q = null;
        for (const ch of body) {
          if (q) { cur += ch; if (ch === q) q = null; continue; }
          if (ch === '"' || ch === "'" || ch === "`") { q = ch; cur += ch; continue; }
          if (ch === "(" || ch === "[" || ch === "{") d++;
          else if (ch === ")" || ch === "]" || ch === "}") d--;
          if (ch === "," && d === 0) { args.push(cur); cur = ""; continue; }
          cur += ch;
        }
        args.push(cur);
        return { args, start: i, end: k };
      }
      return null;
    };
    const num = (s) => { const m = String(s ?? "").match(/^\s*(-?[\d.]+)\s*$/); return m ? parseFloat(m[1]) : null; };
    const topKeys = (objSrc) => {
      const keys = [];
      let d = 0, key = null;
      for (let i = 0; i < objSrc.length; i++) {
        const ch = objSrc[i];
        if (ch === "{" || ch === "[" || ch === "(") d++;
        else if (ch === "}" || ch === "]" || ch === ")") d--;
        if (d === 1 && ch === ":") {
          const km = objSrc.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/);
          if (km) key = km[1];
        }
        if (d === 1 && ch === ",") { if (key) keys.push(key); key = null; }
      }
      if (key) keys.push(key);
      return keys.filter((k) => !CTRL.has(k));
    };
    let cursor = 0;
    for (;;) {
      const rest = scripts.slice(cursor);
      const iF = rest.indexOf("tl.fromTo(");
      const iT = rest.indexOf("tl.to(");
      const iS = rest.indexOf("tl.set(");
      const cands = [[iF, "fromTo"], [iT, "to"], [iS, "set"]].filter(([i]) => i !== -1);
      if (!cands.length) break;
      cands.sort((a, b) => a[0] - b[0]);
      const [idx, kind] = cands[0];
      const call = grab(rest.slice(idx), "tl." + kind + "(");
      if (!call) break;
      const sel = call.args[0].trim().replace(/^["'`]|["'`]$/g, "");
      // 逗号分组选择器要拆成单个选择器统计 —— 官方 lint 是按「单个选择器」
      // 计数同一选择器上的 fromTo 条数，分组会让两个不同的组互相看不见。
      const sels = sel.split(",").map((s) => s.trim()).filter(Boolean);
      const toVars = kind === "fromTo" ? call.args[2] : (kind === "to" ? call.args[1] : call.args[1]);
      const posArg = kind === "fromTo" ? call.args[3] : call.args[2];
      const pos = num(posArg);
      const dur = num((toVars.match(/duration\s*:\s*(-?[\d.]+)/) || [])[1]);
      const irFalse = /immediateRender\s*:\s*false/.test(toVars);
      gsapCalls.push({ kind, sel, sels, pos, dur, irFalse, props: topKeys(toVars), raw: call.args.join(",").slice(0, 120) });
      cursor += idx + call.end + 1;
    }
    // ① repeated fromTo without baseline
    const ft = new Map();
    for (const c of gsapCalls) {
      if (c.kind !== "fromTo" || c.irFalse) continue;
      for (const one of c.sels.length ? c.sels : [c.sel]) {
        if (!ft.has(one)) ft.set(one, []);
        ft.get(one).push(c);
      }
    }
    for (const [sel, list] of ft) {
      if (list.length < 2) continue;
      const firstPos = Math.min(...list.map((c) => (c.pos ?? Infinity)));
      const hasBaseline = gsapCalls.some((c) => c.kind === "set" && (c.sels.length ? c.sels : [c.sel]).includes(sel) && (c.pos ?? 0) <= firstPos);
      if (!hasBaseline) errs.push(`选择器 "${sel}" 有 ${list.length} 条无 immediateRender:false 的 fromTo 且无 tl.set 基线（官方 lint gsap_repeated_fromto_without_baseline）`);
    }
    // ② overlapping tweens on shared properties
    const bySel = new Map();
    for (const c of gsapCalls) {
      if (c.kind === "set") continue;
      if (c.pos == null || c.dur == null) continue;
      for (const one of c.sels.length ? c.sels : [c.sel]) {
        if (!bySel.has(one)) bySel.set(one, []);
        bySel.get(one).push({ ...c, end: c.pos + c.dur });
      }
    }
    for (const [sel, list] of bySel) {
      list.sort((a, b) => a.pos - b.pos);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (b.pos >= a.end - 1e-3) break;
          const shared = a.props.filter((p) => b.props.includes(p));
          if (shared.length) {
            errs.push(`选择器 "${sel}" 上 tween 重叠且共享属性 ${shared.join(",")}（${a.pos.toFixed(2)}–${a.end.toFixed(2)}s vs ${b.pos.toFixed(2)}–${b.end.toFixed(2)}s，官方 lint overlapping_gsap_tweens）`);
            break;
          }
        }
      }
    }
  }
  for (const mm of bare.matchAll(/font-size\s*:\s*([^;}"']+)/gi)) {
    const raw = mm[1].trim();
    const pxm = raw.match(/^([\d.]+)px$/);
    const cqwm = raw.match(/^([\d.]+)cqw$/);
    let px = null;
    if (pxm) px = parseFloat(pxm[1]);
    else if (cqwm) px = (parseFloat(cqwm[1]) / 100) * 1920;
    if (px == null) errs.push(`font-size 无法静态判定：${raw}`);
    else if (px < 28) errs.push(`font-size ${raw} ≈ ${px.toFixed(1)}px < 28px`);
  }
  for (const pat of [/transition\s*:/i, /@keyframes/i, /infinite/i, /repeat\s*:\s*-1/i, /iterations\s*:\s*Infinity/i]) {
    if (pat.test(bare)) errs.push(`命中禁用写法 ${pat}`);
  }
  for (const mm of bare.matchAll(/font-size\s*:\s*[^;}]*?(var\(|calc\(|inherit)/gi)) errs.push(`font-size 含 ${mm[1]}（layout-guard 无法判定）`);
  // 数字开头选择器（只在选择器位置判定，排除十六进制色值）
  for (const [, sel] of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = sel.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!/^[^{}]*$/.test(selector)) continue;
    for (const mm of selector.matchAll(/(^|[\s,>+~])([#.])(\d[\w-]*)/g)) {
      errs.push(`数字开头 CSS 选择器 "${mm[2]}${mm[3]}"（Chrome 会静默丢弃）`);
    }
  }
  // @font-face 家族名 vs 使用处
  const faceNames = [...html.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*["']([^"']+)["']/g)].map((x) => x[1]);
  const usedNames = [...new Set([...html.matchAll(/font-family\s*:\s*([^;}]+)/g)].map((x) => x[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))) .flat())];
  for (const u of usedNames) {
    if (u === "sans-serif" || u === "serif" || u === "inherit") continue;
    if (!faceNames.includes(u)) errs.push(`字体家族 "${u}" 未在 @font-face 中声明（字体不会加载）`);
  }
  for (const f of faceNames) {
    const src = html.slice(html.indexOf(f)).match(/src\s*:\s*url\(["']?([^"')]+)/);
    if (src && !src[1].startsWith("assets/fonts/")) errs.push(`@font-face src 非 assets/fonts/: ${src[1]}`);
    if (src && !existsSync(join(segDir, src[1]))) errs.push(`@font-face 文件不存在: ${src[1]}`);
  }
  // 系统 CJK 字体名
  for (const mm of bare.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    if (/PingFang|Hiragino|Songti|Heiti|STHeiti|YaHei|SimHei|Source Han|CJK|system-ui|-apple-system/i.test(mm[1])) {
      errs.push(`font-family 含系统字体名: ${mm[1].trim()}`);
    }
  }
  // 对比度：显式 color + 最近祖先 background（同选择器内），只报可静态判定且不在安全表内的
  const rules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const colorOf = new Map();
  for (const [, sel, body] of rules) {
    const c = body.match(/(?:^|[;{\s])color\s*:\s*(#[0-9a-fA-F]{3,8})/);
    const bg = body.match(/(?:^|[;{\s])background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/);
    const fs = body.match(/font-size\s*:\s*([\d.]+)px/);
    const key = sel.trim().split("\n").pop().trim();
    if (c) colorOf.set(key, { fg: c[1].toUpperCase(), bg: bg ? bg[1].toUpperCase() : null, fs: fs ? parseFloat(fs[1]) : null });
  }
  for (const [key, v] of colorOf) {
    if (!HEX.test(v.fg) || !v.bg || !HEX.test(v.bg)) continue;
    const fg = v.fg.length === 7 ? v.fg : v.fg;
    const bg = v.bg.length === 7 ? v.bg : v.bg;
    const pair = `${fg}|${bg}`;
    if (SAFE_PAIRS.has(pair)) continue;
    const r = ratio(fg, bg);
    const large = v.fs == null || v.fs >= 24;
    const need = large ? 3.0 : 4.5;
    if (r < need) errs.push(`对比度不足 ${r.toFixed(2)}:1 < ${need} — ${key} (${v.fg} on ${v.bg}${v.fs ? `, ${v.fs}px` : ""})`);
  }
  // 媒体文件存在
  for (const mm of bare.matchAll(/<img[^>]*src=["']([^"']+)["']/g)) {
    if (!existsSync(join(segDir, mm[1]))) errs.push(`图片文件不存在: ${mm[1]}`);
  }

  if (errs.length) {
    bad++;
    console.log(`✗ ${compId}  (${errs.length} 项)`);
    for (const e of errs) console.log(`    - ${e}`);
  } else {
    console.log(`✓ ${compId}`);
  }
}
process.exit(bad ? 1 : 0);
