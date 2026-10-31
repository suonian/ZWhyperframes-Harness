#!/usr/bin/env bash
# doctor.sh — 环境体检：CLI 版本、skills、浏览器、ffmpeg、MiniMax 凭证
set -uo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/platform-compat.sh
source "$HARNESS_ROOT/scripts/platform-compat.sh"
FAILED=0
check() { if [ "$1" -ne 0 ]; then echo "[doctor] ✗ $2"; FAILED=1; else echo "[doctor] ✓ $2"; fi; }

# 官方 CLI 入口：解析包内真实入口，不走 node_modules/.bin/hyperframes
# （Windows 上后者是 npm 生成的 sh 包装脚本，node 解析会 SyntaxError）。
#
# 执行一律走 hf_cli：cwd=仓库根 + 入口相对路径。**不给 node 绝对 POSIX 路径**——
# 登录 shell 预置 MSYS_NO_PATHCONV=1，MSYS 的参数转换被关闭，/d/foo 会原样送达
# node 并被解析成 <当前盘>\d\foo（实测 MODULE_NOT_FOUND，整份 doctor 结论丢失）。
HF_CLI_READY=0
resolve_hf_cli 2>/dev/null && HF_CLI_READY=1
[ "$HF_CLI_READY" -eq 1 ]; check $? "HF CLI 已安装"
V=""
[ "$HF_CLI_READY" -eq 1 ] && V="$(hf_cli --version 2>/dev/null || true)"
[ "$V" = "0.8.36" ]; check $? "HF CLI 版本 = 0.8.36（实际 ${V:-无}）"

# 官方 `doctor --json` **永远 exit 0**（官方文档原话："always exit 0; gate on payload ok"）。
# 所以判退出码等于没有门禁——官方检查全红也会显示「通过」。必须解析 payload。
# 判定口径（必需项 / Chrome 假阳性 / 可选项）见 scripts/lib/doctor-report.mjs 顶部注释。
# 两个 node 都不收绝对路径：左边走 hf_cli，右边走 hf_node（cwd=仓库根 + 相对脚本路径）。
DOCTOR_VERDICT=""
DOCTOR_RC=0
if [ "$HF_CLI_READY" -eq 1 ]; then
  DOCTOR_VERDICT="$(hf_cli doctor --json 2>/dev/null | hf_node scripts/lib/doctor-report.mjs 2>&1)"
  DOCTOR_RC=$?
fi
if [ -n "$DOCTOR_VERDICT" ]; then
  while IFS= read -r line; do
    case "$line" in
      "✗ "*) echo "[doctor] ✗ ${line#✗ }" ;;
      "! "*) echo "[doctor] ! ${line#! }" ;;
      *) echo "[doctor] ${line#· }" ;;
    esac
  done <<<"$DOCTOR_VERDICT"
else
  echo "[doctor] ✗ 官方 doctor 输出无法取得"
  DOCTOR_RC=1
fi
[ "$DOCTOR_RC" -eq 0 ]; check $? "官方 doctor 必需项全部通过（逐项见上）"

# 官方 skills：bootstrap 按锁定 commit 取回至 vendor/skills/，是本仓运行时的硬依赖。
# 这里只查生产主链真正 import 的四个文件——doctor 是体检，不是完整门禁；
# 完整的 13 项产物清单与 fail-closed 校验在 scripts/bootstrap.sh（HF_REQUIRED_ARTIFACTS）。
VENDOR_SKILLS="$HARNESS_ROOT/vendor/skills"
SKILL_MISSING=""
for f in scripts/captions.mjs scripts/audio.mjs scripts/lib/tokens.mjs scripts/lib/dimensions.mjs; do
  [ -f "$VENDOR_SKILLS/faceless-explainer/$f" ] || SKILL_MISSING="${SKILL_MISSING} ${f}"
done
[ -f "$VENDOR_SKILLS/media-use/audio/scripts/audio.mjs" ] || SKILL_MISSING="${SKILL_MISSING} media-use/audio/scripts/audio.mjs"
[ -z "$SKILL_MISSING" ]
check $? "官方 skills 已按锁定 commit 取回（vendor/skills）${SKILL_MISSING:+；缺:${SKILL_MISSING}}"

command -v ffmpeg >/dev/null 2>&1; check $? "ffmpeg 可用"
command -v ffprobe >/dev/null 2>&1; check $? "ffprobe 可用"

# Python：要挑一个**真能运行**的解释器。Windows 上 python3 可能是 Microsoft Store
# 存根（执行即非零退出、不输出任何东西），用 command -v 判断存在性会把它当成可用。
resolve_python
HARNESS_PY_OK=0
[ -n "$HARNESS_PY" ] && "$HARNESS_PY" -c "import ssl, urllib.request" 2>/dev/null && HARNESS_PY_OK=1
[ "$HARNESS_PY_OK" -eq 1 ]; check $? "MiniMax Python 环境可用${HARNESS_PY:+（${HARNESS_PY}）}"

# MiniMax 凭证：环境变量优先；macOS 另有 Keychain 条目。
# 非 macOS 没有 Keychain，缺失时要给出可执行的指引，而不是只报「缺失」。
KEY=""
KEYCHAIN_SERVICE="${MINIMAX_KEYCHAIN_SERVICE:-MINIMAX_API_KEY}"
if [ -n "${MINIMAX_API_KEY:-}" ]; then
  KEY="env"
elif command -v security >/dev/null 2>&1 \
  && security find-generic-password -a minimax -s "$KEYCHAIN_SERVICE" -w >/dev/null 2>&1; then
  KEY="keychain($KEYCHAIN_SERVICE)"
fi
[ -n "$KEY" ]; check $? "MiniMax API Key（来源：${KEY:-缺失}）"
if [ -z "$KEY" ] && [ "$(uname -s 2>/dev/null || echo unknown)" != "Darwin" ]; then
  echo "[doctor]   提示：本机没有 macOS Keychain，请用环境变量提供：export MINIMAX_API_KEY=<key>"
fi

exit $FAILED
