// MiniMax titles → 官方 audio_meta voices 的纯映射逻辑（无副作用，可测试）。
// 时间单位：titles 毫秒 → 帧内相对秒；字符索引：pronounce 文本的全文字符位置。
import { normalizeText } from "./harness.mjs";

export function parseTitles(titles) {
  const words = [];
  for (const sentence of titles) {
    const base = Number(sentence.text_begin ?? 0);
    for (const w of sentence.timestamped_words ?? []) {
      words.push({
        charBegin: base + Number(w.word_begin ?? 0),
        charEnd: base + Number(w.word_end ?? 0),
        text: String(w.word ?? ""),
        startMs: Number(w.time_begin ?? 0),
        endMs: Number(w.time_end ?? 0),
      });
    }
  }
  return words;
}

/** 帧 voiceover 归一化拼接必须与锁定段稿全等（fail-closed）。 */
export function validateFrameCoverage(frames, lockedSegmentText) {
  const normalizedScript = normalizeText(lockedSegmentText);
  const normalizedFrames = frames.map((f) => normalizeText(f.voiceover ?? ""));
  if (normalizedFrames.join("") !== normalizedScript) {
    const ok = Math.max(0, [...normalizedScript].findIndex((ch, i) => normalizedFrames.join("")[i] !== ch));
    const error = new Error(`帧 voiceover 归一化拼接与锁定段稿不一致（首处偏差约第 ${ok + 1} 字）；STORYBOARD 帧 voiceover 必须逐字覆盖锁稿`);
    error.code = "frame-voiceover-coverage";
    throw error;
  }
  return normalizedScript;
}

/** 字符范围 → 词列表的帧映射。 */
export function mapFramesToWords(frames, words, normalizedScriptLength) {
  let charCursor = 0;
  const out = [];
  for (const frame of frames) {
    const norm = normalizeText(frame.voiceover ?? "");
    const begin = charCursor;
    const end = begin + norm.length;
    charCursor = end;
    out.push({
      number: frame.number,
      charBegin: begin,
      charEnd: end,
      words: words.filter((w) => w.charBegin >= begin && w.charEnd <= end),
    });
  }
  if (charCursor !== normalizedScriptLength) {
    throw new Error(`帧覆盖字符数与锁稿不符（${charCursor}/${normalizedScriptLength}）`);
  }
  return out;
}

/** 帧映射 → 官方 voices[]（帧内相对词时间，无语音帧跳过）。 */
export function buildVoices(frameMaps, audioDurationMs, tailPadSeconds = 0.08) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const voices = [];
  for (const frame of frameMaps) {
    if (!frame.words.length) continue;
    const firstStartS = frame.words[0].startMs / 1000;
    const lastEndS = frame.words.at(-1).endMs / 1000;
    const to = Math.min(lastEndS + tailPadSeconds, audioDurationMs / 1000);
    voices.push({
      id: pad2(frame.number),
      frame: frame.number,
      path: `assets/voice/${pad2(frame.number)}.wav`,
      duration_s: +(to - firstStartS).toFixed(3),
      firstStartS,
      to,
      words: frame.words.map((w, i) => ({
        id: `w${i}`,
        text: w.text,
        start: +(w.startMs / 1000 - firstStartS).toFixed(3),
        end: +(w.endMs / 1000 - firstStartS).toFixed(3),
      })),
    });
  }
  return voices;
}
