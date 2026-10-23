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

# 官方 skills：bootstrap 按锁定 commit 取回至 vendor/skills/，是本仓运行时的硬依赖。
# 这里只查生产主链真正 import 的四个文件——doctor 是体检，不是完整门禁；
# 完整的 10 项产物清单与 fail-closed 校验在 scripts/bootstrap.sh。
VENDOR_SKILLS="$HARNESS_ROOT/vendor/skills"
SKILL_MISSING=""
for f in scripts/captions.mjs scripts/audio.mjs scripts/lib/tokens.mjs scripts/lib/dimensions.mjs; do
  [ -f "$VENDOR_SKILLS/faceless-explainer/$f" ] || SKILL_MISSING="${SKILL_MISSING} ${f}"
done
[ -z "$SKILL_MISSING" ]
check $? "官方 skills 已按锁定 commit 取回（vendor/skills）${SKILL_MISSING:+；缺:${SKILL_MISSING}}"

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
