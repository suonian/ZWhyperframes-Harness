#!/usr/bin/env python3
"""直接调用 MiniMax API 生成图片，并保存可复现的脱敏记录。"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "https://api.minimaxi.com"
KEYCHAIN_ACCOUNT = "minimax"
KEYCHAIN_SERVICE = "MINIMAX_API_KEY"


def disable_proxy_for_minimax() -> None:
    """MiniMax API 直连，避免继承 hf-env.sh 的外部资源代理。"""
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(name, None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="直接调用 MiniMax API 生成图片。")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--prompt", help="图片提示词。")
    source.add_argument("--prompt-file", help="包含提示词的 UTF-8 文件。")
    parser.add_argument("--out-dir", required=True, help="输出目录。")
    parser.add_argument("--name", default="image", help="输出文件名前缀。")
    parser.add_argument("--model", default="image-01", choices=["image-01", "image-01-live"])
    parser.add_argument(
        "--aspect-ratio",
        default="16:9",
        choices=["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"],
    )
    parser.add_argument("--width", type=int, help="image-01 精确宽度，512–2048 且为 8 的倍数。")
    parser.add_argument("--height", type=int, help="image-01 精确高度，512–2048 且为 8 的倍数。")
    parser.add_argument("--seed", type=int, help="用于复现相近结果的随机种子。")
    parser.add_argument("--count", type=int, default=1, choices=range(1, 10), metavar="1-9")
    parser.add_argument("--response-format", default="base64", choices=["url", "base64"])
    parser.add_argument("--prompt-optimizer", action="store_true")
    parser.add_argument("--aigc-watermark", action="store_true")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--dry-run", action="store_true", help="只输出请求体，不调用 API。")
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


def build_payload(args: argparse.Namespace, prompt: str) -> dict:
    if not prompt:
        raise ValueError("图片提示词不能为空。")
    if len(prompt) > 1500:
        raise ValueError("图片提示词不能超过 1500 个字符。")
    if args.aspect_ratio == "21:9" and args.model != "image-01":
        raise ValueError("21:9 只适用于 image-01。")
    if (args.width is None) != (args.height is None):
        raise ValueError("--width 和 --height 必须同时提供。")
    if args.width is not None:
        if args.model != "image-01":
            raise ValueError("--width/--height 只适用于 image-01。")
        for name, value in (("width", args.width), ("height", args.height)):
            if value < 512 or value > 2048 or value % 8:
                raise ValueError(f"{name} 必须在 512–2048 之间且为 8 的倍数。")
    payload = {
        "model": args.model,
        "prompt": prompt,
        "response_format": args.response_format,
        "n": args.count,
        "prompt_optimizer": args.prompt_optimizer,
        "aigc_watermark": args.aigc_watermark,
    }
    if args.width is None:
        payload["aspect_ratio"] = args.aspect_ratio
    else:
        payload["width"] = args.width
        payload["height"] = args.height
    if args.seed is not None:
        payload["seed"] = args.seed
    return payload


def request_json(url: str, api_key: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MiniMax HTTP {exc.code}: {body}") from exc


def image_suffix(content: bytes) -> str:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ".webp"
    return ".png"


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as resp:
        return resp.read()


def save_images(response: dict, response_format: str, out_dir: pathlib.Path, name: str) -> list[str]:
    data = response.get("data", {})
    encoded = data.get("image_base64") or []
    urls = data.get("image_urls") or []
    sources = encoded if response_format == "base64" else urls
    saved: list[str] = []
    for index, source in enumerate(sources, start=1):
        content = base64.b64decode(source) if response_format == "base64" else download(source)
        path = out_dir / f"{name}-{index:02d}{image_suffix(content)}"
        path.write_bytes(content)
        saved.append(str(path))
    return saved


def main() -> int:
    args = parse_args()
    disable_proxy_for_minimax()
    try:
        prompt = read_prompt(args)
        payload = build_payload(args, prompt)
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    api_key = get_api_key()
    if not api_key:
        print("缺少 MINIMAX_API_KEY，且未在本机 Keychain 找到 MiniMax 密钥。", file=sys.stderr)
        return 2

    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    endpoint = f"{args.base_url.rstrip('/')}/v1/image_generation"

    try:
        response = request_json(endpoint, api_key, payload)
    except (OSError, RuntimeError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    base_resp = response.get("base_resp", {})
    if base_resp.get("status_code") not in (0, None):
        print(json.dumps(response, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    local_files = save_images(response, args.response_format, out_dir, args.name)
    if not local_files:
        print("MiniMax 返回成功，但没有可保存的图片。", file=sys.stderr)
        return 1

    response_path = out_dir / f"{args.name}.response.json"
    response_path.write_text(
        json.dumps(
            {
                "id": response.get("id"),
                "metadata": response.get("metadata"),
                "base_resp": base_resp,
                "image_count": len(local_files),
                "remote_payload_omitted": True,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    manifest = {
        "provider": "minimax",
        "type": "image",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "endpoint": endpoint,
        "request": payload,
        "response": {
            "id": response.get("id"),
            "metadata": response.get("metadata"),
            "base_resp": base_resp,
        },
        "local_files": {
            "images": local_files,
            "raw_response": str(response_path),
        },
    }
    manifest_path = out_dir / f"{args.name}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
