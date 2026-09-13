# hf-env.sh — 生产环境入口
# 用法: source ./hf-env.sh
# 生产只使用本环境提供的 hf（harness 本地锁定的 hyperframes CLI），
# 禁止全局 hyperframes / npx hyperframes 漂移版本。

HF_EXPECTED_VERSION="0.8.36"
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PATH="$HARNESS_ROOT/node_modules/.bin:$PATH"

hf() {
  node "$HARNESS_ROOT/node_modules/.bin/hyperframes" "$@"
}

HF_ACTUAL="$(hf --version 2>/dev/null || true)"
if [ "${HF_ACTUAL}" != "${HF_EXPECTED_VERSION}" ]; then
  echo "[hf-env] HF CLI 缺失或版本不符（期望 ${HF_EXPECTED_VERSION}，实际 ${HF_ACTUAL:-未找到}）；先运行 ./scripts/bootstrap.sh" >&2
else
  export HF_VERSION_LOCKED="1"
fi

# MiniMax 直连（TTS 脚本自行清除代理；此处仅供提示）
export MINIMAX_PYTHON="${MINIMAX_PYTHON:-python3}"

echo "[hf-env] HyperFrames $(hf --version 2>/dev/null || echo "未安装")（锁定 ${HF_EXPECTED_VERSION}）"
