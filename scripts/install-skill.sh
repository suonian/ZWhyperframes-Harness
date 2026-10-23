#!/usr/bin/env bash
# install-skill.sh — 把本仓安装到客户端的技能发现目录
#
# 为什么需要这个脚本：SkillHub CLI 的默认安装路径不是任何客户端的发现路径
# （实测默认落在 /private/tmp/skills/），且该 CLI 不写 AGENTS.md 的 <skill> 索引块。
# 协议 §8.4 规定的发现目录优先级为：
#   ./.agents/skills  →  ~/.agents/skills  →  ./.claude/skills  →  ~/.claude/skills
#
# 性质：单步、幂等、确定性、零 agent 调用。重复执行覆盖同一目标目录。
set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG="zwhyperframes-harness"

TARGET=""
NO_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) TARGET="$2"; shift 2 ;;
    --no-build) NO_BUILD=1; shift ;;
    -h|--help)
      echo "用法: bash scripts/install-skill.sh [--dir <发现目录>] [--no-build]"
      echo "  --dir       显式指定安装目录；不给则按协议 §8.4 优先级探测"
      echo "  --no-build  跳过重新打包，直接用 --dir 之外的现有产物"
      exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

# 探测发现目录：显式 > 依次探测既有的四个 > 回落到 ~/.agents/skills
if [ -z "$TARGET" ]; then
  for cand in \
    "$PWD/.agents/skills" \
    "$HOME/.agents/skills" \
    "$PWD/.claude/skills" \
    "$HOME/.claude/skills" \
  ; do
    if [ -d "$cand" ] && [ -w "$cand" ]; then TARGET="$cand"; break; fi
  done
fi
if [ -z "$TARGET" ]; then
  TARGET="$HOME/.agents/skills"
  echo "[install-skill] 未发现既有发现目录，回落到 ${TARGET}"
fi
mkdir -p "$TARGET"

DEST="$TARGET/$SLUG"
STAGING="$(mktemp -d)"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

if [ "$NO_BUILD" -eq 0 ]; then
  echo "[install-skill] 打包（按平台准入规则过滤并校验）…"
  node "$HARNESS_ROOT/scripts/build-skill-package.mjs" --root "$HARNESS_ROOT" --out "$STAGING/pkg" >/dev/null
  SRC="$STAGING/pkg"
else
  SRC="$HARNESS_ROOT/.skillhub-pkg"
  if [ ! -f "$SRC/SKILL.md" ]; then
    echo "[install-skill] --no-build 但产物不存在：$SRC" >&2
    exit 1
  fi
fi

# fail-closed：装之前先验入口文件
if [ ! -f "$SRC/SKILL.md" ]; then
  echo "[install-skill] 产物缺少 SKILL.md，拒绝安装" >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

COUNT=$(find "$DEST" -type f | wc -l | tr -d ' ')
echo "[install-skill] 已安装 $COUNT 个文件 → $DEST"
echo "[install-skill] 发现目录：$TARGET"

cat <<'EOF'

[install-skill] 下一步：
  1. 在该目录下执行 bootstrap —— 技能包不含 node_modules：
       cd <发现目录>/zwhyperframes-harness && npm run bootstrap
  2. 源入生产环境入口（必须在 bootstrap 之后）：
       source ./hf-env.sh
  3. 注意：当前 SkillHub CLI 不写 AGENTS.md 的 <skill> 索引块，
     需在会话中显式点名本技能，或在项目 AGENTS.md 中手工引用 SKILL.md。
EOF
