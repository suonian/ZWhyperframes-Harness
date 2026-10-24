import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canReuseTts } from "../scripts/lib/tts-reuse.mjs";
import { tmp } from "./lib/tmp.mjs";

const sha = (value) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const dir = tmp("zw-tts-reuse-");
  mkdirSync(join(dir, "audio"), { recursive: true });
  const paths = {
    audioPath: join(dir, "audio", "narration.mp3"),
    titlesPath: join(dir, "audio", "narration.titles"),
    manifestPath: join(dir, "audio", "narration.manifest.json"),
  };
  writeFileSync(paths.audioPath, "audio");
  writeFileSync(paths.titlesPath, "titles");
  writeFileSync(paths.manifestPath, "{}");
  const binding = {
    text_sha256: sha("text"),
    audio_sha256: sha("audio"),
    titles_sha256: sha("titles"),
    manifest_sha256: sha("{}"),
  };
  return { ...paths, binding, textSha: sha("text") };
}

test("TTS 复用：文本与三项产物哈希一致时允许", () => {
  const f = fixture();
  assert.equal(canReuseTts(f), true);
});

test("TTS 复用：音频被篡改时必须重新生成", () => {
  const f = fixture();
  writeFileSync(f.audioPath, "tampered");
  assert.equal(canReuseTts(f), false);
});

test("TTS 复用：文本哈希变化时必须重新生成", () => {
  const f = fixture();
  assert.equal(canReuseTts({ ...f, textSha: sha("changed") }), false);
});
