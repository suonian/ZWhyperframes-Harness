# hf-env.sh — 生产环境入口
# 用法: source ./hf-env.sh
# 生产只使用本环境提供的 hf（harness 本地锁定的 hyperframes CLI），
# 禁止全局 hyperframes / npx hyperframes 漂移版本。

HF_EXPECTED_VERSION="0.8.36"
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 网络策略唯一所有者（npm 镜像 / GitHub 代理 / MiniMax 直连豁免）
source "$HARNESS_ROOT/scripts/net-env.sh"

export PATH="$HARNESS_ROOT/node_modules/.bin:$PATH"

# 离线可跑（能力底线，非网络禁令）：官方 init 默认会联网 git clone skills。
# bootstrap 已刷新官方 skills，段脚手架一律跳过该联网检查（官方 CI 逃生口）。
# 需要联网时可覆盖：HYPERFRAMES_SKIP_SKILLS=0
export HYPERFRAMES_SKIP_SKILLS="${HYPERFRAMES_SKIP_SKILLS:-1}"

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
echo "[hf-env] 网络：npm=${npm_config_registry} 代理=${HARNESS_PROXY_STATUS} 生产期跳技能联网=${HYPERFRAMES_SKIP_SKILLS}"
