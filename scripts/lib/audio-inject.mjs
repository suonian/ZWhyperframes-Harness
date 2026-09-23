// MiniMax titles → 官方 audio_meta voices 的纯映射逻辑（无副作用，可测试）。
// 时间单位：titles 毫秒 → 帧内相对秒；字符索引：一律折算到归一化文本位置。
// 注意：真实 MiniMax 的 word_begin/word_end 是原文索引（含标点与空格，标点是独立 token）；
// 测试夹具历史上用归一化索引——parseTitles 对两种口径都做探测折算。
import { normalizeText } from "./harness.mjs";

// 字符级判定：与 normalizeText 完全同源（逐个字符跑同一管线，杜绝口径漂移）。
const stripCache = new Map();
function isStrippedChar(ch) {
  if (!stripCache.has(ch)) stripCache.set(ch, normalizeText(ch) === "");
  return stripCache.get(ch);
}

function normalizeIndexMap(rawText) {
  const map = new Array(rawText.length + 1);
  let kept = 0;
  for (let i = 0; i < rawText.length; i += 1) {
    map[i] = kept;
    if (!isStrippedChar(rawText[i])) kept += 1;
  }
  map[rawText.length] = kept;
  return { map, kept };
}

export function parseTitles(titles) {
  const words = [];
  let normBase = 0;
  for (const sentence of titles) {
    const rawText = String(sentence.text ?? "");
    const tokens = sentence.timestamped_words ?? [];
    const { map, kept } = normalizeIndexMap(rawText);
    const rawTextBegin = Number(sentence.text_begin ?? 0);
    const normalized = normalizeText(rawText);
    const sliceOf = (w, mapper) => {
      const begin = Number(w.word_begin ?? 0);
      const end = Number(w.word_end ?? 0);
      return mapper(begin, end);
    };
    const matchesRaw = rawText.length > 0 && tokens.length > 0 && tokens.every((w) => {
      const text = String(w.word ?? "");
      return sliceOf(w, (b, e) => rawText.slice(b - rawTextBegin, e - rawTextBegin)) === text;
    });
    const matchesNorm = tokens.length > 0 && tokens.every((w) => {
      const text = String(w.word ?? "");
      return sliceOf(w, (b, e) => normalized.slice(b, e)) === text;
    });
    const rawIndexed = matchesRaw || !matchesNorm;
    for (const w of tokens) {
      let charBegin;
      let charEnd;
      if (rawIndexed) {
        const b = Math.max(0, Math.min(Number(w.word_begin ?? 0) - rawTextBegin, rawText.length));
        const e = Math.max(0, Math.min(Number(w.word_end ?? 0) - rawTextBegin, rawText.length));
        charBegin = normBase + map[b];
        charEnd = normBase + map[e];
      } else {
        charBegin = normBase + Number(w.word_begin ?? 0);
        charEnd = normBase + Number(w.word_end ?? 0);
      }
      words.push({
        charBegin,
        charEnd,
        text: String(w.word ?? ""),
        startMs: Number(w.time_begin ?? 0),
        endMs: Number(w.time_end ?? 0),
      });
    }
    normBase += kept;
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

/** 字符范围 → 词列表的帧映射。零长度 token（标点）归入其位置之前的那一帧。 */
export function mapFramesToWords(frames, words, normalizedScriptLength) {
  let charCursor = 0;
  const out = [];
  for (const frame of frames) {
    const norm = normalizeText(frame.voiceover ?? "");
    const begin = charCursor;
    const end = begin + norm.length;
    charCursor = end;
    out.push({ number: frame.number, charBegin: begin, charEnd: end, words: [] });
  }
  if (charCursor !== normalizedScriptLength) {
    throw new Error(`帧覆盖字符数与锁稿不符（${charCursor}/${normalizedScriptLength}）`);
  }
  const lost = [];
  for (const w of words) {
    let target = null;
    if (w.charEnd === w.charBegin) {
      // 零长度标点 token 语义上收束前文：归到其前一个归一化字符所在帧（段首标点归首帧）。
      const pos = w.charBegin;
      target = pos > 0
        ? out.find((f) => pos - 1 >= f.charBegin && pos - 1 < f.charEnd) ?? out[0]
        : out[0];
    } else {
      target = out.find((f) => w.charBegin >= f.charBegin && w.charBegin < f.charEnd);
    }
    if (!target && w.charBegin >= normalizedScriptLength) target = out.at(-1);
    if (target) target.words.push(w);
    else lost.push(w);
  }
  if (lost.length) throw new Error(`${lost.length} 个词未归属任何帧（首词「${lost[0].text}」）`);
  const assigned = out.reduce((a, f) => a + f.words.length, 0);
  if (assigned !== words.length) throw new Error(`词归属不一致（${assigned}/${words.length}）`);
  return out;
}

/** 帧映射 → 官方 voices[]（帧内相对词时间，无语音帧跳过）。
 * sourceDurationMs：源音频总时长（可选）。给定时帧音频可越过末词进入源音频的自然尾音，
 * 避免 TTS 末句被突然截断（默认回落为末词结束处）。 */
export function buildVoices(frameMaps, audioDurationMs, tailPadSeconds = 0.08, sourceDurationMs = null) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const limitMs = sourceDurationMs ?? audioDurationMs;
  const voices = [];
  for (const frame of frameMaps) {
    if (!frame.words.length) continue;
    const firstStartS = frame.words[0].startMs / 1000;
    const lastEndS = frame.words.at(-1).endMs / 1000;
    const to = Math.min(lastEndS + tailPadSeconds, limitMs / 1000);
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
