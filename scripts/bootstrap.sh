#!/usr/bin/env bash
# bootstrap.sh — 可复现环境准备：锁定 HF CLI + 按锁定 commit 取回官方 skills + 本地能力索引
# 网络策略由 net-env.sh 统一提供（npm 中国大陆镜像 + GitHub 走 127.0.0.1:7890）。
set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HF_EXPECTED_VERSION="0.8.36"

# ── 官方 skills 的锁定来源 ────────────────────────────────────────────────
# 为什么不用 `hyperframes skills update <name>`：
#   该命令把「latest」硬编码为上游 main 的**实时 HEAD**（CLI 源码：
#   resolveLatestManifest 的 canonical 分支 + SOURCES 的固定 url），无法固定到本仓
#   声明的锁定 commit。上游 2026-10-21（PR #5651，破坏性变更）退役 workflow 类 skills
#   后，它会直接报「Unknown skill(s): faceless-explainer」并让 CI 全红。
#
# 为什么不用 `npx skills add owner/repo@<sha>`：
#   实测该语法只在**发现阶段**认了 sha（提示 Found 13 skills），实际装出来的内容
#   逐字节等于 main HEAD——它无法真正按 commit 固定。
#
# 因此这里直接用 git 按 SHA 取回（GitHub 支持按可达 SHA fetch），再由本仓脚本
# 从 vendor/skills/ 解析官方产物——这是唯一实测可复现的取回方式。
HF_SKILLS_REPO_URL="https://github.com/heygen-com/hyperframes.git"
HF_SKILLS_REPO_SSH="git@github.com:heygen-com/hyperframes.git"
HF_SKILLS_COMMIT="f86aae655ae5aae7a9a2c124fa016f3bc30ebe52"   # == 上游 tag v0.8.36
HF_SKILLS_TAG="v0.8.36"                                       # 同一 commit 的 tag 形态
VENDOR_SKILLS="$HARNESS_ROOT/vendor/skills"

# 本仓规则与脚本实际引用的官方产物（取回后逐项 fail-closed 校验）。
# 路径为**锁定 commit 下**的真实路径——见 docs/architecture/hf-contract-audit-2026-10-21.md。
HF_REQUIRED_ARTIFACTS="faceless-explainer/scripts/captions.mjs
faceless-explainer/scripts/audio.mjs
faceless-explainer/scripts/build-frame.mjs
faceless-explainer/scripts/frame-packets.mjs
hyperframes-core/references/frame-worker-core.md
hyperframes-core/references/subagent-dispatch.md
hyperframes-core/references/brief-contract.md
hyperframes-core/references/review-loop.md
hyperframes-core/references/storyboard-format.md
hyperframes/references/pitch-round.md"

# shellcheck source=scripts/net-env.sh
source "$HARNESS_ROOT/scripts/net-env.sh"
# 代理可达性由 net-env.sh 探测并给出原因，此处只做提示，不重复探测——
# 重复探测既冗余，又会在 HARNESS_PROXY 未设置时于 set -u 下崩溃。
echo "[bootstrap] 网络策略：npm=${npm_config_registry}"
echo "[bootstrap] 代理状态：${HARNESS_PROXY_STATUS}（${HARNESS_PROXY_REASON}）"

echo "[bootstrap] 安装锁定依赖（hyperframes@${HF_EXPECTED_VERSION}）…"
# 固定 npm：仓库锁文件是 package-lock.json（bun 会另生成 bun.lock 造成双锁漂移）。
npm install --prefix "$HARNESS_ROOT"

echo "[bootstrap] 校验 HF CLI 版本…"
ACTUAL="$(node "$HARNESS_ROOT/node_modules/.bin/hyperframes" --version 2>/dev/null || true)"
if [ "${ACTUAL}" != "${HF_EXPECTED_VERSION}" ]; then
  echo "HF CLI 版本不匹配：期望 ${HF_EXPECTED_VERSION}，实际 ${ACTUAL:-未找到}" >&2
  exit 1
