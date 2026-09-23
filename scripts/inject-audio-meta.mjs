#!/usr/bin/env node
// inject-audio-meta.mjs — MiniMax 语音/词级时间 → 官方 audio_meta.json（管理层适配）
// 流程（全部走官方通道）：
//   1. 读 STORYBOARD.md（帧 voiceover + music mood）+ MiniMax titles/mp3
//   2. 帧 voiceover 归一化拼接必须等于锁定段稿（归一化后全等），否则 fail-closed
//   3. 按 titles 的字符索引把词级时间映射到帧（帧内相对时间），ffmpeg 切帧音频 → assets/voice/NN.wav
//   4. 官方音频引擎 --only bgm 生成 BGM（neutral sidecar，合并保留既有内容）
//   5. 写 neutral audio_engine_meta.json + 官方帧键 audio_meta.json（captions/assemble/sync-durations 的输入）
// 渲染、字幕、装配永远由官方完成。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, writeJson, findProjectRoot, HARNESS_ROOT } from "./lib/harness.mjs";
import { readStoryboard } from "./lib/storyboard.mjs";
import { parseTitles, validateFrameCoverage, mapFramesToWords, buildVoices } from "./lib/audio-inject.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const segmentDir = resolve(get("segment") ?? process.cwd());
const audioDir = join(segmentDir, "audio");
const titlesPath = join(audioDir, "narration.titles");
const audioPath = join(audioDir, "narration.mp3");
const bindingPath = join(audioDir, "tts-binding.json");
const neutralPath = join(segmentDir, "audio_engine_meta.json");
const metaPath = join(segmentDir, "audio_meta.json");

if (!existsSync(titlesPath) || !existsSync(audioPath)) throw new Error("缺少 TTS 产物；先运行 minimax-tts.mjs");
const binding = JSON.parse(readFileSync(bindingPath, "utf8"));
for (const [key, file] of [["audio_sha256", "narration.mp3"], ["titles_sha256", "narration.titles"], ["manifest_sha256", "narration.manifest.json"]]) {
  const path = join(audioDir, file);
  if (!existsSync(path) || binding[key] !== sha256File(path)) throw new Error(`TTS 产物与绑定漂移：${file}；请重新运行 minimax-tts.mjs`);
}
const board = readStoryboard(segmentDir);
if (!board.frames.length) throw new Error("STORYBOARD.md 无帧");

// ── 帧 voiceover 必须覆盖锁定段稿（归一化全等） ──────────────────────────────
const userScript = readFileSync(join(segmentDir, "user_script.txt"), "utf8").trim();
const normalizedScript = validateFrameCoverage(board.frames, userScript);

// ── titles → 带全文字符索引的词列表 → 帧映射 → 官方 voices ──────────────────
const titles = JSON.parse(readFileSync(titlesPath, "utf8"));
const words = parseTitles(titles);
if (!words.length) throw new Error("titles 无词级时间");
const frameMaps = mapFramesToWords(board.frames, words, normalizedScript.length);
const audioDurationMs = words.at(-1).endMs;
const voiceDir = join(segmentDir, "assets", "voice");
mkdirSync(voiceDir, { recursive: true });
// 源音频总时长：帧音频可越过末词进入源尾音（避免末句被截断）
const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", audioPath], { encoding: "utf8" });
const sourceDurationMs = Number(probe.stdout.trim()) > 0 ? Number(probe.stdout.trim()) * 1000 : null;
const voices = buildVoices(frameMaps, audioDurationMs, 0.08, sourceDurationMs);

// ── ffmpeg 切帧音频 ───────────────────────────────────────────────────────────
for (const voice of voices) {
  const abs = join(segmentDir, voice.path);
  const r = spawnSync("ffmpeg", ["-y", "-i", audioPath, "-ss", String(voice.firstStartS), "-to", String(voice.to), "-c:a", "pcm_s16le", abs], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
  });
  if (r.status !== 0 || !existsSync(abs)) throw new Error(`帧 ${voice.frame} 音频切分失败：${r.stderr ?? ""}`);
}

