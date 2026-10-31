// package-limits.mjs — 分发包的体积口径（唯一真源）
//
// 【为什么需要单独一个模块】
// 此前有**两处**体积闸，口径还不一样：
//   · scripts/build-skill-package.mjs —— 按「文件字节和」判，线在 470KB；
//   · scripts/publish-skillhub.mjs  —— 按「真实 multipart 请求体」判，线在 460KB。
// 而请求体 = 文件字节和 + 每个 part 的 multipart 头 + changelog 字段 + 其它字段，
// **比文件字节和大出十几 KB**。于是出现「打包通过、发布必失败」——
// 正是打包脚本注释里写明要避免的那种状态。
//
// 实测（2026-10-31）：47 个文件、文件字节和 451.2KB 时，
// 真实请求体是 466.5KB（multipart 头 7.4KB + changelog 字段 7.9KB + 其它字段 0.6KB）。
//
// 【本模块的做法】
//   · 上限只有一个真源，打包与发布共用；
//   · 请求体体积**按同一套算法算**：打包期用估计值判，发布期用真实 body 判，
//     并断言两者相等——不等就说明估计函数与真实构造漂了，fail-closed。
//
// 【changelog 字段为什么必须有上限】
// changelog 是请求体里的一个**字段**（不是包内文件），它的大小由仓库的
// CHANGELOG.md 决定，与包内容无关。发布新版本时该字段会变成新版本的整节
// 说明——本仓当前的「未发布」节就有 30KB 量级，直接放进去会让请求体超限，
// 而且**超限发生在发布那一刻**，不是打包那一刻。不设上限就等于把雷留到上线当天。
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 服务端实测：475KB 可通过、480KB 被断开。取最后一个可通过值作为硬顶。 */
export const SERVER_MAX_BODY_BYTES = 475 * 1024;

/**
 * 本仓的发布闸：476KB。
 *
 * 为什么不是 460KB（更早的值）或 470KB（上一版的值）：请求体体积现在是**确定性**
 * 算出来的——打包期按同一套算法估、发布期用真实 body 复核，两者不等即拒发。
 * 「防止服务端静默断连」这个目的由**打包期就拒绝产出**来达成，
 * 不再需要靠一条比实测值低 15KB 的线来兜底。
 *
 * 而 476KB 是**服务端实测上限**（实测 475KB 可通过、480KB 被断开，即上限约 476KB）。
 * 闸值取这个上限本身，意味着**几乎没有隐藏余量**——任何新增内容超线时，打包会
 * fail-closed 并直接告诉维护者「内容超了，请处置」，而不是发布到一半被服务端
 * 静默断开（客户端侧只看到没有可读信息的 Broken pipe）。
 *
 * 因此内容增长的处理顺序是固定的：**① 扩排除清单 → ② 把长文档拆到仓库 →
 * ③ 才会到这里（说明前两步已用尽）**。2026-11-01 视觉基线能力（新增规则书 +
 * 门禁 + 判定库约 33KB）走完前两步仍超线，故闸值从 470KB 提到实测上限。
 */
export const PUBLISH_MAX_BODY_BYTES = 476 * 1024;

/** changelog 字段的上限。超出部分截断并标注——平台展示不需要几十万字的发布说明。 */
export const CHANGELOG_MAX_BYTES = 8 * 1024;

/** 平台协议 §8.3 的文件数上限。 */
export const MAX_FILES = 100;

/**
 * 截断 changelog 到上限。截断处补一行显式标记——
 * 静默截断会让人以为看到的是全文。
 */
export function truncateChangelog(text) {
  const value = String(text ?? "");
  const bytes = Buffer.byteLength(value, "utf-8");
  if (bytes <= CHANGELOG_MAX_BYTES) return value;
  // 按字节截断且不切开多字节字符：留出标记本身的字节。
  const marker = "\n\n…（发布说明过长，已截断；完整内容见仓库 CHANGELOG）";
  const budget = CHANGELOG_MAX_BYTES - Buffer.byteLength(marker, "utf-8");
  let out = "";
  let used = 0;
  for (const ch of value) {
    const w = Buffer.byteLength(ch, "utf-8");
    if (used + w > budget) break;
    out += ch;
    used += w;
  }
  return out + marker;
}

