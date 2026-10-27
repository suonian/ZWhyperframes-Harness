// css-selector-audit.mjs — 审计帧文件里「CSS 规则引用了 DOM 中不存在的 id/class」
// 动机：官方 lint/check 不校验 CSS 选择器与 DOM 的匹配性。class/id 错配会让元素
// 静默失去样式（主体消失、退化成无样式文本），而所有机器门禁仍显示通过。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node css-selector-audit.mjs <frames-dir>");
  process.exit(2);
}

// ── 递归切分 CSS：返回所有「普通规则」的选择器头（at-rule 内部继续下钻）
function collectSelectors(css) {
  const out = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    // 找到下一个 '{'
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const head = css.slice(i, open).trim();
    // 找到配对的 '}'
    let depth = 1;
    let j = open + 1;
    while (j < n && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (head.startsWith("@")) {
      // at-rule：@font-face/@keyframes 无嵌套规则；@media/@supports 内部有规则
      if (/^@(media|supports|layer|container)/i.test(head)) {
        out.push(...collectSelectors(body));
      }
    } else if (head) {
      out.push(head);
    }
    i = j;
  }
  return out;
}

const files = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
let bad = 0;

for (const file of files) {
  const src = readFileSync(join(dir, file), "utf8");

  const domIds = new Set();
  const domClasses = new Set();
  for (const m of src.matchAll(/\bid\s*=\s*"([^"]+)"/g)) domIds.add(m[1]);
  for (const m of src.matchAll(/\bclass\s*=\s*"([^"]+)"/g)) {
    for (const c of m[1].trim().split(/\s+/)) if (c) domClasses.add(c);
  }

  const styleBlocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  let css = styleBlocks.join("\n");
  css = css.replace(/\/\*[\s\S]*?\*\//g, ""); // 剥离注释

  const missingIds = new Set();
  const missingClasses = new Set();
  for (const head of collectSelectors(css)) {
    for (const sel of head.split(",")) {
      const s = sel.trim();
      if (!s) continue;
      for (const m of s.matchAll(/#([A-Za-z_][\w-]*)/g)) {
        if (!domIds.has(m[1])) missingIds.add(m[1]);
      }
      for (const m of s.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        if (!domClasses.has(m[1])) missingClasses.add(m[1]);
      }
    }
  }

  // 脚本里 select 的 id 必须存在（排除模板字符串拼接：含 ${ 或以 - 结尾）
  const scriptBlocks = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const missingScript = new Set();
  const addScript = (id) => {
    if (id.includes("${") || id.endsWith("-")) return;
    if (!domIds.has(id)) missingScript.add(id);
  };
  for (const m of scriptBlocks.matchAll(/["'`]#([A-Za-z_][\w-]*)["'`]/g)) {
  // 排除 hex 颜色值（如 "#C7CBD3" / "#0F0F0F"）——它们不是 id。
  // 帧内 id 一律是 `fNN-xxx` 形态，含连字符，不会与纯 hex 混淆。
  if (/^(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(m[1])) continue;
  addScript(m[1]);
}
  for (const m of scriptBlocks.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) addScript(m[1]);

  const issues = [];
  if (missingIds.size) issues.push(`  CSS id 未匹配: ${[...missingIds].join(", ")}`);
  if (missingClasses.size) issues.push(`  CSS class 未匹配: ${[...missingClasses].join(", ")}`);
  if (missingScript.size) issues.push(`  脚本 id 未匹配: ${[...missingScript].join(", ")}`);

  if (issues.length) {
    bad++;
    console.log(`✗ ${file}`);
    issues.forEach((i) => console.log(i));
  } else {
    console.log(`✓ ${file}`);
  }
}

console.log(bad === 0 ? "\n全部帧：CSS/脚本选择器与 DOM 一致" : `\n${bad} 个帧存在选择器未匹配`);
process.exit(bad === 0 ? 0 : 1);
