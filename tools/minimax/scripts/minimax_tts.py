#!/usr/bin/env python3
"""MiniMax 同步语音生成脚本。

脚本读取 MINIMAX_API_KEY 环境变量或本机 Keychain，不读取或写入任何明文密钥文件。
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import socket
import ssl
import subprocess
import sys
import urllib.error
import urllib.request


DEFAULT_BASE_URL = "https://api.minimaxi.com"
BACKUP_BASE_URL = "https://api-bj.minimaxi.com"
KEYCHAIN_ACCOUNT = "minimax"
KEYCHAIN_SERVICE = "MINIMAX_API_KEY"
MAX_NETWORK_ATTEMPTS = 2
NETWORK_TELEMETRY = {
    "attempts": 0,
    "retries": 0,
}

VOICE_PROFILE = {
    "model": "speech-2.8-hd",
    "language": "zh",
    "voice_id": "ttv-voice-2026040916452526-mc0nlrpN",
    "speed": 1.27,
    "pitch": 1,
    "vol": 1.16,
    "sample_rate": 44100,
    "bitrate": 256000,
    "format": "mp3",
    "channel": 1,
}


def disable_proxy_for_minimax() -> None:
    """MiniMax API 直连，避免继承 hf-env.sh 的外部资源代理。"""
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        os.environ.pop(name, None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="直接调用 MiniMax API 生成口播语音。")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="要合成的口播文本。")
    source.add_argument("--text-file", help="包含口播文本的 UTF-8 文件。")
    parser.add_argument("--out-dir", required=True, help="输出目录。")
    parser.add_argument("--name", default="narration", help="输出文件名前缀。")
    parser.add_argument("--manifest-name", help="manifest 文件名；默认使用 <name>.manifest.json。")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="MiniMax API 基础地址。")
    parser.add_argument("--use-backup-base-url", action="store_true", help="使用备用北京接口地址。")
    parser.add_argument("--subtitle-type", default="word", choices=["sentence", "word", "word_streaming"])
    parser.add_argument("--output-format", default="hex", choices=["hex", "url"])
    parser.add_argument("--language-boost", default="Chinese")
    parser.add_argument(
        "--pronunciation",
        action="append",
        default=[],
        help="发音词典条目，可重复传入，例如：处理/(chu3)(li3)",
    )
    parser.add_argument("--aigc-watermark", action="store_true", help="在音频末尾添加 AIGC 水印。")
    return parser.parse_args()


def read_text(args: argparse.Namespace) -> str:
    if args.text_file:
        return pathlib.Path(args.text_file).read_text(encoding="utf-8")
    return args.text


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


def urlopen_with_single_retry(request: urllib.request.Request | str, timeout: int):
    """Retry one transient direct-network failure without changing endpoint or TLS policy."""
    for attempt in range(MAX_NETWORK_ATTEMPTS):
        NETWORK_TELEMETRY["attempts"] += 1
        try:
            return urllib.request.urlopen(request, timeout=timeout)
        except urllib.error.HTTPError as exc:
            retryable = 500 <= exc.code <= 599
            if retryable and attempt + 1 < MAX_NETWORK_ATTEMPTS:
                NETWORK_TELEMETRY["retries"] += 1
                print(f"MiniMax transient HTTP {exc.code}; retrying once.", file=sys.stderr)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, socket.timeout, ssl.SSLError) as exc:
            if attempt + 1 < MAX_NETWORK_ATTEMPTS:
                NETWORK_TELEMETRY["retries"] += 1
                print(f"MiniMax transient network failure ({type(exc).__name__}); retrying once.", file=sys.stderr)
                continue
            raise
    raise RuntimeError("MiniMax network retry loop ended unexpectedly")


def request_json(url: str, api_key: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen_with_single_retry(req, timeout=300) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"MiniMax HTTP {exc.code}: {body}") from exc
    except (urllib.error.URLError, TimeoutError, ConnectionResetError, socket.timeout, ssl.SSLError) as exc:
        raise RuntimeError(f"MiniMax 直连在一次自动重试后仍失败：{type(exc).__name__}: {exc}") from exc
    return json.loads(body)


def download_file(url: str, destination: pathlib.Path) -> None:
    with urlopen_with_single_retry(url, timeout=120) as resp:
        destination.write_bytes(resp.read())


def write_audio(response: dict, output_format: str, audio_path: pathlib.Path) -> str | None:
    audio = response.get("data", {}).get("audio")
    if not audio:
        return None
    if output_format == "hex":
        audio_path.write_bytes(bytes.fromhex(audio))
        return str(audio_path)
    if isinstance(audio, str) and audio.startswith("http"):
        download_file(audio, audio_path)
        return str(audio_path)
    return None


def file_sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reusable_manifest(manifest_path: pathlib.Path, endpoint: str, payload: dict) -> dict | None:
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        audio_path = pathlib.Path(manifest["local_files"]["audio"])
        audio_hash = manifest["hashes"]["audio_sha256"]
        subtitle_path = manifest["local_files"].get("subtitle")
        valid_subtitle = not manifest.get("response", {}).get("subtitle_downloaded") or (
            subtitle_path and pathlib.Path(subtitle_path).exists()
        )
        if (
            manifest.get("provider") == "minimax"
            and manifest.get("type") == "tts"
            and manifest.get("endpoint") == endpoint
            and manifest.get("request") == payload
            and manifest.get("response", {}).get("base_resp", {}).get("status_code") in (0, None)
            and manifest.get("response", {}).get("trace_id")
            and audio_path.exists()
            and file_sha256(audio_path) == audio_hash
            and valid_subtitle
        ):
            return manifest
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def main() -> int:
    args = parse_args()
    disable_proxy_for_minimax()
    text = read_text(args).strip()
    if not text:
        print("口播文本为空。", file=sys.stderr)
        return 2

    out_dir = pathlib.Path(args.out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    base_url = BACKUP_BASE_URL if args.use_backup_base_url else args.base_url.rstrip("/")
    endpoint = f"{base_url}/v1/t2a_v2"

    payload = {
        "model": VOICE_PROFILE["model"],
        "text": text,
        "stream": False,
        "voice_setting": {
            "voice_id": VOICE_PROFILE["voice_id"],
            "speed": VOICE_PROFILE["speed"],
            "vol": VOICE_PROFILE["vol"],
            "pitch": VOICE_PROFILE["pitch"],
        },
        "audio_setting": {
            "sample_rate": VOICE_PROFILE["sample_rate"],
            "bitrate": VOICE_PROFILE["bitrate"],
            "format": VOICE_PROFILE["format"],
            "channel": VOICE_PROFILE["channel"],
        },
        "pronunciation_dict": {"tone": args.pronunciation},
        "language_boost": args.language_boost,
        "subtitle_enable": True,
        "subtitle_type": args.subtitle_type,
        "output_format": args.output_format,
        "aigc_watermark": args.aigc_watermark,
    }

    manifest_path = out_dir / (args.manifest_name or f"{args.name}.manifest.json")
    existing = reusable_manifest(manifest_path, endpoint, payload)
    if existing:
        print("MiniMax 成功 manifest、请求和音频哈希未漂移；复用现有语音。", file=sys.stderr)
        print(json.dumps(existing, ensure_ascii=False, indent=2))
        return 0

    api_key = get_api_key()
    if not api_key:
        print("缺少 MINIMAX_API_KEY，且未在本机 Keychain 找到 MiniMax 密钥。", file=sys.stderr)
        return 2

    response = request_json(endpoint, api_key, payload)
    base_resp = response.get("base_resp", {})
    if base_resp.get("status_code") not in (0, None):
        print(json.dumps(response, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1

    audio_path = out_dir / f"{args.name}.{VOICE_PROFILE['format']}"
    audio_result = write_audio(response, args.output_format, audio_path)

    subtitle_result = response.get("data", {}).get("subtitle_file")
    subtitle_path = None
    if isinstance(subtitle_result, str) and subtitle_result.startswith("http"):
        suffix = pathlib.Path(subtitle_result.split("?", 1)[0]).suffix or ".json"
        subtitle_name = f"{args.name}.titles" if suffix in (".title", ".titles") else f"{args.name}.subtitle{suffix}"
        subtitle_path = out_dir / subtitle_name
        download_file(subtitle_result, subtitle_path)

    response_path = out_dir / f"{args.name}.response.json"
    stored_response = json.loads(json.dumps(response, ensure_ascii=False))
    stored_audio = stored_response.get("data", {}).get("audio")
    if isinstance(stored_audio, str):
        if stored_audio.startswith("http"):
            stored_response["data"]["audio"] = "<已下载到本地音频文件，临时签名 URL 已省略>"
        else:
            stored_response["data"]["audio"] = f"<已写入音频文件，省略 {len(stored_audio)} 个十六进制字符>"
    if isinstance(stored_response.get("data", {}).get("subtitle_file"), str):
        stored_response["data"]["subtitle_file"] = "<已下载到本地字幕文件，临时签名 URL 已省略>"
    response_path.write_text(json.dumps(stored_response, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {
        "provider": "minimax",
        "type": "tts",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "endpoint": endpoint,
        "runtime": {
            "python_executable": sys.executable,
            "python_version": sys.version.split()[0],
            "ssl_version": ssl.OPENSSL_VERSION,
            "network_attempts": NETWORK_TELEMETRY["attempts"],
            "network_retries": NETWORK_TELEMETRY["retries"],
        },
        "request": payload,
        "response": {
            "trace_id": response.get("trace_id"),
            "base_resp": response.get("base_resp"),
            "extra_info": response.get("extra_info"),
            "data_status": response.get("data", {}).get("status"),
            "subtitle_downloaded": subtitle_path is not None,
        },
        "local_files": {
            "audio": str(audio_path) if audio_result else None,
            "audio_url": None,
            "subtitle": str(subtitle_path) if subtitle_path else None,
            "raw_response": str(response_path),
        },
        "hashes": {
            "audio_sha256": file_sha256(audio_path) if audio_result else None,
            "subtitle_sha256": file_sha256(subtitle_path) if subtitle_path else None,
        },
        "voice_profile": VOICE_PROFILE,
    }

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
