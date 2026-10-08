import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeText, sha256Text, STATE_VERSION, CONTROL_DIR,
  readState, writeState, segmentEntry, findProjectRoot,
} from "../scripts/lib/harness.mjs";
import { tmp } from "./lib/tmp.mjs";

test("normalizeText 去空白与标点", () => {
  assert.equal(normalizeText("你被AI骗过吗？"), "你被AI骗过吗");
  assert.equal(normalizeText(" 一 本，正经地 编！"), "一本正经地编");
});

test("state 读写与回读", () => {
  const root = tmp("zw-harness-test-");
  mkdirSync(join(root, CONTROL_DIR), { recursive: true });
  const state = {
    version: STATE_VERSION,
    project_id: "t",
    products_root: root,
    locked_script: { path: "x", sha256: sha256Text("a"), line_count: 3 },
    segments: [{ id: "01", dir: "01-a", lines: [1, 3], status: "planned", approvals: {}, mp4: null, user_script_sha256: sha256Text("b") }],
    master: { approvals: {}, candidate: null },
    created_at: new Date().toISOString(),
  };
  writeState(root, state);
  const back = readState(root);
  assert.equal(back.segments.length, 1);
  assert.equal(segmentEntry(back, "01").dir, "01-a");
  assert.equal(findProjectRoot(join(root, "01-a")), root);
});

test("state 版本不匹配 fail-closed", () => {
  const root = tmp("zw-harness-test-");
  mkdirSync(join(root, CONTROL_DIR), { recursive: true });
  writeFileSync(join(root, CONTROL_DIR, "state.json"), JSON.stringify({ version: 99 }));
  assert.throws(() => readState(root), /版本不匹配/u);
});
