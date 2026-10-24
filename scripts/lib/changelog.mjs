// changelog.mjs — 从 Keep a Changelog 格式的文件里取某个版本的正文。
//
// 为什么按行扫描而不用多行正则：正则的前瞻里带 `$` 时，在 multiline 模式下
// `$` 会在**任意行尾**匹配，非贪婪的捕获组因此恒为空。本仓最初的发布脚本
// 就栽在这里——上传的 changelog 恒为空，平台显示为默认文案 "Initial release"。
// 这类「看起来能跑、结果恒为空」的缺陷，只有断言结果非空才抓得住。

/**
 * 取 `## [version]` 节到下一个 `## [` 节之间的正文；找不到返回空串。
 * @param {string} md  CHANGELOG 全文
 * @param {string} version  形如 "0.2.3" 的版本号
 * @returns {string}
 */
export function extractChangelog(md, version) {
  const lines = String(md).split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return "";
  const body = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## \[/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}
