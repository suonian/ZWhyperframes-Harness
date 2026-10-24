import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const pick = (rel, re, label) => {
  const match = re.exec(read(rel));
  assert.ok(match, `${label} 未找到版本声明：${rel}`);
  return match[1];
};

test("HyperFrames 版本锁定在入口/脚本/CI/依赖六处一致", () => {
  const declared = {
    "hf-env.sh": pick("hf-env.sh", /HF_EXPECTED_VERSION="([^"]+)"/u, "hf-env"),
    "scripts/bootstrap.sh": pick("scripts/bootstrap.sh", /HF_EXPECTED_VERSION="([^"]+)"/u, "bootstrap"),
    "scripts/doctor.sh": pick("scripts/doctor.sh", /\[ "\$V" = "([^"]+)" \]/u, "doctor"),
    "scripts/lib/harness.mjs": pick("scripts/lib/harness.mjs", /HF_EXPECTED_VERSION = "([^"]+)"/u, "harness"),
    ".github/workflows/ci.yml": pick(".github/workflows/ci.yml", /test "\$ACTUAL" = "([^"]+)"/u, "ci"),
    "package.json": pick("package.json", /"hyperframes":\s*"([^"]+)"/u, "package.json"),
  };
  const unique = new Set(Object.values(declared));
  assert.equal(unique.size, 1, `版本声明不一致：${JSON.stringify(declared, null, 2)}`);
});
