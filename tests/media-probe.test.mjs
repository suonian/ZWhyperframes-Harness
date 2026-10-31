import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  assertMediaContent,
  probeMediaTracks,
  probeAudioLoudness,
  probeBlackIntervals,
  MIN_MEAN_DB,
  BLACK_MIN_SECONDS,
} from "../scripts/lib/media-probe.mjs";
import { tmp } from "./lib/tmp.mjs";

// 这些用例针对的是「官方脚手架 0 clip → 直接渲染」产出的黑屏无声片。
// 现有门禁（gate mp4）只查存在/哈希/时长，空壳片全都能通过——所以必须有一条
// 专门针对**成片内容**的机器门禁，否则「黑屏」会反复交付出去。
//
// 用例依赖 ffmpeg/ffprobe（CI 三个 job 都装了；windows-latest 自带）。
// 样片用 lavfi 合成，体积小、可复现，不依赖任何仓库内产物。

function haveFfmpeg() {
  const r = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 60_000, windowsHide: true });
  return r.status === 0;
}

const HAS_FFMPEG = haveFfmpeg();
const skip = HAS_FFMPEG ? false : "本机没有 ffmpeg/ffprobe，无法合成样片";

/** 造一段样片。args 直接透传给 ffmpeg。 */
function makeClip(dir, name, args) {
  const path = join(dir, name);
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args, path], {
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(r.status, 0, `ffmpeg 造片失败：${r.stderr}`);
  return path;
}

const WHITE_SILENT_VIDEO = ["-f", "lavfi", "-i", "color=c=white:s=320x240:r=25", "-t", "2", "-c:v", "libx264"];

test("轨道探针能读出视频轨与音频轨数量", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "both.mp4", [
    "-f", "lavfi", "-i", "color=c=white:s=320x240:r=25",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-shortest",
  ]);
  const tracks = probeMediaTracks(clip);
  assert.equal(tracks.ok, true, tracks.reason);
  assert.equal(tracks.videoStreams, 1);
  assert.equal(tracks.audioStreams, 1);
});

test("空壳片（纯黑 + 无音频）被内容门禁挡住，且两条原因都要报出来", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "shell.mp4", [
    "-f", "lavfi", "-i", "color=c=black:s=320x240:r=25",
    "-t", "2", "-c:v", "libx264",
  ]);
  const media = assertMediaContent(clip);
  assert.equal(media.ok, false, "整片全黑且无音频的成片必须判不通过");
  assert.ok(
    media.findings.some((f) => f.includes("音频轨")),
    `应报出缺少音频轨：${JSON.stringify(media.findings)}`,
  );
  assert.ok(
    media.findings.some((f) => f.includes("全黑")),
    `应报出全黑区间：${JSON.stringify(media.findings)}`,
  );
});

test("有画面但音频静音的片被内容门禁挡住", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "silent.mp4", [
    "-f", "lavfi", "-i", "color=c=white:s=320x240:r=25",
    "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-shortest",
  ]);
  const loudness = probeAudioLoudness(clip);
  assert.equal(loudness.ok, true, loudness.reason);
  assert.ok(
    loudness.meanDb <= MIN_MEAN_DB,
    `数字静音轨的 mean_volume 应 ≤ ${MIN_MEAN_DB} dB，实测 ${loudness.meanDb}`,
  );
  const media = assertMediaContent(clip);
  assert.equal(media.ok, false, "静音片必须判不通过");
  assert.ok(
    media.findings.some((f) => f.includes("静音")),
    `应报出静音：${JSON.stringify(media.findings)}`,
  );
});

test("正常片（有画面 + 有声音）放行", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "ok.mp4", [
    "-f", "lavfi", "-i", "color=c=white:s=320x240:r=25",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-t", "2", "-c:v", "libx264", "-c:a", "aac", "-shortest",
  ]);
  const media = assertMediaContent(clip);
  assert.equal(media.ok, true, `正常片应放行：${media.findings.join("；")}`);
  assert.equal(media.facts.videoStreams, 1);
  assert.equal(media.facts.audioStreams, 1);
  assert.ok(media.facts.meanDb > MIN_MEAN_DB);
});

test("黑帧探针能报出整片全黑的区间", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "black.mp4", [
    "-f", "lavfi", "-i", "color=c=black:s=320x240:r=25",
    "-t", "2", "-c:v", "libx264",
  ]);
  const black = probeBlackIntervals(clip, BLACK_MIN_SECONDS);
  assert.equal(black.ok, true, black.reason);
  assert.ok(black.intervals.length >= 1, "整片全黑应至少报出一个区间");
  assert.ok(black.intervals[0].duration >= BLACK_MIN_SECONDS);
});

test("白画面不误报黑帧区间", { skip }, () => {
  const dir = tmp("zw-media-");
  const clip = makeClip(dir, "white.mp4", WHITE_SILENT_VIDEO);
  const black = probeBlackIntervals(clip, BLACK_MIN_SECONDS);
  assert.equal(black.ok, true, black.reason);
  assert.equal(black.intervals.length, 0, "白画面不应被判成黑帧");
});

test("文件不存在时给出可读原因，而不是抛 TypeError", { skip: false }, () => {
  const tracks = probeMediaTracks(join(tmp("zw-media-"), "not-exist.mp4"));
  assert.equal(tracks.ok, false);
  assert.match(tracks.reason, /ffprobe/);
  const media = assertMediaContent(join(tmp("zw-media-"), "not-exist.mp4"));
  assert.equal(media.ok, false);
  assert.ok(media.findings.length >= 1);
});
