// python-runtime.mjs — Python 解释器解析（唯一真源，跨脚本共用）
//
// 为什么需要它：Windows 上 `python3` 常解析到 Microsoft Store 存根——执行即以
// 非零退出、不输出任何东西。直接拿它跑 TTS，失败信息会指向「MiniMax TTS 调用失败」，
// 而不是「python 不可用」，排障方向完全错。
//
// 所以解析规则是：**必须真跑一次最小导入才算通过**。
// 候选顺序：MINIMAX_PYTHON → HARNESS_PYTHON（历史别名）→ python3 → python。
//
// 单一真源的原因：scripts/minimax-tts.mjs 与 scripts/gate.mjs（音色基线门禁）
// 都需要它。两处各写一份，迟早一处改了另一处没改——表现为「TTS 正常但门禁说
// 找不到 Python」或反之。
import { spawnSync } from "node:child_process";

/**
 * 解析一个**真能运行**的 Python 解释器。
 * @returns {string} 解释器路径或命令名
 * @throws {Error} 全部候选都不可用时抛出（消息含可执行的修复提示）
 */
export function resolvePython() {
  const candidates = [process.env.MINIMAX_PYTHON, process.env.HARNESS_PYTHON, "python3", "python"].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import socket"], {
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error(
    `找不到可用的 Python 解释器（尝试过：${candidates.join(", ")}）；请设置 MINIMAX_PYTHON`,
  );
}

/**
 * 以只读方式运行一段 Python 并取回 stdout（UTF-8 强制）。
 *
 * 管道编码：Windows 下 Python 的 stdout 默认是 GBK（cp936），Node 按 utf8 解码
 * 会得到乱码。强制 PYTHONIOENCODING/PYTHONUTF8，保证两端编码一致。
 *
 * @param {string[]} args Python 脚本参数
 * @param {{cwd?: string, timeoutMs?: number}} options
 * @returns {{ok: boolean, stdout: string, stderr: string, status: number|null}}
 */
export function runPython(args, { cwd = undefined, timeoutMs = 60_000 } = {}) {
  const python = resolvePython();
  const run = spawnSync(python, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    cwd,
    env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
  });
  if (run.error) {
    return { ok: false, stdout: "", stderr: run.error.message ?? String(run.error), status: null };
  }
  return {
    ok: run.status === 0,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    status: run.status,
  };
}
