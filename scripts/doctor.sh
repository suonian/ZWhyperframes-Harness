#!/usr/bin/env bash
# doctor.sh — 环境体检：CLI 版本、skills、浏览器、ffmpeg、MiniMax 凭证
set -uo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0
check() { if [ "$1" -ne 0 ]; then echo "[doctor] ✗ $2"; FAILED=1; else echo "[doctor] ✓ $2"; fi; }

HF="node $HARNESS_ROOT/node_modules/.bin/hyperframes"
[ -x "$HARNESS_ROOT/node_modules/.bin/hyperframes" ]; check $? "HF CLI 已安装"
V="$($HF --version 2>/dev/null || true)"
[ "$V" = "0.8.36" ]; check $? "HF CLI 版本 = 0.8.36（实际 ${V:-无}）"

$HF doctor --json >/dev/null 2>&1; check $? "hyperframes doctor 通过"

command -v ffmpeg >/dev/null 2>&1; check $? "ffmpeg 可用"
command -v ffprobe >/dev/null 2>&1; check $? "ffprobe 可用"

python3 -c "import ssl, urllib.request" 2>/dev/null; check $? "MiniMax Python 环境可用"

KEY=""
KEYCHAIN_SERVICE="${MINIMAX_KEYCHAIN_SERVICE:-MINIMAX_API_KEY}"
if [ -n "${MINIMAX_API_KEY:-}" ]; then KEY="env"; else
  security find-generic-password -a minimax -s "$KEYCHAIN_SERVICE" -w >/dev/null 2>&1 && KEY="keychain($KEYCHAIN_SERVICE)"
fi
[ -n "$KEY" ]; check $? "MiniMax API Key（来源：${KEY:-缺失}）"

exit $FAILED