fi

echo "[bootstrap] 按锁定 commit 取回官方 skills（${HF_SKILLS_COMMIT}）…"
# 幂等：vendor 里已锁定在同一个 commit 且产物齐全时不重新下载。
# 这既省掉一次完整网络取回，也让重复 bootstrap 的代价降到秒级。
VENDOR_STAMP="$HARNESS_ROOT/vendor/.skills-commit"
SKILLS_READY=0
if [ -f "$VENDOR_STAMP" ] && [ "$(cat "$VENDOR_STAMP" 2>/dev/null || true)" = "$HF_SKILLS_COMMIT" ]; then
  if [ -d "$VENDOR_SKILLS" ]; then
    echo "[bootstrap] vendor/skills 已锁定在 ${HF_SKILLS_COMMIT}，跳过取回。"
    SKILLS_READY=1
  fi
fi

if [ "$SKILLS_READY" -ne 1 ]; then
  TMP="$(mktemp -d)"
  cleanup() { rm -rf "$TMP"; }
  trap cleanup EXIT
  git -C "$TMP" init -q
  git -C "$TMP" remote add origin "$HF_SKILLS_REPO_URL"
  git -C "$TMP" config core.sparseCheckout true
  git -C "$TMP" sparse-checkout set skills

  # 取回路径：外层换传输通路，内层换 ref 形态，四种组合逐一尝试。
  #   通路 HTTPS —— CI runner 上没有 SSH 密钥，但 HTTPS 直连可用；
  #        SSH   —— 部分本机环境的 git HTTPS 传输不稳（LibreSSL + 代理），SSH 更可靠。
  #   ref  按 SHA —— GitHub 支持按可达 SHA 取回；
  #       按 tag —— 若服务端拒绝按 SHA 请求，退回按 tag 取回（tag 指向同一 commit）。
  # --filter=blob:none 只取 commit 与 tree，blob 在 checkout 时按需拉取：
  #   否则一次 fetch 会把整仓该 commit 的全部 blob 传下来，与本仓只取 skills/ 的
  #   需求无关，且在慢速链路上耗时不必要。
  # 每一次成功 fetch 都立刻用 rev-parse 校验取回的确实是锁定 commit——
  #   「fetch 返回 0」不等于「取回了锁定的那一个」。
  FETCHED=0
  GOT_SHA=""
  for url in "$HF_SKILLS_REPO_URL" "$HF_SKILLS_REPO_SSH"; do
    git -C "$TMP" remote set-url origin "$url"
    for ref in "$HF_SKILLS_COMMIT" "refs/tags/${HF_SKILLS_TAG}"; do
      echo "[bootstrap] 尝试取回：${url} ${ref}"
      if git -C "$TMP" fetch --depth 1 --filter=blob:none origin "$ref"; then
        CANDIDATE="$(git -C "$TMP" rev-parse FETCH_HEAD 2>/dev/null || true)"
        if [ "$CANDIDATE" = "$HF_SKILLS_COMMIT" ]; then
          FETCHED=1
          GOT_SHA="$CANDIDATE"
          break
        fi
        echo "[bootstrap] 取回的是 ${CANDIDATE:-未知}，与锁定值不符，继续尝试…"
      fi
      echo "[bootstrap] 该组合失败，尝试下一组合…"
    done
    [ "$FETCHED" -eq 1 ] && break
  done
  if [ "$FETCHED" -ne 1 ]; then
    echo "取回锁定 commit 失败：${HF_SKILLS_COMMIT}（tag ${HF_SKILLS_TAG}）" >&2
    echo "按 AGENTS.md 的规则，这是**合同审计**信号，不是可静默跳过的失败。" >&2
    exit 1
  fi
  echo "[bootstrap] 取回并校验通过：${GOT_SHA}"
  git -C "$TMP" checkout -q FETCH_HEAD
  # 校验取回的确实是该 commit，而不是被远端改写
  GOT_SHA="$(git -C "$TMP" rev-parse HEAD)"
  if [ "${GOT_SHA}" != "${HF_SKILLS_COMMIT}" ]; then
    echo "取回的 commit 与锁定值不符：期望 ${HF_SKILLS_COMMIT}，实际 ${GOT_SHA}" >&2
    exit 1
  fi
  if [ ! -d "$TMP/skills" ]; then
    echo "锁定 commit ${HF_SKILLS_COMMIT} 下不存在 skills/ 目录——上游结构已变，属合同审计信号。" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$VENDOR_SKILLS")"
  # 旧的 vendor/skills 先挪走再落新的：删除的代价随内容量级变化
  # （在带可恢复删除 shim 的环境里，rm -rf 实测可达分钟级），挪动是 O(1) 的。
  if [ -e "$VENDOR_SKILLS" ]; then
    mv "$VENDOR_SKILLS" "$TMP/old-skills"
  fi
  cp -R "$TMP/skills" "$VENDOR_SKILLS"
  printf '%s\n' "$HF_SKILLS_COMMIT" > "$VENDOR_STAMP"
