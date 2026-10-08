#!/usr/bin/env bash
# bootstrap.sh — 可复现环境准备：锁定 HF CLI + 官方 skills 刷新 + 本地能力索引
# 网络策略由 net-env.sh 统一提供（npm 中国大陆镜像 + GitHub 走 127.0.0.1:7890）。
set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF_EXPECTED_VERSION="0.8.36"

# shellcheck source=scripts/net-env.sh
source "$HARNESS_ROOT/scripts/net-env.sh"
echo "[bootstrap] 网络策略：npm=${npm_config_registry} 代理=${HARNESS_PROXY_STATUS}"
if [ "$HARNESS_PROXY_STATUS" != "off（显式关闭）" ] && command -v nc >/dev/null 2>&1; then
  _proxy_port="${HARNESS_PROXY##*:}"
  case "$_proxy_port" in
    ''|*[!0-9]*) ;; # 代理地址未带端口，跳过探测（无法解析）
    *) nc -z -G 1 127.0.0.1 "$_proxy_port" 2>/dev/null ||
      echo "[bootstrap] 警告：代理 ${HARNESS_PROXY} 不可达；GitHub 拉取将挂死。用 HARNESS_NO_PROXY=1 显式关闭。" >&2 ;;
  esac
fi

echo "[bootstrap] 安装锁定依赖（hyperframes@${HF_EXPECTED_VERSION}）…"
# 固定 npm：仓库锁文件是 package-lock.json（bun 会另生成 bun.lock 造成双锁漂移）。
npm install --prefix "$HARNESS_ROOT"

echo "[bootstrap] 校验 HF CLI 版本…"
ACTUAL="$(node "$HARNESS_ROOT/node_modules/.bin/hyperframes" --version 2>/dev/null || true)"
if [ "${ACTUAL}" != "${HF_EXPECTED_VERSION}" ]; then
  echo "HF CLI 版本不匹配：期望 ${HF_EXPECTED_VERSION}，实际 ${ACTUAL:-未找到}" >&2
  exit 1
fi

echo "[bootstrap] 刷新官方 skills（faceless-explainer 及依赖）…"
node "$HARNESS_ROOT/node_modules/.bin/hyperframes" skills update faceless-explainer

echo "[bootstrap] 完成。生产前先 source ./hf-env.sh 并运行 npm run doctor。"
