// 官方 STORYBOARD.md 的轻量读取器（管理层用途：语音/字幕/音频元数据注入）。
// 只读元数据；渲染与状态语义仍以官方 parser（@hyperframes/core/storyboard）为真源。
import { existsSync, readFileSync } from "node:fs";

const FRAME_HEADING = /^#{2,3}\s+(?:Frame|Beat|Scene)\s+(\d+)\b[\s:：—-]*(.*)$/iu;
const BULLET = /^-\s*([^:：]+?)\s*[：:]\s*(.*)$/u;
const VOICE_KEYS = new Set(["voiceover", "vo", "voice_over", "narration"]);

export function parseStoryboard(md) {
  const lines = String(md).split(/\r?\n/u);
  const globals = {};
  const frames = [];
  let current = null;
  // unknown → open → done：只允许文件开头的第一个 --- 打开 frontmatter；
  // 关闭后绝不再把正文里的水平分隔线 --- 误当成 frontmatter 开关。
  let frontmatter = "unknown";

  const flush = () => {
    if (current) {
      frames.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    if (frontmatter === "unknown") {
      if (line.trim() === "") continue;
      if (line.trim() === "---") {
        frontmatter = "open";
        continue;
      }
      frontmatter = "done";
    } else if (frontmatter === "open") {
      if (line.trim() === "---") {
        frontmatter = "done";
        continue;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/u.exec(line);
      if (m) globals[m[1]] = m[2].trim();
      continue;
    }
    const heading = FRAME_HEADING.exec(line);
    if (heading) {
      flush();
      current = { number: Number(heading[1]), title: heading[2].trim(), meta: {} };
      continue;
    }
    if (current) {
      const bullet = BULLET.exec(line);
      if (bullet) {
        const key = bullet[1].trim().toLowerCase();
        let value = bullet[2].trim();
        if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
          value = value.slice(1, -1);
        }
        current.meta[key] = value;
      }
    }
  }
  flush();
  for (const frame of frames) {
    frame.voiceover = [...VOICE_KEYS].map((k) => frame.meta[k]).find((v) => v != null) ?? "";
  }
  return { globals, frames };
}

export function readStoryboard(segmentDir) {
  const path = `${segmentDir}/STORYBOARD.md`;
  if (!existsSync(path)) throw new Error(`缺少 STORYBOARD.md：${path}`);
  return parseStoryboard(readFileSync(path, "utf8"));
}
