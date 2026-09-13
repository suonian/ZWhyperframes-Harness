#!/usr/bin/env node
// minimax-tts.mjs — MiniMax TTS 段级生成（管理层薄包装）
// 幂等：请求文本哈希未变且既有产物完整时直接复用，不再次调用 API。
// 产物：audio/narration.mp3 + audio/narration.titles（词级时间，ms）+ narration.manifest.json
// 绑定：audio/tts-binding.json（文本↔音频↔词级时间↔manifest 哈希，供门禁校验）
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, writeJson, readJsonIfPresent, findProjectRoot, nowIso, HARNESS_ROOT } from "./lib/harness.mjs";

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : null;
};

const segmentDir = resolve(get("segment") ?? process.cwd());
const textPath = join(segmentDir, "user_script.txt");
const audioDir = join(segmentDir, "audio");
const name = "narration";
const audioPath = join(audioDir, `${name}.mp3`);
const titlesPath = join(audioDir, `${name}.titles`);
const manifestPath = join(audioDir, `${name}.manifest.json`);
const bindingPath = join(audioDir, "tts-binding.json");

if (!existsSync(textPath)) throw new Error(`缺少锁定段落稿：${textPath}`);
const textSha = sha256File(textPath);

const audioOk = existsSync(audioPath) && existsSync(titlesPath) && existsSync(manifestPath);
const previous = readJsonIfPresent(bindingPath);
if (audioOk && previous?.text_sha256 === textSha) {
  console.log(`TTS 复用（文本未漂移）：${audioPath}`);
  process.exit(0);
}

const projectRoot = findProjectRoot(segmentDir);
if (!projectRoot) throw new Error(`无法定位项目根（缺少 00-项目总控/state.json）：${segmentDir}`);
const manifest = JSON.parse(readFileSync(join(segmentDir, "segment-manifest.json"), "utf8"));
if (manifest.user_script_sha256 !== textSha) throw new Error("段落稿与 segment-manifest 绑定哈希不一致，拒绝 TTS");

mkdirSync(audioDir, { recursive: true });
const ttsScript = join(HARNESS_ROOT, "tools", "minimax", "scripts", "minimax_tts.py");
const run = spawnSync("python3", [ttsScript, "--text-file", textPath, "--out-dir", audioDir, "--name", name], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (run.status !== 0) {
  process.stderr.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  throw new Error("MiniMax TTS 调用失败");
}
if (!existsSync(audioPath) || !existsSync(titlesPath) || !existsSync(manifestPath)) {
  throw new Error("MiniMax TTS 产物不完整（缺少 mp3/titles/manifest）");
}
const ttsManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const titles = JSON.parse(readFileSync(titlesPath, "utf8"));
const words = titles.flatMap((sentence) => sentence.timestamped_words ?? []);
if (!words.length) throw new Error("MiniMax 词级时间缺失（titles 无 timestamped_words）");
writeJson(bindingPath, {
  provider: "minimax",
  text_sha256: textSha,
  audio_sha256: sha256File(audioPath),
  titles_sha256: sha256File(titlesPath),
  manifest_sha256: sha256File(manifestPath),
  word_count: words.length,
  voice_id: ttsManifest.request?.voice_setting?.voice_id ?? null,
  speed: ttsManifest.request?.voice_setting?.speed ?? null,
  at: nowIso(),
});
console.log(`TTS 完成：${audioPath}（${words.length} 词级时间）`);
