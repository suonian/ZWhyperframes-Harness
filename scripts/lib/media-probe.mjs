// media-probe.mjs — 成片**内容**事实探针（只读数，不做判断）
//
// 为什么需要这一层：
// 官方 `init` 铺出来的 `index.html` 是**空壳**（`#root` 里 0 个 clip）。跳过官方
// Step 2–5（帧 / 装配 / 字幕）直接渲染，会得到一段「有视频轨、无音频轨、整片全黑」
// 的 MP4——用户看到的现象就是「黑屏，没有任何画面和声音」。
//
// 已有门禁（`gate.mjs mp4`）只查「存在 / 非空 / 哈希一致 / 时长对得上 STORYBOARD」，
// **拦不住这种片子**：空壳渲染出来的 10.0s 片段时长、哈希、非空都「正常」。
// 换句话说，那是一条**空门禁**——和之前修掉的 `doctor --json` 恒 exit 0 是同一类病。
//
// 本模块只负责把三件事读成机器可判定的事实，**判断留给调用方**（fail-closed 的策略
// 在 `gate.mjs` / `state.mjs` 里，不在这里）：
//
//   1. 轨道结构：视频轨数、音频轨数        → ffprobe -show_streams -of json
//   2. 音频响度：mean / max dB             → ffmpeg -af volumedetect
//   3. 黑帧区间：起止与时长                → ffmpeg -vf blackdetect
//
// 跨平台要点：
//   - ffmpeg 的空输出统一写 `-f null -`（不是 Windows 的 `NUL`）。`-` 在 null muxer
//     下被丢弃，POSIX 与 Windows 行为一致，避免为平台写两套调用。
//   - 外部命令不存在时 spawnSync 返回 status=null、stdout=undefined。直接读
//     `stdout.trim()` 会抛 TypeError，把「ffmpeg 没装」伪装成代码 bug——必须先查 r.error。
//   - ffmpeg 的读数全部走 **stderr**（volumedetect / blackdetect 的日志），stdout 是空的。
import { spawnSync } from "node:child_process";

const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;
const FFPROBE_TIMEOUT_MS = 10 * 60 * 1000;

/** 跑一条只读探针命令；把「命令不存在」和「命令失败」分成两种可读的原因。 */
function runProbe(command, args) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: command === "ffprobe" ? FFPROBE_TIMEOUT_MS : FFMPEG_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    // Windows 上 ffmpeg 会弹控制台窗口；不弹，免得批处理里闪。
    windowsHide: true,
  });
  if (r.error) {
    const code = r.error.code ?? "";
    const hint = code === "ENOENT" ? `（未安装或不在 PATH）` : "";
    return { ok: false, reason: `无法运行 ${command}${hint}：${code} ${r.error.message ?? ""}`.trim() };
  }
  if (r.status !== 0) {
    return { ok: false, reason: `${command} 退出码 ${r.status}：${(r.stderr ?? "").trim().split("\n").slice(-3).join(" ")}` };
  }
  return { ok: true, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/**
 * 轨道结构探针。
 * @returns {{ok:true, videoStreams:number, audioStreams:number, codecs:string[]} | {ok:false, reason:string}}
 */
export function probeMediaTracks(path) {
  const r = runProbe("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=index,codec_type,codec_name",
    "-of", "json",
    path,
  ]);
  if (!r.ok) return r;
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return { ok: false, reason: `ffprobe 未返回可解析的 JSON：${path}` };
  }
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const videoStreams = streams.filter((s) => s?.codec_type === "video").length;
  const audioStreams = streams.filter((s) => s?.codec_type === "audio").length;
  const codecs = streams.map((s) => `${s?.codec_type ?? "?"}:${s?.codec_name ?? "?"}`);
  return { ok: true, videoStreams, audioStreams, codecs, streams };
}

/**
 * 音频响度探针。纯静音轨的 mean_volume 在 −91 dB 量级（aac 编码的数字静音实测 −91.0 dB，
 * 未编码的 anullsrc 会给出 −inf）；正常口播在 −30 ~ −20 dB。
 * @returns {{ok:true, meanDb:number, maxDb:number} | {ok:false, reason:string}}
 */
