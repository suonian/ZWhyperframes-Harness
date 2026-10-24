// TTS 复用判定：只有文本与三项产物哈希全部一致时才允许复用。
// 纯函数 + 显式路径读取，便于在不调用 MiniMax API 的情况下做回归测试。
import { existsSync } from "node:fs";
import { sha256File } from "./harness.mjs";

const HASH_FIELDS = [
  ["audio_sha256", "audioPath"],
  ["titles_sha256", "titlesPath"],
  ["manifest_sha256", "manifestPath"],
];

export function canReuseTts({ binding, textSha, audioPath, titlesPath, manifestPath }) {
  if (!binding || binding.text_sha256 !== textSha) return false;
  const paths = { audioPath, titlesPath, manifestPath };
  for (const [key, pathKey] of HASH_FIELDS) {
    const path = paths[pathKey];
    if (!path || !existsSync(path)) return false;
    if (binding[key] !== sha256File(path)) return false;
  }
  return true;
}
