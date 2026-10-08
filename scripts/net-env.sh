#!/usr/bin/env bash
# net-env.sh — 网络策略唯一所有者（被 bootstrap.sh 与 hf-env.sh source）
#
# 纪律（AGENTS.md「版本与网络」）：
#   · 下载优先中国大陆源：npm → registry.npmmirror.com
#   · GitHub/npm 走本地代理（默认探测 http://127.0.0.1:7890，可达才启用）
#   · MiniMax 直连 api.minimaxi.com，不走代理
#
# 覆盖方式：
#   HARNESS_NO_PROXY=1            强制关闭代理
#   HARNESS_PROXY=<地址>          显式指定（不做探测，按你的设置走）
#   HARNESS_PROXY=""              等同强制关闭
#
# 为什么默认要探测：把代理指向一个不存在的本地端口会让 git / npm **静默挂死**
# （无超时），这对没开代理的开发者是致命的。探测可达才启用，两种环境都不需改配置。
# 探测用带 1s 超时的 python3（本项目已是硬依赖），绝不用 nc / bash /dev/tcp——
# 那两者在「静默丢包」时自身会挂死，正好是要避免的故障。

HARNESS_PROXY_DEFAULT="http://127.0.0.1:7890"
HARNESS_NO_PROXY="${HARNESS_NO_PROXY-0}"

# npm 走中国大陆镜像（GitHub 资源由代理解决，见下）
export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"

# 带硬超时的端口探测；不可用时返回 2（表示「无法判断」）。
probe_proxy() {
  python3 - "$1" <<'PY' 2>/dev/null
import socket, sys
host, _, port = sys.argv[1].partition(":")
try:
    socket.create_connection((host, int(port)), timeout=1).close()
except Exception:
    sys.exit(1)
PY
}

disable_proxy() {
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  HARNESS_PROXY_STATUS="off"
  HARNESS_PROXY_REASON="${1:-显式关闭}"
}

if [ "$HARNESS_NO_PROXY" = "1" ]; then
  disable_proxy "HARNESS_NO_PROXY=1"
elif [ -z "${HARNESS_PROXY+set}" ]; then
  # 未设置 → 自动探测默认代理：可达才启用。
  if probe_proxy "${HARNESS_PROXY_DEFAULT#*://}"; then
    export HTTP_PROXY="$HARNESS_PROXY_DEFAULT" HTTPS_PROXY="$HARNESS_PROXY_DEFAULT" ALL_PROXY="$HARNESS_PROXY_DEFAULT"
    export http_proxy="$HARNESS_PROXY_DEFAULT" https_proxy="$HARNESS_PROXY_DEFAULT" all_proxy="$HARNESS_PROXY_DEFAULT"
    HARNESS_PROXY_STATUS="$HARNESS_PROXY_DEFAULT"
    HARNESS_PROXY_REASON="探测可达，自动启用"
  else
    disable_proxy "探测 ${HARNESS_PROXY_DEFAULT#*://} 不可达，直连（需代理请设 HARNESS_PROXY=<地址>）"
  fi
elif [ -z "$HARNESS_PROXY" ]; then
  disable_proxy "HARNESS_PROXY 为空"
else
  # 用户显式指定：信任设置，不做探测。
  export HTTP_PROXY="$HARNESS_PROXY" HTTPS_PROXY="$HARNESS_PROXY" ALL_PROXY="$HARNESS_PROXY"
  export http_proxy="$HARNESS_PROXY" https_proxy="$HARNESS_PROXY" all_proxy="$HARNESS_PROXY"
  HARNESS_PROXY_STATUS="$HARNESS_PROXY"
  HARNESS_PROXY_REASON="显式指定"
fi

# 直连豁免：本机 + MiniMax 国内 API。追加而非覆盖调用方已有设置（重复项无害，代理库自身会去重）。
HARNESS_DIRECT_HOSTS="localhost,127.0.0.1,::1,api.minimaxi.com,api.minimax.chat"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}$HARNESS_DIRECT_HOSTS"
export no_proxy="$NO_PROXY"