export function probeAudioLoudness(path) {
  const r = runProbe("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"]);
  if (!r.ok) return r;
  // ffmpeg 可能输出 `-inf dB` / `inf dB`，正则要一并吃下再归一成数值。
  const NUM = "(-?[\\d.]+|-?inf)";
  const mean = new RegExp(`mean_volume:\\s*${NUM}\\s*dB`, "i").exec(r.stderr);
  const max = new RegExp(`max_volume:\\s*${NUM}\\s*dB`, "i").exec(r.stderr);
  if (!mean || !max) {
    return { ok: false, reason: `volumedetect 未给出响度读数（成片可能没有音频流）：${path}` };
  }
  const toDb = (raw) => {
    const v = raw.toLowerCase();
    if (v === "-inf") return -Infinity;
    if (v === "inf") return Infinity;
    return Number(v);
  };
  return { ok: true, meanDb: toDb(mean[1]), maxDb: toDb(max[1]) };
}

/**
 * 黑帧区间探针。
 * @param {number} minDuration blackdetect 的 d 参数：短于该时长的黑帧不算。
 * @returns {{ok:true, intervals:{start:number,end:number,duration:number}[]} | {ok:false, reason:string}}
 */
export function probeBlackIntervals(path, minDuration = 1) {
  const r = runProbe("ffmpeg", [
    "-hide_banner", "-nostats",
    "-i", path,
    "-vf", `blackdetect=d=${minDuration}:pix_th=0.10`,
    "-f", "null", "-",
  ]);
  if (!r.ok) return r;
  const intervals = [];
  const re = /black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)\s+black_duration:\s*(-?[\d.]+)/g;
  let m;
  while ((m = re.exec(r.stderr)) !== null) {
    intervals.push({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) });
  }
  return { ok: true, intervals };
}

// ── 成片内容门禁的判定策略 ───────────────────────────────────────────────
//
// 阈值取「宁可放过、绝不放过空壳」的一侧：
//   MIN_MEAN_DB = -60 dB —— 纯静音轨在 −91 dB 量级，正常口播在 −30 ~ −20 dB。
//     取 −60 留了 30 dB 余量，不会误伤正常段。
//   BLACK_MIN_SECONDS = 1.0 —— 连续 1 秒以上的**整片全黑**在任何叙事里都不是设计，
//     但短促的黑场（淡入淡出的一帧）不该被当成故障，所以按「持续时长」而不是「有没有」判。
export const MIN_MEAN_DB = -60;
export const BLACK_MIN_SECONDS = 1.0;

/**
 * 成片内容判定：把探针读数转成「通过 / 不通过 + 原因」。
 *
 * 与 `gate.mjs` / `state.mjs` 的分工：本函数**只判定**，不做门禁副作用（不退出进程、
 * 不写文件）；调用方决定怎么表达失败。
 *
 * @returns {{ok:boolean, findings:string[], facts:object}}
 */
export function assertMediaContent(path, { minMeanDb = MIN_MEAN_DB, blackMinSeconds = BLACK_MIN_SECONDS } = {}) {
  const findings = [];
  const facts = {};

  const tracks = probeMediaTracks(path);
  if (!tracks.ok) {
    return { ok: false, findings: [`轨道探测失败：${tracks.reason}`], facts };
  }
  facts.videoStreams = tracks.videoStreams;
  facts.audioStreams = tracks.audioStreams;
  facts.codecs = tracks.codecs;
  if (tracks.videoStreams < 1) findings.push("成片没有视频轨（黑屏 / 空壳渲染）");
  if (tracks.audioStreams < 1) findings.push("成片没有音频轨（无声）");

  const loudness = probeAudioLoudness(path);
  if (!loudness.ok) {
    // 没有音频轨时 volumedetect 本来就出不来读数，这一条已被上面的轨道检查覆盖。
    if (tracks.audioStreams >= 1) findings.push(`音频响度探测失败：${loudness.reason}`);
  } else {
    facts.meanDb = loudness.meanDb;
    facts.maxDb = loudness.maxDb;
    if (loudness.meanDb <= minMeanDb) {
      findings.push(`音频疑似静音（mean_volume ${loudness.meanDb.toFixed(1)} dB ≤ ${minMeanDb} dB）`);
    }
  }

  const black = probeBlackIntervals(path, blackMinSeconds);
  if (!black.ok) {
    findings.push(`黑帧探测失败：${black.reason}`);
  } else {
    facts.blackIntervals = black.intervals;
    const long = black.intervals.filter((iv) => iv.duration >= blackMinSeconds);
    if (long.length > 0) {
      findings.push(
        `检测到 ${long.length} 段持续 ≥${blackMinSeconds}s 的全黑区间（${long
          .map((iv) => `${iv.start.toFixed(2)}s→${iv.end.toFixed(2)}s`)
          .join("、")}）`,
      );
    }
  }

  return { ok: findings.length === 0, findings, facts };
}