fi

echo "[bootstrap] 校验官方 skills 关键产物…"
MISSING=""
# 清单是换行分隔的，用 while read 逐行读，避免依赖 word splitting
while IFS= read -r artifact; do
  [ -z "$artifact" ] && continue
  [ -f "${VENDOR_SKILLS}/${artifact}" ] || MISSING="${MISSING} ${artifact}"
done <<EOF
${HF_REQUIRED_ARTIFACTS}
EOF
if [ -n "${MISSING}" ]; then
  echo "锁定 commit 的官方 skills 缺少关键产物：${MISSING}" >&2
  echo "这意味着上游在 ${HF_SKILLS_COMMIT} 之后的合同已变——按 AGENTS.md 的规则，" >&2
  echo "这属于**合同审计**任务，不是可静默跳过的失败。" >&2
  exit 1
fi

# 把锁定版本的官方 skill 暴露给各智能体的发现目录（软链到 vendor，vendor 是唯一真源）。
# 上游 skill 的内容随 commit 变，agent 目录里若留着别的版本，会与本仓规则引用的
# 合同文本不一致——那正是「规则说 A、实际跑 B」的漂移。
#
# 替换一律用 `ln -sfn` 原地改指向，而不是「删除后再建」：
# 软链的替换是 O(1) 的，而删除的代价随目录内容量级变化
# （在带可恢复删除 shim 的环境里，逐项 rm -rf 实测可达分钟级）。
# 只有当目标确实是**真实目录**（上游 CLI 或用户手工装下的旧版本）时才需要挪走，
# 且统一挪到暂存区、末尾一次性清理，避免 N 次慢删除。
echo "[bootstrap] 链接官方 skills 到智能体发现目录…"
SUPERSEDED="$(mktemp -d "$HOME/.harness-superseded.XXXXXX")"
for root in "$HOME/.agents/skills" "$HOME/.claude/skills" "$HOME/.config/opencode/skills"; do
  [ -d "$root" ] || continue
  for skill_dir in "$VENDOR_SKILLS"/*/; do
    [ -f "${skill_dir}SKILL.md" ] || continue
    name="$(basename "$skill_dir")"
    target="$root/$name"
    src="${skill_dir%/}"
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "[bootstrap]   替换既有目录（版本漂移源）：${target}"
      mv "$target" "$SUPERSEDED/$(basename "$root")-$name"
    fi
    ln -sfn "$src" "$target"
  done
done
# 清理被替换下来的旧版本（统一一次，避免逐项慢删除）
if [ -n "$(ls -A "$SUPERSEDED" 2>/dev/null)" ]; then
  rm -rf "$SUPERSEDED"
else
  rmdir "$SUPERSEDED" 2>/dev/null || true
fi

echo "[bootstrap] 完成。生产前先 source ./hf-env.sh 并运行 npm run doctor。"
