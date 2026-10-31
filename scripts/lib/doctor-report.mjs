#!/usr/bin/env node
// doctor-report.mjs — 把官方 `hyperframes doctor --json` 的 payload 翻成本仓的体检结论。
//
// 为什么需要它：官方 `doctor --json` **永远 exit 0**（官方文档原话："always exit 0;
// gate on payload ok"）。所以用退出码判定等于**没有门禁**——官方检查全红也会显示「通过」。
// 本脚本按「本仓生产到底需要什么」逐项判定。
//
// 判定口径：
//   必需项 —— Node.js / FFmpeg / FFprobe / Archive extractor / Environment：
//     缺任一项就不可生产（缺 Node 跑不了 CLI；缺 ffmpeg/ffprobe 切不了音频、探不了时长；
//     缺 Archive extractor 解不开素材包；Environment 决定渲染器的环境变量）。
//   Chrome —— 分两种失败，不能混为一谈：
//     · detail 含 "Not found" → **致命**：渲染确实不可用。
//     · detail 含 "Failed to run" → **警告**：Windows 上 chrome.exe 是 GUI 子系统程序，
//       `--version` 不把版本写到 stdout，官方 CLI 探测时会一直挂到超时被杀（实测 SIGKILL / ETIMEDOUT）。
//       但渲染走 puppeteer-core/CDP 启动 Chrome，不依赖这个探测——所以它是**探测假阳性**，
//       不是渲染不可用。把它当致命会让 Windows 上的 doctor 恒红。
//   可选项 —— Version（有新版）/ whisper-cpp / Kokoro / MusicGen / Docker：
//     只提示，不判失败。官方顶层 `ok` 是所有检查的 AND，含这些可选项，
//     所以顶层 ok 在任何没装本地回退的机器上都是 false——直接 gate 它会永远误判。
//
// 输出：每行一个结论；失败项以 ✗ 开头，警告以 ! 开头。退出码 0 = 可生产，1 = 不可生产。
//
// 输入：优先 `--json-file <路径>`；不给时从 **stdin** 读（便于 `doctor --json | 本脚本` 管道调用）。
import { readFileSync } from "node:fs";

const REQUIRED = ["Node.js", "FFmpeg", "FFprobe", "Archive extractor", "Environment"];
const OPTIONAL = new Set([
  "Version",
  "whisper-cpp",
  "TTS (Kokoro)",
  "BGM (MusicGen)",
  "Docker",
  "Docker running",
]);

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const file = get("json-file");
const readInput = file
  ? Promise.resolve(readFileSync(file, "utf8"))
  : new Promise((resolve) => {
      let buffer = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => {
        buffer += chunk;
      });
      process.stdin.on("end", () => resolve(buffer));
      process.stdin.on("error", () => resolve(buffer));
    });

const raw = await readInput;

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  console.error(`✗ 官方 doctor 输出无法解析：${error.message}`);
  process.exit(1);
}

const checks = Array.isArray(report.checks) ? report.checks : [];
if (!checks.length) {
  console.error("✗ 官方 doctor 输出里没有 checks 数组");
  process.exit(1);
}

const byName = new Map(checks.map((check) => [check.name, check]));
const lines = [];
let failed = false;

for (const name of REQUIRED) {
  const check = byName.get(name);
  if (!check) {
    lines.push(`✗ ${name} —— 官方 doctor 未报告该项`);
    failed = true;
  } else if (!check.ok) {
    lines.push(`✗ ${name} —— ${check.detail ?? "未知原因"}`);
    failed = true;
  } else {
    lines.push(`✓ ${name}`);
  }
}

const chrome = byName.get("Chrome");
if (!chrome) {
  lines.push("✗ Chrome —— 官方 doctor 未报告该项（渲染不可用）");
  failed = true;
} else if (chrome.ok) {
  lines.push("✓ Chrome");
} else if (/not found/i.test(String(chrome.detail ?? ""))) {
  lines.push(`✗ Chrome —— ${chrome.detail}（渲染确实不可用：先装 Chrome，或跑 hyperframes browser ensure）`);
  failed = true;
} else {
  // 探测失败，但渲染路径不依赖该探测 —— 只警告。
  lines.push(
    `! Chrome —— ${chrome.detail}（Windows 探测假阳性：chrome.exe 是 GUI 程序，--version 不回 stdout 会挂到超时；` +
      "渲染走 CDP 启动不受影响。若渲染确实失败，设 HYPERFRAMES_BROWSER_PATH 指向可用浏览器，或跑 hyperframes browser ensure --force）",
  );
}

for (const check of checks) {
  if (!REQUIRED.includes(check.name) && check.name !== "Chrome" && OPTIONAL.has(check.name)) {
    lines.push(`· ${check.name} —— ${check.ok ? check.detail : `${check.detail ?? ""}（可选，不影响本仓生产）`}`);
  }
}

for (const line of lines) console.log(line);
process.exit(failed ? 1 : 0);
