#!/usr/bin/env bash
# bootstrap.sh — 可复现环境准备：锁定 HF CLI + 官方 skills 刷新 + 本地能力索引
# 中国大陆镜像安装；GitHub 资源走 127.0.0.1:7890；MiniMax 直连不在此脚本内。
set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF_EXPECTED_VERSION="0.8.36"

export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"

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
