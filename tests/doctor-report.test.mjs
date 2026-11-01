import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPT = resolve(import.meta.dirname, "..", "scripts", "lib", "doctor-report.mjs");

// 官方 `doctor --json` **永远 exit 0**（官方文档："always exit 0; gate on payload ok"）。
// 所以本仓的门禁必须看 payload，而不是退出码。
// 这三条用例钉住判定口径：必需项缺失 → 失败；Chrome 探测假阳性 → 只警告；Chrome 真没装 → 失败。
const base = (overrides = {}) => ({
  checks: [
    { name: "Version", ok: false, detail: "0.8.36 → 0.8.223 available" },
    { name: "Node.js", ok: true, detail: "v24.16.0 (win32 x64)" },
    { name: "FFmpeg", ok: true, detail: "ffmpeg 2025-07-07" },
    { name: "FFprobe", ok: true, detail: "ffprobe 2025-07-07" },
    { name: "Archive extractor", ok: true, detail: "Built into Windows" },
    { name: "Environment", ok: true, detail: "non-TTY" },
    { name: "Chrome", ok: true, detail: "Google Chrome 140.0.0.0" },
    { name: "whisper-cpp", ok: false, detail: "Not found (optional)" },
    { name: "Docker", ok: false, detail: "Not found" },
    ...(overrides.checks ?? []),
  ],
});

const run = (payload) =>
  spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), encoding: "utf8" });

test("doctor-report：必需项齐全且 Chrome 可用 → 可生产", () => {
  const r = run(base());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ FFmpeg/u);
  assert.match(r.stdout, /✓ Chrome/u);
  // 可选项只提示，不判失败。
  assert.match(r.stdout, /· Docker/u);
});

test("doctor-report：Chrome 探测假阳性（Windows --version 挂死）只警告不判失败", () => {
  const r = run(
    base({
      checks: [
        {
          name: "Chrome",
          ok: false,
          detail: 'Failed to run "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --version (signal SIGKILL, ETIMEDOUT).',
        },
      ],
    }),
  );
  assert.equal(r.status, 0, "Windows 上的 chrome.exe --version 假阳性不得让 doctor 恒红：" + r.stdout);
  assert.match(r.stdout, /! Chrome/u);
  assert.match(r.stdout, /HYPERFRAMES_BROWSER_PATH/u);
});

test("doctor-report：Chrome 确实缺失 → 判失败；必需项缺失 → 判失败", () => {
  const noChrome = run(base({ checks: [{ name: "Chrome", ok: false, detail: "Not found" }] }));
  assert.equal(noChrome.status, 1, "Chrome 真没装时渲染不可用，必须判失败");
  assert.match(noChrome.stdout, /✗ Chrome/u);

  const noFfmpeg = run(base({ checks: [{ name: "FFmpeg", ok: false, detail: "Not found" }] }));
  assert.equal(noFfmpeg.status, 1, "缺 ffmpeg 必须判失败");
  assert.match(noFfmpeg.stdout, /✗ FFmpeg/u);
});

test("doctor-report：payload 不可解析 → 判失败（不得静默通过）", () => {
  const r = spawnSync(process.execPath, [SCRIPT], { input: "not-json", encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /无法解析/u);
});