// ── 官方音频引擎 --only bgm（BGM 检索/跳过，不动语音） ──────────────────────
const music = String(board.globals.music ?? "").trim();
let bgmMode = "none";
let bgmQuery = null;
if (music && music.toLowerCase() !== "none") {
  bgmMode = "retrieve";
  bgmQuery = music;
}
const requestPath = join(segmentDir, "audio_request.json");
writeJson(requestPath, {
  provider: "auto",
  lang: "zh",
  speed: 1.0,
  lines: [],
  bgm: bgmMode === "none" ? { mode: "none" } : { mode: "retrieve", query: bgmQuery },
});
const engine = resolveMediaEngine();
const bgmRun = spawnSync("node", [engine, "--request", requestPath, "--hyperframes", segmentDir, "--out", neutralPath, "--only", "bgm"], {
  encoding: "utf8",
  stdio: ["ignore", "inherit", "inherit"],
});
if (bgmRun.status !== 0) throw new Error("官方音频引擎 BGM 阶段失败");

// ── voices 合并进 neutral sidecar（engine 的 --only 合并保留非本阶段内容） ────
const neutral = existsSync(neutralPath) ? JSON.parse(readFileSync(neutralPath, "utf8")) : {};
neutral.tts_provider = "minimax";
neutral.voice_id = binding.voice_id ?? null;
neutral.voices = voices.map(({ id, path, duration_s, words }) => ({ id, path, duration_s, words }));
writeJson(neutralPath, neutral);
// ── 官方帧键 audio_meta.json（captions/assemble/sync-durations 的输入形状） ──
writeJson(metaPath, {
  bgm: neutral.bgm ?? null,
  bgm_pending: Boolean(neutral.bgm_pending),
  voices: voices.map(({ frame, path, duration_s, words }) => ({ frame, path, duration_s, words })),
  sfx: [],
});

const syncScript = resolveFacelessAudioScript();
const sync = spawnSync("node", [syncScript, "sync-durations", "--hyperframes", segmentDir, "--audio-meta", metaPath, "--storyboard", join(segmentDir, "STORYBOARD.md")], {
  encoding: "utf8",
  stdio: ["ignore", "inherit", "inherit"],
});
if (sync.status !== 0) throw new Error("官方 sync-durations 失败");

writeJson(join(audioDir, "injection-binding.json"), {
  text_sha256: binding.text_sha256,
  titles_sha256: binding.titles_sha256,
  audio_sha256: binding.audio_sha256,
  audio_meta_sha256: sha256File(metaPath),
  neutral_sha256: sha256File(neutralPath),
  storyboard_sha256: sha256File(join(segmentDir, "STORYBOARD.md")),
  frame_durations: readStoryboard(segmentDir).frames.map((frame) => ({ number: frame.number, duration: String(frame.meta.duration) })),
  frame_count: frameMaps.length,
  voiced_frame_count: voices.length,
  voice_total_duration_s: +voices.reduce((a, v) => a + v.duration_s, 0).toFixed(3),
  word_count: words.length,
  bgm_mode: bgmMode,
  at: new Date().toISOString(),
});
console.log(`audio_meta.json 注入并同步完成：${voices.length}/${frameMaps.length} 帧有语音（BGM=${bgmMode}）`);

// media-use 音频引擎的确定性定位：官方技能目录（bootstrap 的 skills update 安装）。
function resolveFacelessAudioScript() {
  const candidates = [
    join(HARNESS_ROOT, "vendor", "skills"),
    join(process.env.HOME ?? "", ".claude", "skills"),
    join(process.env.HOME ?? "", ".agents", "skills"),
    join(process.env.HOME ?? "", ".config", "opencode", "skills"),
  ];
  for (const root of candidates) {
    const script = join(root, "faceless-explainer", "scripts", "audio.mjs");
    if (existsSync(script)) return script;
  }
  throw new Error("未找到官方 faceless-explainer audio.mjs；先运行 ./scripts/bootstrap.sh");
}

function resolveMediaEngine() {
  const candidates = [
    join(HARNESS_ROOT, "vendor", "skills"),
    join(process.env.HOME ?? "", ".claude", "skills"),
    join(process.env.HOME ?? "", ".agents", "skills"),
    join(process.env.HOME ?? "", ".config", "opencode", "skills"),
  ];
  for (const root of candidates) {
    const engine = join(root, "media-use", "audio", "scripts", "audio.mjs");
    if (existsSync(engine)) return engine;
  }
  throw new Error("未找到官方 media-use 音频引擎；先运行 ./scripts/bootstrap.sh（skills update）");
}
