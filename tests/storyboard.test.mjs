import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStoryboard } from "../scripts/lib/storyboard.mjs";

const SAMPLE = `---
format: 1920x1080
duration: 40s
message: "测试消息"
music: confident minimal tech underscore
mode: autonomous
---

## Frame 1 — 开场

- scene: 价格牌撞入
- voiceover: "你现在免费用的东西，很快要收钱。"
- duration: 3.1s
- transition_in: cut
- src: compositions/frames/01-hook.html

叙事正文。

## Frame 2 — 中段

- scene: 时间线
- vo: "过去一年大家都在用。"
- duration: 5s
`;

test("解析帧编号与 voiceover（含别名）", () => {
  const board = parseStoryboard(SAMPLE);
  assert.equal(board.frames.length, 2);
  assert.equal(board.frames[0].number, 1);
  assert.equal(board.frames[0].voiceover, "你现在免费用的东西，很快要收钱。");
  assert.equal(board.frames[1].voiceover, "过去一年大家都在用。");
});

test("解析 frontmatter（music/mode/format）", () => {
  const board = parseStoryboard(SAMPLE);
  assert.equal(board.globals.music, "confident minimal tech underscore");
  assert.equal(board.globals.mode, "autonomous");
  assert.equal(board.globals.format, "1920x1080");
});

test("Frame/Beat/Scene 标题均接受", () => {
  const board = parseStoryboard("## Beat 3 — X\n- voiceover: a\n\n## Scene 4 — Y\n- narration: b\n");
  assert.equal(board.frames.length, 2);
  assert.equal(board.frames[0].number, 3);
  assert.equal(board.frames[1].number, 4);
  assert.equal(board.frames[1].voiceover, "b");
});
