#!/usr/bin/env node
// minimax-tts.mjs — MiniMax TTS 段级生成（管理层薄包装）
// 幂等：请求文本哈希未变且既有产物完整时直接复用，不再次调用 API。
// 产物：audio/narration.mp3 + audio/narration.titles（词级时间，ms）+ narration.manifest.json
// 绑定：audio/tts-binding.json（文本↔音频↔词级时间↔manifest 哈希，供门禁校验）
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha256File, writeJson, readJsonIfPresent, findProjectRoot, nowIso, HARNESS_ROOT } from "./lib/harness.mjs";
import { canReuseTts } from "./lib/tts-reuse.mjs";
import { resolvePython } from "./lib/python-runtime.mjs";

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

/**
 * 解析一个**真能运行**的 Python 解释器。
 *
 * Windows 上 python3 可能解析到 Microsoft Store 存根：执行即以非零退出、不输出任何东西。
 * 直接拿它跑 TTS，失败信息会指向「MiniMax TTS 调用失败」，而不是「python 不可用」——
 * 排障方向完全错。所以先逐个候选实际跑一次最小导入再决定。
 * 允许用 MINIMAX_PYTHON 显式指定（路径含空格也可以）。
 *
 * 实现已上移到 scripts/lib/python-runtime.mjs（唯一真源）——音色基线门禁
 * （scripts/gate.mjs baseline）需要同一套解析，避免两处漂移。
 */
const textSha = sha256File(textPath);

const previous = readJsonIfPresent(bindingPath);
if (canReuseTts({ binding: previous, textSha, audioPath, titlesPath, manifestPath })) {
  console.log(`TTS 复用（文本与 mp3/titles/manifest 哈希均未漂移）：${audioPath}`);
  process.exit(0);
}

const projectRoot = findProjectRoot(segmentDir);
if (!projectRoot) throw new Error(`无法定位项目根（缺少 00-项目总控/state.json）：${segmentDir}`);
const manifest = JSON.parse(readFileSync(join(segmentDir, "segment-manifest.json"), "utf8"));
if (manifest.user_script_sha256 !== textSha) throw new Error("段落稿与 segment-manifest 绑定哈希不一致，拒绝 TTS");

mkdirSync(audioDir, { recursive: true });
const ttsScript = join(HARNESS_ROOT, "tools", "minimax", "scripts", "minimax_tts.py");
const python = resolvePython();
const run = spawnSync(python, [ttsScript, "--text-file", textPath, "--out-dir", audioDir, "--name", name], {
  encoding: "utf8",
  timeout: 30 * 60 * 1000,
  stdio: ["ignore", "pipe", "pipe"],
  // Windows 管道下 Python 的 stdout 默认是 GBK（cp936）：Node 按 utf8 解码会得到乱码，
  // 口播稿里出现 emoji / 扩展 B 区汉字时 Python 还会直接 UnicodeEncodeError 崩掉。
  // 强制 UTF-8 模式，保证管道两端编码一致、且非 GBK 字符可正常合成。
  env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
});
if (run.error) {
  // 解释器根本没能启动（ENOENT / EPERM）：此时 status 是 null，
  // 只报「调用失败」会把问题指向 MiniMax，而真因是本机解释器。
  throw new Error(`MiniMax TTS 无法启动 Python（${python}）：${run.error.code ?? ""} ${run.error.message ?? ""}`.trim());
}
if (run.status !== 0) {
  process.stderr.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  // 区分「缺凭证」（脚本约定的 exit 2）与「调用失败」：前者是配置问题，后者是请求问题。
  const detail = run.status === 2 ? "（缺 MiniMax 凭证：设置环境变量 MINIMAX_API_KEY）" : "";
  throw new Error(`MiniMax TTS 调用失败（退出码 ${run.status}）${detail}`);
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
