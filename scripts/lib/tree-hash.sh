#!/usr/bin/env bash
# tree-hash.sh — 内容树的聚合哈希（bootstrap 取回校验用）
#
# 性质：单步、幂等、确定性、零 agent 调用。
# 被 scripts/bootstrap.sh source。

# tree_hash <目录> —— 输出该目录内容树的聚合哈希（十六进制）。
#
# 两个要点（都是实测踩出来的）：
#   1. 在目录**内部**以相对路径计算：哈希与安装位置无关（同一棵树换个盘符放，
#      哈希不变）。把绝对路径也算进内容，等于「路径+内容」哈希——
#      换个机器就"漂移"，而且漂移原因与内容无关，排查会被带偏。
#   2. 用 -print0 + sort -z + read -d '' 逐个处理，**不依赖 xargs**：
#      xargs 默认按空白切词，文件名含空格就被拆成多个参数
#      （实测报 "cat: /tmp/…/My: No such file or directory"），
#      且在 set -euo pipefail 下无声中止（exit 123，没有任何错误提示）。
tree_hash() {
  local dir="$1"
  [ -d "$dir" ] || return 1
  local hasher
  if command -v shasum >/dev/null 2>&1; then
    hasher="shasum -a 256"
  else
    hasher="sha256sum"
  fi
  (
    cd "$dir" || return 1
    find . -type f -print0 \
      | LC_ALL=C sort -z \
      | while IFS= read -r -d '' f; do $hasher "$f"; done
  ) | $hasher | awk '{print $1}'
}
