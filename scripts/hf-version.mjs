#!/usr/bin/env node
// hf-version.mjs — 打印并校验 harness 锁定的 HyperFrames CLI 版本
//
// 为什么单独一个脚本：版本校验要在**所有平台**上跑同一段逻辑，
// 而 `node node_modules/.bin/hyperframes` 在 Windows 上会崩——该文件是 npm 生成的
// POSIX sh 包装脚本，node 把 shell 语法当 JS 解析，抛 SyntaxError。
// 这里统一走包内真实入口（scripts/lib/harness.mjs 的 hfCliEntry）。
import { execFileSync } from "node:child_process";
import { hfCliEntry, HF_EXPECTED_VERSION } from "./lib/harness.mjs";

const entry = hfCliEntry();
if (!entry) {
  console.error("未找到 HyperFrames CLI 入口（node_modules/hyperframes 未安装）；先运行 npm run bootstrap");
  process.exit(1);
}

let actual = "";
try {
  actual = execFileSync(process.execPath, [entry, "--version"], { encoding: "utf8" }).trim();
} catch (err) {
  console.error(`无法运行 HyperFrames CLI：${err.message}`);
  process.exit(1);
}

// --print：只输出版本号（给 CI 的 `test "$ACTUAL" = "..."` 用；CI 保留独立字面量，
// 是为了与脚本侧的声明做交叉校验——单真源会让这条校验变成同义反复）。
if (process.argv.includes("--print")) {
  console.log(actual);
  process.exit(0);
}

console.log(`hyperframes: ${actual}`);
if (actual !== HF_EXPECTED_VERSION) {
  console.error(`版本漂移：期望 ${HF_EXPECTED_VERSION}`);
  process.exit(1);
}
