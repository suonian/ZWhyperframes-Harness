// 跨平台定位 shell 解释器（测试用）。
//
// 为什么不能写死 /bin/bash：
//   · POSIX 上 /bin/bash 是固定位置，没问题；
//   · Windows 上**没有** /bin/bash —— 那是 MSYS/Cygwin 的**虚拟**路径，
//     原生 node 解析不到，spawnSync 直接 ENOENT。
//   · PATH 上的 bash 在 Windows 上通常是 WSL 存根（C:\Windows\System32\bash.exe）：
//     它打印「适用于 Linux 的 Windows 子系统没有已安装的分发版」并以非 0 退出。
//   · Git Bash 又不一定在标准安装位置（本机就在 D:\Program Files\Git）。
//
// 所以这里对每个候选**实际跑一次**再决定用哪个，而不是靠路径猜。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** 候选解释器能否真正跑起来（而不是「存在但一运行就失败」）。 */
function works(cmd) {
  const r = spawnSync(cmd, ["-c", "exit 0"], { encoding: "utf8", timeout: 20_000, windowsHide: true });
  return !r.error && r.status === 0;
}

/**
 * 在 PATH 上找出候选命令的**绝对路径**列表（找不到返回空数组）。
 *
 * 为什么必须绝对路径：调用方会**整体替换 PATH** 来构造「某个解释器不存在」
 * 的前置条件（见 net-env 用例）。而 spawnSync 解析可执行文件名时用的是
 * **子进程的 PATH**——只给裸命令名（"bash"）的话，PATH 一被换掉就是 ENOENT，
 * 表现为 `status=null` / `stdout=undefined`，失败信息完全指不到真因
 * （看起来像「脚本崩了」，实际是「根本没启动」）。
 */
function absoluteOnPath(cmd) {
  const whichBin =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "where.exe")
      : "which";
  const r = spawnSync(whichBin, [cmd], { encoding: "utf8", timeout: 20_000, windowsHide: true });
  if (r.error || r.status !== 0) return [];
  return (r.stdout ?? "")
    .split(/\r?\n/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 找一个可用的 bash；找不到返回 null（调用方据此 fail loudly，而不是静默跳过）。 */
export function findBash() {
  if (process.platform !== "win32") {
    for (const p of ["/bin/bash", "/usr/bin/bash"]) if (existsSync(p)) return p;
  }
  // PATH 上的 bash：取**绝对路径**而不是裸命令名（理由见 absoluteOnPath）。
  // WSL 存根（C:\Windows\System32\bash.exe）存在但一运行就失败，
  // works() 会把它自动排除。
  for (const p of absoluteOnPath("bash")) if (works(p)) return p;
  // Git for Windows：优先从 git.exe 自身位置反推（装在非默认盘时也能找到），
  // 再退回标准安装位置。
  const candidates = [];
  for (const gitPath of absoluteOnPath("git")) {
    candidates.push(join(dirname(dirname(gitPath)), "bin", "bash.exe"));
  }
  for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]) {
    if (base) candidates.push(join(base, "Git", "bin", "bash.exe"));
  }
  for (const c of candidates) if (existsSync(c) && works(c)) return c;
  return null;
}

/** 找一个可用的 zsh；找不到返回 null（跨 shell 一致性用例据此 skip）。 */
export function findZsh() {
  if (process.platform !== "win32") {
    for (const p of ["/bin/zsh", "/usr/bin/zsh"]) if (existsSync(p)) return p;
  }
  for (const p of absoluteOnPath("zsh")) if (works(p)) return p;
  return null;
}
