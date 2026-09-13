import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTitles, validateFrameCoverage, mapFramesToWords, buildVoices,
} from "../scripts/lib/audio-inject.mjs";

// MiniMax titles 典型形状：句级字符索引（pronounce 文本）+ 词级毫秒时间。
const TITLES = [
  {
    text: "你现在免费用的AI技能，很快就要收钱了。",
    time_begin: 0, time_end: 1800, text_begin: 0, text_end: 18,
    timestamped_words: [
      { word: "你", word_begin: 0, word_end: 1, time_begin: 0, time_end: 120 },
      { word: "现在", word_begin: 1, word_end: 3, time_begin: 120, time_end: 320 },
      { word: "免费", word_begin: 3, word_end: 5, time_begin: 320, time_end: 560 },
      { word: "用的", word_begin: 5, word_end: 7, time_begin: 560, time_end: 780 },
      { word: "AI", word_begin: 7, word_end: 9, time_begin: 780, time_end: 960 },
      { word: "技能", word_begin: 9, word_end: 11, time_begin: 960, time_end: 1160 },
      { word: "很快", word_begin: 11, word_end: 13, time_begin: 1160, time_end: 1360 },
      { word: "就要", word_begin: 13, word_end: 15, time_begin: 1360, time_end: 1540 },
      { word: "收钱", word_begin: 15, word_end: 17, time_begin: 1540, time_end: 1720 },
      { word: "了", word_begin: 17, word_end: 18, time_begin: 1720, time_end: 1800 },
    ],
  },
  {
    text: "过去一年所有人都在用。",
    time_begin: 1800, time_end: 3600, text_begin: 18, text_end: 28,
    timestamped_words: [
      { word: "过去", word_begin: 0, word_end: 2, time_begin: 1800, time_end: 2050 },
      { word: "一年", word_begin: 2, word_end: 4, time_begin: 2050, time_end: 2280 },
      { word: "所有", word_begin: 4, word_end: 6, time_begin: 2280, time_end: 2520 },
      { word: "人", word_begin: 6, word_end: 7, time_begin: 2520, time_end: 2680 },
      { word: "都在", word_begin: 7, word_end: 9, time_begin: 2680, time_end: 2920 },
      { word: "用", word_begin: 9, word_end: 10, time_begin: 2920, time_end: 3050 },
    ],
  },
];

test("帧覆盖校验：一致通过", () => {
  const frames = [
    { number: 1, voiceover: "你现在免费用的AI技能，很快就要收钱了。" },
    { number: 2, voiceover: "过去一年所有人都在用。" },
  ];
  const norm = validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。过去一年所有人都在用。");
  assert.equal(norm, "你现在免费用的AI技能很快就要收钱了过去一年所有人都在用");
});

test("帧覆盖校验：缺失文字 fail-closed", () => {
  const frames = [{ number: 1, voiceover: "你现在免费用的AI技能。" }];
  assert.throws(() => validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。"), /不一致/u);
});

test("词级时间映射到帧（字符索引）", () => {
  const words = parseTitles(TITLES);
  assert.equal(words.length, 16);
  const frames = [
    { number: 1, voiceover: "你现在免费用的AI技能，很快就要收钱了。" },
    { number: 2, voiceover: "过去一年所有人都在用。" },
  ];
  const norm = validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。过去一年所有人都在用。");
  const mapped = mapFramesToWords(frames, words, norm.length);
  assert.equal(mapped[0].words.length, 10);
  assert.equal(mapped[1].words.length, 6);
});

test("buildVoices：帧内相对时间 + 尾部 padding + 无语音帧跳过", () => {
  const words = parseTitles(TITLES);
  const frames = [
    { number: 1, voiceover: "你现在免费用的AI技能，很快就要收钱了。" },
    { number: 2, voiceover: "过去一年所有人都在用。" },
    { number: 3, voiceover: "" },
  ];
  const norm = validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。过去一年所有人都在用。");
  const mapped = mapFramesToWords(frames, words, norm.length);
  const voices = buildVoices(mapped, words.at(-1).endMs);
  assert.equal(voices.length, 2);
  const v1 = voices[0];
  assert.equal(v1.id, "01");
  assert.equal(v1.path, "assets/voice/01.wav");
  assert.equal(v1.words[0].start, 0);
  assert.equal(v1.words[0].text, "你");
  assert.equal(v1.words[0].end, 0.12);
  assert.equal(v1.words[2].start, 0.32);
  assert.equal(v1.duration_s, 1.88); // 1720→1800ms + 0.08s padding
  const v2 = voices[1];
  assert.equal(v2.words[0].start, 0);
  assert.equal(v2.words[0].text, "过去");
});

test("跨句帧边界：词按字符索引归属正确帧", () => {
  const words = parseTitles(TITLES);
  const frames = [
    { number: 1, voiceover: "你现在免费用的AI技能，很快就要收钱了。过去" },
    { number: 2, voiceover: "一年所有人都在用。" },
  ];
  const norm = validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。过去一年所有人都在用。");
  const mapped = mapFramesToWords(frames, words, norm.length);
  assert.equal(mapped[0].words.length, 11); // 句1 全部 + 句2 的「过去」
  assert.equal(mapped[0].words.at(-1).text, "过去");
  assert.equal(mapped[1].words.length, 5);
  assert.equal(mapped[1].words[0].text, "一年");
});

test("跨帧边界的词不丢失（起始字符归属法）", () => {
  // 帧边界落在「过去」中间：词按起始字符归属前帧，绝不两帧都丢。
  const words = parseTitles(TITLES);
  const frames = [
    { number: 1, voiceover: "你现在免费用的AI技能，很快就要收钱了。过" },
    { number: 2, voiceover: "去一年所有人都在用。" },
  ];
  const norm = validateFrameCoverage(frames, "你现在免费用的AI技能，很快就要收钱了。过去一年所有人都在用。");
  const mapped = mapFramesToWords(frames, words, norm.length);
  const total = mapped.reduce((a, f) => a + f.words.length, 0);
  assert.equal(total, words.length);
  assert.equal(mapped[0].words.at(-1).text, "过去");
});
