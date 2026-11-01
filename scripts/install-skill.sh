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
# shellcheck source=scripts/platform-compat.sh
source "$HARNESS_ROOT/scripts/platform-compat.sh"
SLUG="zwhyperframes-harness"

TARGET=""
NO_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir)
      [ $# -ge 2 ] || { echo "[install-skill] --dir 需要目录参数" >&2; exit 2; }
      TARGET="$2"; shift 2 ;;
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
STAGE_DEST="$TARGET/.$SLUG.stage.$$"
cleanup() { rm -rf "$STAGE_DEST"; }
trap cleanup EXIT

# 产物固定落在**仓库内**的 .skillhub-pkg/pkg/，参数全是相对路径：
# cwd=仓库根，node 收到的路径不含盘符、不以 / 开头 → 不会被 MSYS 参数转换改写。
#
# 为什么不用临时目录装包（mktemp -d）：临时目录在仓库外，路径形态无法相对表达，
# 而它唯一的作用是放打包产物——产物落回仓库内的 .skillhub-pkg/pkg/ 即可，
# 既消除了仓库外路径，也消除了「装完还要清临时目录」这一步。
#
# 为什么再嵌一层 pkg/：.skillhub-pkg/ 同时是本仓的**临时产物区**（审计脚本、
# 对照素材都放这里）。包产物与临时产物混在一处时，install 会把临时文件
# 一并装进技能目录——技能目录里出现用户没要求的东西。
SRC="$HARNESS_ROOT/.skillhub-pkg/pkg"
if [ "$NO_BUILD" -eq 0 ]; then
  echo "[install-skill] 打包（按平台准入规则过滤并校验）…"
  hf_node scripts/build-skill-package.mjs --root . --out .skillhub-pkg/pkg >/dev/null
fi

# fail-closed：装之前先验入口文件
if [ ! -f "$SRC/SKILL.md" ]; then
  echo "[install-skill] 产物不存在或缺少 SKILL.md：${SRC}" >&2
  echo "  （--no-build 模式需要仓库里已有 .skillhub-pkg/；否则先不带 --no-build 重跑）" >&2
  exit 1
fi

# 先完整复制到同目录暂存区：复制失败不会碰已安装版本。
rm -rf "$STAGE_DEST"
mkdir -p "$STAGE_DEST"
cp -R "$SRC/." "$STAGE_DEST/"

# 再就地同步进正式目录：**不删目录、不搬走旧树**。
#
# 为什么不是「rm -rf 旧目录 → mv 新目录上去」：
#   Windows 上**被进程持有句柄的目录不能重命名**（MoveFileEx → ERROR_ACCESS_DENIED）。
#   实测：装好的技能目录（vendor/skills 正在被技能加载器读取）整棵 mv 会失败，
#   而同样的树重新 cp 一份就能 mv —— 失败的是「那一份被占用的旧树」，不是内容。
#   旧写法把 vendor/node_modules 挪到一边再 mv，等于每次重装都去动那棵被占用的树。
#
# 就地同步的语义：包内文件覆盖更新，包外残留删除，
# **node_modules（依赖）与 vendor（锁定 commit 的官方 skills）原地保留**——
# 它们是 bootstrap 的产物，不在分发包里，重装不该逼用户重新下载。
mkdir -p "$DEST"
cp -R "$STAGE_DEST/." "$DEST/"

# 清理包外残留：包内清单之外的普通文件（保留 node_modules / vendor）。
# 用文件清单做差集，不用「整目录删除」——删除不需要 rename，Windows 上更稳。
STAGE_LIST="$(mktemp)"
DEST_LIST="$(mktemp)"
( cd "$SRC" && find . -type f -print ) | LC_ALL=C sort > "$STAGE_LIST"
( cd "$DEST" && find . -type f -not -path './node_modules/*' -not -path './vendor/*' -print ) | LC_ALL=C sort > "$DEST_LIST"
if [ -s "$STAGE_LIST" ]; then
  # comm 要求两个输入的排序规则与它自己一致：sort 与 comm 必须同为 LC_ALL=C，
  # 否则 comm 会报 "not in sorted order" 并拒绝比较。
  LC_ALL=C comm -13 "$STAGE_LIST" "$DEST_LIST" | while IFS= read -r stale; do
    [ -n "$stale" ] && rm -f "$DEST/$stale"
  done
else
  echo "[install-skill] 包内文件清单为空，拒绝清理已安装目录" >&2
  exit 1
fi
rm -f "$STAGE_LIST" "$DEST_LIST"

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
