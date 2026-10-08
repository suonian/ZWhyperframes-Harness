[中文](SECURITY.md) | **English**

# Security Policy

## Supported versions

| Version | Status |
| --- | --- |
| `main` branch | ✅ Security fixes accepted |
| Released versions | ✅ Security fixes accepted |
| Historical commits | ❌ No backports |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues.** Report privately via GitHub's [private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability), or contact the maintainer if that feature is unavailable.

Please include, where possible: the affected file/lines, reproduction steps, the scope of impact, and the fix direction you suggest. We will credit you publicly once the fix is confirmed (unless you prefer to remain anonymous).

---

## Security design of this project

### Credentials

**API keys come only from environment variables or the macOS Keychain, and never enter the repository or the logs.**

```bash
export MINIMAX_API_KEY="..."        # preferred
# or
security add-generic-password -a minimax -s MINIMAX_API_KEY -w '...'
```

The Keychain service name can be overridden with `MINIMAX_KEYCHAIN_SERVICE`.

Files in the repository such as `tools/minimax/minimax.config.example.json` contain **placeholders only**; never commit real secrets. `.gitignore` already excludes `.env*` and `*.local`.

### Evidence integrity (fail-closed)

This project binds production artifacts with a SHA-256 chain — locked script → TTS artifact → injection binding → MP4.

**Back-filling a hash after the fact to "green" a gate is strictly forbidden.** A hash computed after the fact is a fabricated binding that was never verified, and it makes the entire evidence chain meaningless. A missing binding can only be re-derived by re-running the corresponding generation step.

> Already-delivered historical products are not migrated — the historical-format artifacts inside them are a matter of record, so a failing gate is **correct behavior**.

### Command execution

Scripts invoke external commands (`node`, `ffmpeg`, `ffprobe`, `python3`, `git`) through `spawnSync`, **without shell string concatenation**; arguments are passed as arrays to avoid command injection. Path boundaries for segment directories and the product root are explicitly validated in both scaffolding and gates, which reject paths that escape the project root.

### Network

- The production main chain **does not depend on the network** (running offline is a capability floor)
- Proxy probing uses a socket connection with a 1s timeout, never `nc` or bash `/dev/tcp` (both hang themselves when packets are silently dropped)
- MiniMax goes over a direct domestic connection, and the scripts actively clear proxy variables

---

## Third-party components and telemetry (important)

This project **reports no telemetry of its own**. However, it depends on and calls the following third parties:

### HyperFrames (Apache-2.0, HeyGen, Inc.)

The HyperFrames CLI **does report anonymous usage telemetry**. This project passes `--skill=faceless-explainer` during segment scaffolding; that slug is written into each project's `hyperframes.json` to attribute which creative workflow was used within anonymous telemetry.

**To disable telemetry entirely:**

```bash
export HYPERFRAMES_NO_TELEMETRY=1
```

Please add it to your production environment entry script. We make no guarantee about the specific contents of third-party telemetry; see the [official HyperFrames documentation](https://github.com/heygen-com/hyperframes).

### MiniMax

The MiniMax API is only contacted when you explicitly invoke a script under `tools/minimax/`. Credentials are read only from environment variables or the Keychain, and are never written into any artifact file.

---

## Trademark and unofficial project statement

"HyperFrames" is a trademark of HeyGen, Inc. This project is an **unofficial independent project**, with no affiliation, sponsorship, or endorsement by HeyGen; the word appears in its name solely to describe the technical dependency. Apache-2.0 grants no trademark rights. See [DISCLAIMER.md](DISCLAIMER.md).