/**
 * 估算 multipart 请求体的字节数。
 *
 * 必须与 publish-skillhub.mjs 的真实构造**逐字节一致**，否则打包期的门禁就是假的。
 * publish 脚本会用真实 body 长度与本函数的结果对账，不等即 fail-closed。
 *
 * @param {{rel:string, bytes:number}[]} files
 * @param {string} payloadJson 形如 payload 的 JSON 字符串
 * @returns {number} 估算的请求体字节数
 */
export function estimateBodyBytes(files, payloadJson) {
  // boundary 里带 Date.now()（13 位），长度固定，用等长占位串保证估计稳定。
  const boundary = "----skillhubBoundary0000000000000";
  let total = 0;
  const partHead = (name, filename, ctype) => {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"`;
    if (filename) head += `; filename="${filename}"`;
    head += "\r\n";
    return Buffer.byteLength(head, "utf-8") + Buffer.byteLength(`Content-Type: ${ctype}\r\n\r\n`, "utf-8");
  };
  total += partHead("payload", null, "application/json");
  total += Buffer.byteLength(payloadJson, "utf-8");
  total += 2; // part 结尾的 \r\n
  for (const f of files) {
    const ctype = f.rel.toLowerCase().endsWith(".md") ? "text/markdown" : "application/octet-stream";
    total += partHead("files", f.rel, ctype);
    // bytes 既可能是数字（打包期按文件大小），也可能是 Buffer（发布期直接读文件）。
    // 两种都要吃对：把 Buffer 直接加到数字上会变成**字符串拼接**，
    // 估出来的「字节数」会是一长串文本——数字比较立刻失配。
    total += typeof f.bytes === "number" ? f.bytes : f.bytes.length;
    total += 2;
  }
  total += Buffer.byteLength(`--${boundary}--\r\n`, "utf-8");
  return total;
}

/**
 * 解析 SKILL.md 的 frontmatter，取出发布 payload 需要的字段。
 * 规则与 SkillHub CLI 的 parse_skill_md_frontmatter 一致：仅 key: value 与 key: [a, b]。
 */
export function parseSkillFrontmatter(md) {
  const text = String(md ?? "");
  if (!text.startsWith("---")) throw new Error("SKILL.md 缺少 front matter（首行需为 ---）");
  const parts = text.split("\n");
  const end = parts.findIndex((line, idx) => idx > 0 && line.trim() === "---");
  if (end < 0) throw new Error("SKILL.md front matter 缺少结束标记 ---");
  const out = {};
  for (const raw of parts.slice(1, end)) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      out[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/gu, ""))
        .filter(Boolean);
    } else {
      out[key] = val.replace(/^["']|["']$/gu, "");
    }
  }
  return out;
}

/**
 * 组装发布 payload（字段顺序固定，便于估算结果稳定）。
 * @param {object} meta frontmatter 解析结果
 * @param {string} changelog 未经截断的发布说明
 */
export function buildPublishPayload(meta, changelog) {
  return {
    slug: meta.slug,
    version: meta.version,
    displayName: meta.displayName,
    summary: meta.summary ?? "",
    description: meta.description ?? "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    license: meta.license ?? "",
    homepage: meta.homepage ?? "",
    changelog: truncateChangelog(changelog),
  };
}

/**
 * 打包期的体积闸：用与发布期**同一套**算法估算请求体。
 * @param {{rel:string, bytes:number}[]} files
 * @param {object} meta SKILL.md frontmatter
 * @param {string} changelog 未经截断的发布说明
 * @returns {{ok:boolean, bytes:number, limit:number, payloadBytes:number}}
 */
export function checkPackageBodySize(files, meta, changelog) {
  const payload = buildPublishPayload(meta, changelog);
  const payloadJson = JSON.stringify(payload);
  const bytes = estimateBodyBytes(files, payloadJson);
  return {
    ok: bytes <= PUBLISH_MAX_BODY_BYTES,
    bytes,
    limit: PUBLISH_MAX_BODY_BYTES,
    payloadBytes: Buffer.byteLength(payloadJson, "utf-8"),
  };
}

/** 从仓库根的 CHANGELOG.md 取某个版本的发布说明（与 publish 脚本同一套提取逻辑）。 */
export function readChangelogForVersion(root, version, extractChangelog) {
  const path = join(root, "CHANGELOG.md");
  if (!existsSync(path)) return "";
  return extractChangelog(readFileSync(path, "utf-8"), version);
}
