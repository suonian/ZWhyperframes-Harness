// net-env.sh 的行为回归。
//
// 为什么单独锁：这块出过三个真 bug，且都不会被其它测试撞到——
//   1. NO_PROXY 无条件追加 → 反复 source 后无界增长（装进 ~/.zshrc 必然踩）；
//   2. set -u 且 NO_PROXY 未设置时直接崩（macOS 默认带该变量，本机长期测不出来）；
//   3. 去重循环忘了改 IFS=',' → 整串被当成一个词，去重形同虚设。
//
// 刻意不覆盖「默认探测 127.0.0.1:7890」这一支：它取决于本机有没有开代理，
// 断言它会让 CI 在开发者机器上时绿时红。探测逻辑本身用 probe_proxy 定向测。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, symlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = "./scripts/net-env.sh";
const BASH = "/bin/bash";

/** 在干净环境里 source net-env.sh 并回显指定变量；用绝对路径调 bash，避免 PATH 干扰。 */
function sourceWith(body, env = {}, { pre = "" } = {}) {
  const r = spawnSync(
    BASH,
    ["-c", `set -euo pipefail\n${pre}\n. ${SCRIPT}\n${body}`],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 20_000,
      // 刻意不继承 NO_PROXY/no_proxy：macOS 默认就带，会掩盖「未设置」这一路。
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    },
  );
  assert.equal(r.status, 0, `source 失败：\n${r.stderr}`);
  return r.stdout.trim();
}

test("set -u 且 NO_PROXY 未设置时不崩，且直连豁免齐全", () => {
  const out = sourceWith('echo "$no_proxy"');
  for (const host of ["localhost", "127.0.0.1", "::1", "api.minimaxi.com", "api.minimax.chat"]) {
    assert.ok(
      out.split(",").includes(host),
      `NO_PROXY 缺少 ${host}：${out}`,
    );
  }
});

test("NO_PROXY 去重：重复 source 结果一致（防无界增长）", () => {
  const once = sourceWith('echo "$no_proxy"');
  const thrice = sourceWith(
    '. ./scripts/net-env.sh; . ./scripts/net-env.sh\n' + 'echo "$no_proxy"',
  );
  assert.equal(thrice, once);
  const items = once.split(",");
  assert.equal(new Set(items).size, items.length, `存在重复项：${once}`);
});

test("保留调用方已有的 NO_PROXY 通配项", () => {
  const out = sourceWith('echo "$no_proxy"', { NO_PROXY: "*.corp.internal" });
  assert.ok(out.includes("*.corp.internal"), `通配项被吞：${out}`);
  assert.ok(out.includes("api.minimaxi.com"));
});

test("末位项无尾逗号也能识别为已存在（回归：曾重复追加）", () => {
  const out = sourceWith('echo "$no_proxy"', { NO_PROXY: "a,localhost" });
  const items = out.split(",");
  assert.equal(new Set(items).size, items.length, `存在重复项：${out}`);
});

test("不污染调用方的 IFS，且自定义 IFS 下去重依然生效", () => {
  // 回归：去重循环曾忘了设 IFS=','，整串被当成一个词。
  // 必须预设 NO_PROXY 才测得出来——起点为空时，「整串追加」和「逐项去重」结果一样。
  const out = sourceWith(
    'printf "%s|%s" "$IFS" "$no_proxy"',
    { NO_PROXY: "localhost" },
    { pre: 'IFS=":"' },
  );
  const [ifs, noProxy] = out.split("|");
  assert.equal(ifs, ":", "调用方的 IFS 被覆盖了");
  const items = noProxy.split(",");
  assert.equal(new Set(items).size, items.length, `存在重复项：${noProxy}`);
  assert.ok(items.includes("api.minimaxi.com"));
  assert.ok(items.includes("localhost"));
});

test("HARNESS_NO_PROXY=1 强制关闭且不做探测", () => {
  const out = sourceWith(
    'echo "${HARNESS_PROXY_STATUS}|${HARNESS_PROXY_REASON}|${HTTP_PROXY-<none>}"',
    { HARNESS_NO_PROXY: "1" },
  );
  assert.equal(out, "off|HARNESS_NO_PROXY=1|<none>");
});

test("HARNESS_PROXY 显式指定时照用，不探测", () => {
  const out = sourceWith(
    'echo "${HARNESS_PROXY_STATUS}|${HARNESS_PROXY_REASON}|${HTTPS_PROXY}"',
    { HARNESS_PROXY: "http://10.9.9.9:1080" },
  );
  assert.equal(out, "http://10.9.9.9:1080|显式指定|http://10.9.9.9:1080");
});

test("HARNESS_PROXY 为空串等同关闭", () => {
  const out = sourceWith(
    'echo "${HARNESS_PROXY_STATUS}|${HTTP_PROXY-<none>}"',
    { HARNESS_PROXY: "" },
  );
  assert.equal(out, "off|<none>");
});

test("无 python3 时显式说明原因，不静默直连", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "zw-nopy-"));
  mkdirSync(sandbox, { recursive: true });
  symlinkSync(BASH, join(sandbox, "bash"));
  const out = sourceWith(
    'echo "${HARNESS_PROXY_STATUS}|${HARNESS_PROXY_REASON}"',
    { PATH: sandbox },
  );
  assert.match(out, /^off\|无 python3/u, `实际：${out}`);
  assert.match(out, /HARNESS_PROXY/u, "原因里应提示如何手动指定代理");
});

test("probe_proxy 对真实监听端口判定为可达、对无人端口判定为不可达", async () => {
  const server = createServer();
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  const { port } = server.address();

  const probe = (target) => {
    const r = spawnSync(BASH, ["-c", `set -uo pipefail\n. ${SCRIPT}\nprobe_proxy "$1"`, "bash", target], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 20_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    return r.status;
  };

  try {
    assert.equal(probe(`127.0.0.1:${port}`), 0, "有人监听的端口应判定为可达");
    assert.notEqual(probe("127.0.0.1:1"), 0, "无人监听的端口应判定为不可达");
  } finally {
    await new Promise((res) => server.close(res));
  }
});
