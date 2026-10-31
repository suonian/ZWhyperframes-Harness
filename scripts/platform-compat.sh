#!/usr/bin/env bash
# platform-compat.sh — 跨平台路径与工具解析（Windows / macOS / Linux 唯一真源）
#
# 被 hf-env.sh、scripts/doctor.sh、scripts/bootstrap.sh、scripts/install-skill.sh 共同 source。
# 只包含 bash 脚本能用的东西（这些脚本都是 bash-only）。
# 需要 zsh 兼容的 scripts/net-env.sh 不依赖本文件——它必须能被 ~/.zshrc source，
# 所以那里的 Python 解析是就地内联实现，不走这里。
#
# 本文件解决三件在 Windows 上会静默出错的事：
#   1. 原生程序（node / git / npm）不认 MSYS 的 POSIX 路径；
#   2. npm 在 Windows 上把 .bin/hyperframes 生成成 sh 包装脚本，node 解析会 SyntaxError；
#   3. Windows 上 python3 可能解析到 Microsoft Store 存根，执行即非零退出。

# ── 仓库根 ───────────────────────────────────────────────────────────────
# 本文件是「仓库根」的唯一真源：调用方已定义 HARNESS_ROOT 则沿用，
# 否则按本文件自身位置推导。这样任何脚本 source 本文件后都拿到同一个根，
# 不依赖 source 顺序，也不要求调用方记得先定义。
if [ -z "${HARNESS_ROOT:-}" ]; then
  HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

# ── 路径形态：仓库内相对，仓库外才转换 ─────────────────────────────────
# 【总原则】仓库内的路径一律用**相对仓库根**的相对路径；只有仓库外的
# 路径（用户发现目录、产品段目录、临时目录）才需要 native_path。
#
# 为什么仓库内必须用相对路径：
#   node / git / npm 在 Windows 上是原生程序，不认识 MSYS 的 POSIX 路径。
#   · MSYS_NO_PATHCONV=1 时原样收到 /d/foo，node 解析成 <当前盘>\d\foo → ENOENT；
#   · 开启参数转换时会被改写成同样错误的形态（<Git 安装目录>\foo）。
#   Git Bash 的**登录** shell 预置 MSYS_NO_PATHCONV=1（实测 /etc/profile），
#   于是同一份脚本在 `bash -c` 下正常、在 `bash -lc` 下整份失效——
#   而登录 shell 恰恰是用户双击终端 / 交互式会话的形态。
#   相对路径既不带盘符也不以 / 开头，**任何形态下都不会被改写**，
#   因此「先 cd 到仓库根、再用相对路径」是跨平台的正解。
#
# 仓库外路径（/tmp、用户 home、用户发现目录）无法相对表达，
# 那一类才走 native_path。
native_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    printf '%s' "$1"
  fi
}

# 在仓库根执行 node，脚本路径一律相对路径。
# 用法：hf_node scripts/lib/doctor-report.mjs [args...]
# cwd 被固定在仓库根，因此相对路径的解析基准稳定，与调用方的 cwd 无关。
hf_node() {
  ( cd "$HARNESS_ROOT" && node "$@" )
}

# ── 官方 CLI 入口 ────────────────────────────────────────────────────────
# 为什么不用 node_modules/.bin/hyperframes：
#   Linux/macOS 上它是指向包内 .mjs 的符号链接，`node <bin>` 可以直接执行；
#   Windows 上 npm 无法创建符号链接（core.symlinks=false），只能生成 POSIX sh
#   包装脚本（#!/bin/sh + basedir=...），node 会把 shell 语法当 JS 解析并抛
#   SyntaxError: missing ) after argument list。
# 因此统一解析到包内真实入口；入口路径从包的 package.json 的 bin 字段取，
# 不写死版本化的相对路径（上游改名时这里会显式失败，而不是运行到一半才炸）。
#
# 解析用 `cd` + 相对 require：node -e 的 require 相对 cwd 解析，
# 这样不需要把绝对路径交给 node，也就绕开了 MSYS 的参数转换问题。
HF_CLI_PKG_REL="node_modules/hyperframes"
HF_CLI_REL=""
resolve_hf_cli() {
  HF_CLI_REL=""
  local pkg_dir="$HARNESS_ROOT/$HF_CLI_PKG_REL"
  [ -f "$pkg_dir/package.json" ] || return 1
  local rel
  rel="$(cd "$pkg_dir" && node -e 'const p=require("./package.json");const b=(typeof p.bin==="string"?p.bin:(p.bin&&p.bin.hyperframes))||"";process.stdout.write(b)' 2>/dev/null || true)"
  [ -n "$rel" ] || return 1
  HF_CLI_REL="${rel#./}"
  [ -f "$pkg_dir/$HF_CLI_REL" ] || { HF_CLI_REL=""; return 1; }
  return 0
}

# 在仓库根执行官方 CLI：入口是相对路径，cwd 也是仓库根。
# 项目级命令（check / render / snapshot）需要 cwd=项目根才找得到产物；
# 仓库级命令（doctor）同样受益于统一的 cwd。
hf_cli() {
  resolve_hf_cli || return 1
  ( cd "$HARNESS_ROOT" && node "$HF_CLI_PKG_REL/$HF_CLI_REL" "$@" )
}

# 兼容旧调用点：给出包内入口的绝对原生路径。
# 仅用于**显示**或确实需要绝对路径的场合；执行请用 hf_cli。
hf_cli_path() {
  resolve_hf_cli || return 1
  native_path "$HARNESS_ROOT/$HF_CLI_PKG_REL/$HF_CLI_REL"
}

# ── Python 解释器 ───────────────────────────────────────────────────────
# Windows 上 python3 可能解析到 Microsoft Store 存根：执行即以非零退出、
# 不输出任何东西。只用 `command -v` 判断存在与否，会把这个存根当成可用解释器，
# 于是代理探针永远判「不可达」→ net-env 静默切直连，而日志里看不出原因。
# 所以必须实际跑一次最小导入，才算数。
#
# 变量名以 MINIMAX_PYTHON 为准——AGENTS.md 与 scripts/minimax-tts.mjs 用的都是它。
# HARNESS_PYTHON 作为历史别名保留（更早的脚本与文档用过），两者都接受，
# 但**新代码一律用 MINIMAX_PYTHON**：曾出现 bash 侧读 HARNESS_PYTHON、
# Node 侧读 MINIMAX_PYTHON 的分裂——按文档设了 MINIMAX_PYTHON 后，
# bash 侧解析失败 → 代理被静默清空 + doctor 假告警，而 TTS 照常工作。
HARNESS_PY=""
resolve_python() {
  HARNESS_PY=""
  local c
  for c in "${MINIMAX_PYTHON:-}" "${HARNESS_PYTHON:-}" python3 python; do
    [ -n "$c" ] || continue
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import socket' >/dev/null 2>&1; then
      HARNESS_PY="$c"
      return 0
    fi
  done
  return 1
}
