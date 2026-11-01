# hf-env.sh — 生产环境入口
# 用法: source ./hf-env.sh
# 生产只使用本环境提供的 hf（harness 本地锁定的 hyperframes CLI），
# 禁止全局 hyperframes / npx hyperframes 漂移版本。

HF_EXPECTED_VERSION="0.8.36"
HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 网络策略唯一所有者（npm 镜像 / GitHub 代理 / MiniMax 直连豁免）
source "$HARNESS_ROOT/scripts/net-env.sh"
# 跨平台路径与工具解析（Windows / macOS / Linux 唯一真源）
source "$HARNESS_ROOT/scripts/platform-compat.sh"

export PATH="$HARNESS_ROOT/node_modules/.bin:$PATH"

# 离线可跑（能力底线，非网络禁令）：官方 init 默认会联网 git clone skills。
# bootstrap 已按锁定 commit 取回官方 skills 至 vendor/skills/，段脚手架一律跳过该联网检查（官方 CI 逃生口）。
# 需要联网时可覆盖：HYPERFRAMES_SKIP_SKILLS=0
export HYPERFRAMES_SKIP_SKILLS="${HYPERFRAMES_SKIP_SKILLS:-1}"

# 官方 skill 脚本的版本钉死：官方 package-loader.mjs 靠从自身所在目录的祖先链里
# 找名为 hyperframes / @hyperframes/cli 的 package.json 推断版本——本仓的 package.json
# 叫 zwhyperframes-harness，推断必然落空，于是官方 loader **静默退回 @latest**
# （只打印一行 stderr，实测上游 latest 已是 0.8.223，与锁定值差 187 个补丁版）。
# 这里把版本显式告诉它，官方脚本从此没有 @latest 退路。
export HYPERFRAMES_SKILL_PKG_VERSION="${HF_EXPECTED_VERSION}"

hf() {
  local actual cli
  # 解析包内真实入口而不是 node_modules/.bin/hyperframes：
  # Windows 上后者是 npm 生成的 sh 包装脚本，node 会把 shell 语法当 JS 解析并 SyntaxError。
  cli="$(hf_cli_path)" || {
    echo "[hf-env] HF CLI 缺失；先运行 ./scripts/bootstrap.sh" >&2
    return 1
  }
  actual="$(node "$cli" --version 2>/dev/null)" || {
    echo "[hf-env] HF CLI 缺失；先运行 ./scripts/bootstrap.sh" >&2
    return 1
  }
  if [ "$actual" != "$HF_EXPECTED_VERSION" ]; then
    echo "[hf-env] HF CLI 版本漂移（期望 ${HF_EXPECTED_VERSION}，实际 ${actual}）；拒绝执行，先重新 bootstrap" >&2
    return 1
  fi
  node "$cli" "$@"
}

HF_ACTUAL="$(hf --version 2>/dev/null || true)"
if [ "${HF_ACTUAL}" != "$HF_EXPECTED_VERSION" ]; then
  echo "[hf-env] HF CLI 缺失或版本不符（期望 ${HF_EXPECTED_VERSION}，实际 ${HF_ACTUAL:-未找到}）；先运行 ./scripts/bootstrap.sh" >&2
else
  export HF_VERSION_LOCKED="1"
fi

# MiniMax 直连（TTS 脚本自行清除代理；此处仅供提示）
# 解释器要挑一个**真能运行**的：Windows 上 python3 可能是 Microsoft Store 存根，
# 用它跑 TTS 会以「调用失败」告终，而不是报「找不到 python」。
if [ -z "${MINIMAX_PYTHON:-}" ]; then
  if resolve_python; then
    export MINIMAX_PYTHON="$HARNESS_PY"
  else
    export MINIMAX_PYTHON="python3"
    echo "[hf-env] 未找到可用的 Python 解释器；TTS 前请设置 MINIMAX_PYTHON" >&2
  fi
fi

echo "[hf-env] HyperFrames $(hf --version 2>/dev/null || echo "未安装")（锁定 ${HF_EXPECTED_VERSION}）"
echo "[hf-env] 网络：npm=${npm_config_registry} 代理=${HARNESS_PROXY_STATUS} 生产期跳技能联网=${HYPERFRAMES_SKIP_SKILLS}"
