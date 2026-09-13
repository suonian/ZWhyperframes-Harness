#!/usr/bin/env python3
"""直接调用 MiniMax 图生视频 API，并保存可审计的本地产物。"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import mimetypes
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_BASE_URL = "https://api.minimaxi.com"
KEYCHAIN_ACCOUNT = "minimax"
KEYCHAIN_SERVICE = "MINIMAX_API_KEY"


def disable_proxy_for_minimax() -> None:
    """MiniMax API 直连，避免继承 hf-env.sh 的外部资源代理。"""
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(name, None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="直接调用 MiniMax API 生成视频素材。")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--prompt", help="视频提示词。")
    source.add_argument("--prompt-file", help="包含提示词的 UTF-8 文件。")
    parser.add_argument("--first-frame", required=True, help="本地首帧图片。")
    parser.add_argument("--out-dir", required=True, help="输出目录。")
    parser.add_argument("--name", default="video", help="输出文件名前缀。")
    parser.add_argument(
        "--model",
        default="MiniMax-Hailuo-2.3",
        choices=[
            "MiniMax-Hailuo-2.3",
            "MiniMax-Hailuo-2.3-Fast",
            "MiniMax-Hailuo-02",
            "I2V-01-Director",
            "I2V-01-live",
            "I2V-01",
        ],
    )
    parser.add_argument("--duration", type=int, default=6, choices=[6, 10])
    parser.add_argument("--resolution", default="768P", choices=["512P", "720P", "768P", "1080P"])
    parser.add_argument("--prompt-optimizer", action="store_true")
    parser.add_argument("--aigc-watermark", action="store_true")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--poll-interval", type=float, default=10.0)
    parser.add_argument("--timeout", type=float, default=1800.0)
    parser.add_argument("--dry-run", action="store_true", help="只输出脱敏请求体，不调用 API。")
    return parser.parse_args()


def get_api_key() -> str | None:
    api_key = os.environ.get("MINIMAX_API_KEY")
    if api_key:
        return api_key
    try:
        result = subprocess.run(
            [
                "security",
                "find-generic-password",
                "-a",
                KEYCHAIN_ACCOUNT,
                "-s",
                KEYCHAIN_SERVICE,
                "-w",
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def read_prompt(args: argparse.Namespace) -> str:
    if args.prompt_file:
        return pathlib.Path(args.prompt_file).read_text(encoding="utf-8").strip()
    return (args.prompt or "").strip()


def image_data_url(path: pathlib.Path) -> str:
    content = path.read_bytes()
    if len(content) >= 20 * 1024 * 1024:
        raise ValueError("首帧图片必须小于 20MB。")
    media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    if media_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("首帧只支持 JPG、PNG 或 WebP。")
    return f"data:{media_type};base64,{base64.b64encode(content).decode('ascii')}"


def validate_model_options(args: argparse.Namespace) -> None:
    hailuo = args.model.startswith("MiniMax-Hailuo")
    if args.duration == 10 and (not hailuo or args.resolution not in {"512P", "768P"}):
        raise ValueError("当前模型和分辨率不支持 10 秒视频。")
    if hailuo and args.resolution == "720P":
        raise ValueError("MiniMax-Hailuo 系列不使用 720P。")
    if not hailuo and args.resolution not in {"720P", "1080P"}:
        raise ValueError("当前 I2V 模型只支持 720P 或 1080P。")


def build_payload(args: argparse.Namespace, prompt: str, first_frame: str) -> dict:
    if not prompt:
        raise ValueError("视频提示词不能为空。")
    if len(prompt) > 2000:
        raise ValueError("视频提示词不能超过 2000 个字符。")
    validate_model_options(args)
    return {
        "model": args.model,
        "prompt": prompt,
        "first_frame_image": first_frame,
        "prompt_optimizer": args.prompt_optimizer,
        "duration": args.duration,
        "resolution": args.resolution,
        "aigc_watermark": args.aigc_watermark,
    }


def request_json(url: str, api_key: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST" if payload is not None else "GET",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MiniMax HTTP {exc.code}: {body}") from exc


def wait_for_video(base_url: str, api_key: str, task_id: str, interval: float, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    query = urllib.parse.urlencode({"task_id": task_id})
    while time.monotonic() < deadline:
        response = request_json(f"{base_url}/v1/query/video_generation?{query}", api_key)
        status = response.get("status")
        print(f"MiniMax 视频任务 {task_id}: {status}", file=sys.stderr, flush=True)
        if status == "Success":
            return response
        if status == "Fail":
            raise RuntimeError(json.dumps(response, ensure_ascii=False))
        time.sleep(interval)
    raise TimeoutError(f"MiniMax 视频任务在 {timeout:g} 秒内未完成。")


def retrieve_video(base_url: str, api_key: str, file_id: str, destination: pathlib.Path) -> dict:
    query = urllib.parse.urlencode({"file_id": file_id})
    response = request_json(f"{base_url}/v1/files/retrieve?{query}", api_key)
    download_url = response.get("file", {}).get("download_url")
    if not download_url:
        raise RuntimeError("MiniMax 文件记录中缺少 download_url。")
    with urllib.request.urlopen(download_url, timeout=300) as resp:
        destination.write_bytes(resp.read())
    return response


def main() -> int:
    args = parse_args()
    disable_proxy_for_minimax()
    try:
        prompt = read_prompt(args)
        first_frame_path = pathlib.Path(args.first_frame)
        payload = build_payload(args, prompt, image_data_url(first_frame_path))
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    public_payload = {**payload, "first_frame_image": f"<本地图片：{first_frame_path.name}>"}
    if args.dry_run:
        print(json.dumps(public_payload, ensure_ascii=False, indent=2))
        return 0

    api_key = get_api_key()
    if not api_key:
        print("缺少 MINIMAX_API_KEY，且未在本机 Keychain 找到 MiniMax 密钥。", file=sys.stderr)
        return 2

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    base_url = args.base_url.rstrip("/")
    try:
        created = request_json(f"{base_url}/v1/video_generation", api_key, payload)
        if created.get("base_resp", {}).get("status_code") not in (0, None):
            raise RuntimeError(json.dumps(created, ensure_ascii=False))
        task_id = created.get("task_id")
        if not task_id:
            raise RuntimeError("MiniMax 创建视频任务后未返回 task_id。")
        queried = wait_for_video(base_url, api_key, task_id, args.poll_interval, args.timeout)
        file_id = queried.get("file_id")
        if not file_id:
            raise RuntimeError("MiniMax 视频任务成功，但未返回 file_id。")
        video_path = out_dir / f"{args.name}.mp4"
        retrieved = retrieve_video(base_url, api_key, file_id, video_path)
    except (OSError, RuntimeError, TimeoutError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    response_path = out_dir / f"{args.name}.response.json"
    response_path.write_text(
        json.dumps(
            {
                "task_id": task_id,
                "query": queried,
                "file": {
                    key: value
                    for key, value in retrieved.get("file", {}).items()
                    if key != "download_url"
                },
                "download_url_omitted": True,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    manifest = {
        "provider": "minimax",
        "type": "video_image_to_video",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "endpoint": f"{base_url}/v1/video_generation",
        "request": public_payload,
        "source": {"first_frame": str(first_frame_path)},
        "response": {
            "task_id": task_id,
            "file_id": file_id,
            "status": queried.get("status"),
            "video_width": queried.get("video_width"),
            "video_height": queried.get("video_height"),
        },
        "local_files": {"video": str(video_path), "raw_response": str(response_path)},
    }
    manifest_path = out_dir / f"{args.name}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
