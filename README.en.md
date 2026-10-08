# ZWhyperframes-Harness

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E.svg)](https://nodejs.org/)
[![HyperFrames](https://img.shields.io/badge/hyperframes-0.8.36%20locked-8A2BE2.svg)](https://github.com/heygen-com/hyperframes)
[![CI](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml/badge.svg)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-43%20total-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)

A **management layer** for producing Chinese faceless (no-presenter) knowledge videos, built on top of [HyperFrames](https://github.com/heygen-com/hyperframes).

> ⚠️ **Unofficial project.** Not affiliated with, sponsored by, or endorsed by HeyGen. "HyperFrames" is a trademark of HeyGen, Inc.; it appears in this project's name solely to describe the technical dependency. Apache-2.0 grants no trademark rights. See [DISCLAIMER.md](DISCLAIMER.md).

[中文](README.md) | **English**

---

## Why

A production pipeline needs far more than a renderer. It needs **process discipline**: a locked script that can't drift, segment boundaries that follow meaning rather than word count, word-level TTS timing that must match the script exactly, four decision gates that stop only where a human must decide, and an audit trail binding every artifact to the thing that produced it.

HyperFrames already owns composition, storyboarding, sub-agent dispatch, audio, captions, transitions, assembly, check, and rendering. **This project does not rebuild any of that.** It owns the management layer HyperFrames doesn't have.

| | Responsibility |
| --- | --- |
| **Protect the process** | Rules and gates that force a run through the official `faceless-explainer` Step 0–6 + review-loop |
| **Fill the gaps** | Locked-script segmentation, MiniMax word-level timing injection, master concatenation, state & approval records |
| **Enforce quality** | Mandatory use of official quality capabilities (pitch-round / frame presets / on-device catalog / carve / animation-map / `check --strict`) |

**Anti-duplication is a hard boundary.** Do not hand-roll composition, assembly, transitions, caption rendering, check, or rendering. Scripts stay single-step, idempotent, deterministic, and free of agent calls.

## Design commitments

- **Fail-closed, not best-effort.** Locked script → TTS artifacts → injection binding → MP4 are chained with SHA-256. A frame's voiceover must match the locked script by **exact equality after normalization** — not similarity.
- **Evidence cannot be fabricated.** A missing historical binding must be **re-derived**, never back-filled with a hash computed today. A back-filled hash is a forgery, and it poisons the entire chain.
- **Offline is a floor, not a ban.** After one-time preparation, a run must be completable with no network at all. On-demand capabilities (asset search, catalog search, model download) may still use the network — they just must never become a prerequisite of the main chain.
- **Four decision gates, no more.** Per-segment start authorization, per-segment final-look render authorization, master final look, and project sign-off. Everything else runs without stopping.

## Requirements

| | |
| --- | --- |
| Node.js | ≥ 22 |
| HyperFrames | `0.8.36` (pinned; the CLI refuses to run on drift) |
| ffmpeg / ffprobe | Required (frame audio cutting, duration probing) |
| Python 3 | Required (MiniMax client, proxy probing) |
| Platform | macOS / Linux (`net-env.sh` needs bash + python3) |

## Quick start

```bash
git clone https://github.com/suonian/ZWhyperframes-Harness.git
cd ZWhyperframes-Harness

npm run bootstrap    # install pinned deps + verify HF version + refresh official skills
npm run doctor       # environment check: CLI / skills / browser / ffmpeg / MiniMax credentials
source ./hf-env.sh   # production entry point (hf function, network policy, offline init)
npm test             # 43 tests
```

> The captions test genuinely imports the official `faceless-explainer` `captions.mjs` (verifying that "rendering stays official"). It depends on official skills installed by `npm run bootstrap`; without bootstrap that single test is **explicitly skipped** rather than failing. CI runs bootstrap first, so this path is **actually exercised** there.

### Networking

`scripts/net-env.sh` is the single owner of network policy:

- npm defaults to the China mirror `registry.npmmirror.com`
- The GitHub/npm proxy is **probed at `http://127.0.0.1:7890` and only enabled if reachable**
- MiniMax connects directly (`no_proxy` exemption, plus the scripts clear proxy variables themselves)

Probing matters: pointing a proxy at a local port that doesn't exist makes `git`/`npm` **hang silently** (no timeout), which is fatal for contributors without a proxy. The probe uses a Python socket with a 1s timeout — never `nc` or bash `/dev/tcp`, both of which hang themselves when packets are silently dropped.

```bash
HARNESS_NO_PROXY=1 bash scripts/bootstrap.sh                        # force proxy off
HARNESS_PROXY=http://127.0.0.1:1080 bash scripts/bootstrap.sh       # explicit (no probe)
```

### MiniMax credentials

```bash
export MINIMAX_API_KEY="your-api-key"        # preferred
```

or macOS Keychain (service name defaults to `MINIMAX_API_KEY`, override with `MINIMAX_KEYCHAIN_SERVICE`):

```bash
security add-generic-password -a minimax -s MINIMAX_API_KEY -w 'your-api-key'
```

## Repository layout

```text
AGENTS.md              agent entry point: positioning, rule navigation, hard boundaries
docs/rules/            production rules (visual / captions / segmentation / workflow)
docs/architecture/     official capability audit + cross-session handoff
docs/plans/            launch design
scripts/               management scripts (single-step, deterministic, zero agent calls)
  net-env.sh           single owner of network policy
  new-video.mjs        project scaffolding (lock script, segmentation, per-segment init)
  minimax-tts.mjs      MiniMax speech + word-level timing
  inject-audio-meta.mjs  word timing → official audio_meta.json
  captions-zh.mjs      Chinese caption grouping data (rendering still official)
  gate.mjs             lightweight gates (hashes, approvals, min font size)
  state.mjs            the only writer of state and approval records
  finalize-master.mjs  master concatenation (thin ffmpeg concat)
tools/minimax/         MiniMax API client (TTS / image / video)
tests/                 unit + e2e tests, fully offline
```

Produced videos are **not committed** — they live outside this repo (by default `~/Documents/ZWhyperframes-products/`).

## Rules

| File | Owns |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | Official Step 0–6 landing points, decision gates, mandatory quality capability list |
| `docs/rules/visual-production-rulebook.md` | Visual quality floor |
| `docs/rules/captions-contract.md` | Caption contract (requirements immutable) |
| `docs/rules/segment-production-rules.md` | Locked-script freezing and segmentation |

Precedence: **current user instruction > AGENTS.md > `docs/rules/` > official HF contracts.**

> **Language policy.** The four files under `docs/rules/` are maintained in **Chinese only**, and Chinese is authoritative for their normative requirements. This is deliberate: they are normative contracts with a single owner, so an English twin would create two sources of truth with no machine rule to adjudicate drift. The same applies to `AGENTS.md`, `docs/architecture/`, and `docs/plans/`. Community and governance documents are bilingual.

## Privacy and telemetry

This project sends **no telemetry of its own**. However, the HyperFrames CLI it invokes **does report anonymous usage telemetry**, and `--skill=faceless-explainer` is stamped into each project's `hyperframes.json` so renders can be attributed to that authoring workflow.

To disable entirely: `export HYPERFRAMES_NO_TELEMETRY=1`. See [SECURITY.en.md](SECURITY.en.md).

## Documentation index

| Document | Contents |
| --- | --- |
| [CONTRIBUTING.en.md](CONTRIBUTING.en.md) | Contribution guide and design discipline |
| [CHANGELOG.en.md](CHANGELOG.en.md) | Changelog |
| [SECURITY.en.md](SECURITY.en.md) | Security policy, credential handling, third-party telemetry |
| [CODE_OF_CONDUCT.en.md](CODE_OF_CONDUCT.en.md) | Code of conduct |
| [DISCLAIMER.en.md](DISCLAIMER.en.md) | Trademark and content-copyright disclaimer |
| [AGENTS.md](AGENTS.md) | Agent entry point — **Chinese only** |
| [NOTICE](NOTICE) | Third-party attribution (language-neutral legal text) |

## Contributing

See [CONTRIBUTING.en.md](CONTRIBUTING.en.md). Running `npm test` is **mandatory** after changing any rule, script, or schema.

## License

Built on HyperFrames by [HeyGen, Inc.](https://github.com/heygen-com), Apache-2.0. This project contains no HyperFrames source and consumes it purely as an external dependency — see [NOTICE](NOTICE).

This project is licensed under the [Apache License 2.0](LICENSE).