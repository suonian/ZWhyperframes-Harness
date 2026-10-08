#!/usr/bin/env bash
# net-env.sh — 网络策略唯一所有者（被 bootstrap.sh 与 hf-env.sh source）
#
# 纪律（AGENTS.md「版本与网络」）：
#   · 下载优先中国大陆源：npm → registry.npmmirror.com
#   · GitHub/npm 走本地代理 127.0.0.1:7890
#   · MiniMax 直连 api.minimaxi.com，不走代理
#
# 逃生口：
#   HARNESS_NO_PROXY=1 或 HARNESS_PROXY=""  → 完全关闭代理
#   代理端口不可用时必须显式关闭，否则 git clone 会静默挂死（无超时）。
#
# 注意：MiniMax 直连有第二道保险——tools/minimax/scripts/*.py 的
# disable_proxy_for_minimax() 会主动清除全部代理变量。

# 代理地址可覆盖：HARNESS_PROXY=http://127.0.0.1:7890（默认）
HARNESS_PROXY="${HARNESS_PROXY-http://127.0.0.1:7890}"
HARNESS_NO_PROXY="${HARNESS_NO_PROXY-0}"

# npm 走中国大陆镜像（GitHub 资源由代理解决，见下）
export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"

if [ "$HARNESS_NO_PROXY" = "1" ] || [ -z "$HARNESS_PROXY" ]; then
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
  HARNESS_PROXY_STATUS="off（显式关闭）"
else
  export HTTP_PROXY="$HARNESS_PROXY"
  export HTTPS_PROXY="$HARNESS_PROXY"
  export ALL_PROXY="$HARNESS_PROXY"
  export http_proxy="$HARNESS_PROXY"
  export https_proxy="$HARNESS_PROXY"
  export all_proxy="$HARNESS_PROXY"
  HARNESS_PROXY_STATUS="$HARNESS_PROXY"
fi

# 直连豁免：本机 + MiniMax 国内 API。追加而非覆盖调用方已有设置（重复项无害，代理库自身会去重）。
HARNESS_DIRECT_HOSTS="localhost,127.0.0.1,::1,api.minimaxi.com,api.minimax.chat"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}$HARNESS_DIRECT_HOSTS"
export no_proxy="$NO_PROXY"