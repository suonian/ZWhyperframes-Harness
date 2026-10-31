// check-envelope.mjs — 官方 `hyperframes check --json` 信封的解析与归因
//
// 为什么：本仓的 gate 之前跑 `check --strict` 却**只看退出码**——
// 官方信封里每条 finding 都带 selector / 时间点 / 源文件 / fixHint，
// 全被丢掉，用户只拿到一个非零退出码。那等于把官方最值钱的部分扔了。
//
// 两个实测坑：
//   1. `check --json` **不落盘**，必须捕获 stdout。
//   2. stdout 上有 [INFO] 前缀行（字体抓取、GPU 探测），JSON 不是第一行。
//      直接 JSON.parse(整个 stdout) 一定失败。

/**
 * 从 stdout 里抠出 JSON 信封。
 * 用括号配对扫描（跳过字符串里的括号），比「找第一个 {」可靠。
 */
export function parseCheckEnvelope(stdout) {
  const text = String(stdout ?? "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** 把信封里各阶段的 finding 摊平成统一形状。 */
export function collectFindings(envelope) {
  const out = [];
  const sections = ["lint", "runtime", "layout", "motion", "contrast"];
  for (const section of sections) {
    const block = envelope?.[section];
    if (!block || !Array.isArray(block.findings)) continue;
    for (const finding of block.findings) {
      out.push({
        section,
        code: finding.code ?? "(无代码)",
        severity: finding.severity ?? "info",
        selector: finding.selector ?? "",
        sourceFile: finding.sourceFile ?? "",
        time: finding.time,
        message: finding.message ?? "",
        fixHint: finding.fixHint ?? "",
        bbox: finding.bbox ?? null,
      });
    }
  }
  return out;
}

/**
 * 把 finding 排成给人看的一行行结论。
 * 归因要素齐全：哪个阶段、什么代码、哪个元素、哪个文件、什么时间点、怎么修。
 */
export function formatFindings(findings) {
  const order = { error: 0, warning: 1, info: 2 };
  return [...findings]
    .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))
    .map((f) => {
      const parts = [`[${f.severity}] ${f.section}/${f.code}`];
      if (f.selector) parts.push(f.selector);
      if (f.sourceFile) parts.push(`@${f.sourceFile}`);
      if (f.time !== undefined && f.time !== null) parts.push(`t=${f.time}s`);
      let line = parts.join(" · ");
      if (f.message) line += `\n      ${f.message}`;
      if (f.fixHint) line += `\n      → ${f.fixHint}`;
      return line;
    });
}

/** 信封里是否有 error 级 finding（官方 ok 的口径：errorCount === 0）。 */
export function envelopeHasErrors(envelope) {
  if (!envelope) return true;
  if (envelope.ok === false) return true;
  for (const section of ["lint", "runtime", "layout", "motion", "contrast"]) {
    if (Number(envelope[section]?.errorCount ?? 0) > 0) return true;
  }
  return false;
}
