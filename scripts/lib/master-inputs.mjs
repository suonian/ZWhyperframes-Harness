// master 输入校验的唯一实现：gate master-inputs 与 finalize-master 共用。
// 末段例外：候选先于 master final look 生成；末段在其 final look 授权后即可入片。
import { existsSync } from "node:fs";
import { sha256File, isUserApproval } from "./harness.mjs";

export function validateMasterInputs(state) {
  if (!state.segments.length) throw new Error("项目无段落");
  const last = state.segments.at(-1);
  const snapshot = [];
  for (const [index, seg] of state.segments.entries()) {
    const isLast = seg === last;
    const ok = isLast
      ? (seg.status === "rendered" || seg.status === "accepted") && seg.mp4 && isUserApproval(seg.approvals?.final_look)
      : seg.status === "accepted" && seg.mp4;
    if (!ok) throw new Error(`段 ${seg.id} 未满足拼接条件（${isLast ? "末段需 rendered + final look 授权" : "需 accepted"}）`);
    if (!existsSync(seg.mp4.path)) throw new Error(`段 ${seg.id} MP4 缺失：${seg.mp4.path}`);
    if (seg.mp4.sha256 !== sha256File(seg.mp4.path)) {
      throw new Error(`段 ${seg.id} MP4 与状态绑定哈希漂移；重新渲染并 state.mjs set-mp4`);
    }
    snapshot.push({
      index,
      id: seg.id,
      path: seg.mp4.path,
      sha256: sha256File(seg.mp4.path),
      duration_s: seg.mp4.duration_s,
    });
  }
  return snapshot;
}
