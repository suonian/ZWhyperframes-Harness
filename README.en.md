[中文](README.md) | **English**

# ZWhyperframes-Harness

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-5FA04E.svg)](https://nodejs.org/)
[![HyperFrames](https://img.shields.io/badge/hyperframes-0.8.36%20locked-8A2BE2.svg)](https://github.com/heygen-com/hyperframes)
[![CI](https://img.shields.io/badge/CI-4%20jobs-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-45%20total-brightgreen)](https://github.com/suonian/ZWhyperframes-Harness/actions/workflows/ci.yml)

A harness engineering project for HyperFrames: rules constrain the official production flow, gates enforce that official capabilities are actually executed. Core official capabilities are never rebuilt.

> ⚠️ **Unofficial project.** Not affiliated with, sponsored by, or endorsed by HeyGen. "HyperFrames" is a trademark of HeyGen, Inc.; it appears in this project's name solely to describe the technical dependency. Apache-2.0 grants no trademark rights. See [DISCLAIMER.md](DISCLAIMER.md).

## Contents

- [Why this layer exists](#why-this-layer-exists)
- [What this is, and what it is not](#what-this-is-and-what-it-is-not)
- [How it works](#how-it-works)
- [Why you can trust it](#why-you-can-trust-it)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Repository layout](#repository-layout)
- [Rules](#rules)
- [Getting help](#getting-help)
- [Contributing](#contributing)
- [Documentation index](#documentation-index)
- [Privacy and telemetry](#privacy-and-telemetry)
- [Contact](#contact)
- [License](#license)

## Why this layer exists

Producing videos with HyperFrames directly produces three classes of problem **consistently** — not intermittently, every single time:

1. **Production is unstable and drifts** — the same process run ten times yields ten different results.
2. **Rules and capabilities are "nominally in use" but never actually executed** — the official capabilities are all there, but nothing guarantees the agent really runs them; written in the documentation does not mean it happened.
3. **The process is chaotic** — steps get skipped, quality degrades, each segment improvises, and afterwards you cannot tell which step actually ran.

The root cause is not missing functionality. It is that **production is driven by an agent in the moment**: the capabilities are present, the discipline is not. Rules are written to be read by a model, not executed by a machine.

## What this is, and what it is not

HyperFrames' capabilities are complete — composition, storyboarding, sub-agent contracts, audio engine, captions, transitions, assembly, check, rendering. This repository rebuilds **none** of it; it only adds a layer of constraint around it.

| Is | Is not |
| --- | --- |
| Rules: official flow written as decidable conditions | Prompts: left to the model's discretion |
| Gates: fail-closed when conditions aren't met, artifacts left as evidence | Post-hoc checks: notice a problem, then fix it |
| Enforcement over **verifiable artifacts** | Enforcement of agent behavior — that cannot be done, and we don't pretend otherwise |

**Non-goals (explicitly out of scope):**

- Not reimplementing composition, assembly, transitions, caption rendering, check, or rendering — official already has these, nothing is rebuilt
- Not writing scripts as an agent execution layer — scripts are agent-call-free; sub-agent dispatch happens only inside the main agent conversation
- Not tracking HF versions that official hasn't released — upgrading is a **contract audit** task, not a version-number change

## How it works

| | Nature | What it does |
| --- | --- | --- |
| **Protect the process** | Enforcement | Turns "should follow official `faceless-explainer` Step 0–6 + review-loop" into "cannot pass without doing so" |
| **Enforce capabilities** | Enforcement | Turns "the rules say to use pitch-round" into "the gate is red if pitch-round never ran" |
| **Fill the gaps** | Fill-in | The few management pieces official genuinely lacks: locked-script segmentation, MiniMax word-level timing injection, master concatenation, state & approval records |

**Filling the gaps is a by-product, not the mission.** Core capabilities come 100% from official, none of it is rebuilt — anti-duplication is a boundary, not the purpose.

## Why you can trust it

This section states **verifiable facts**, not adjectives.

- **Fail-closed, not best-effort.** Locked script → TTS → injection binding → MP4 are chained with SHA-256; a frame's voiceover is released only when fully equal to the locked script after normalization — not similarity.
- **Evidence cannot be fabricated.** A missing binding can only be re-derived; **back-filling a hash after the fact to "green" a gate is forbidden**. A back-filled hash is a binding that was never verified.
- **Offline is a capability floor.** After one-time P0 preparation, a video must be completable with no network mid-production (this is a minimum requirement, not a network ban: on-demand capabilities may still go online; they just must not be a precondition of the main chain).
- **Decision gates converge to four.** Per-segment start authorization, per-segment final-look render authorization, master final look, and project close-out approval. Nothing else interrupts.

### Enforcement comes in three tiers, and we don't call tier 2 and 3 "enforced"

"Written in the rules" is not "enforced". This project discloses that distinction honestly:

| Tier | Meaning | Coverage |
| --- | --- | --- |
| **3.1 Machine gates in this repo** | Missing one is fail-closed | `verify` / `final-look` / `pitch-round` / `animation-map` / `check` / `mp4` / `next-segment` / `master-inputs` / `layout-guard` / `authorized` |
| **3.2 Official CLI commands** | Must genuinely be executed; the exit code is the evidence. **No machine gate in this repo** | Official `catalog` / `keyframes` / `compare` / `publish` / carve |
| **3.3 Process / review evidence** | **No machine gate in this repo** | frame-comments disposition, recipe freeze, media-treatment |

Of the 12 official quality capabilities, **only 3 have machine gates in tier 3.1**. The other 9 are held by process and review, and do not satisfy "blocked unless run" — that is stated in [Rules §3](docs/rules/production-workflow-rules.md) rather than hidden.

> A gate cannot prove an agent "actually executed" a capability unless that capability leaves a verifiable artifact. This is the harness's capability boundary, and admitting it is more useful than exaggerating it.

## Requirements

| Item | Value |
| --- | --- |
| Node.js | ≥ 22 |
| HyperFrames | `0.8.36` (pinned; refuses to run if the CLI is missing or drifted) |
| ffmpeg / ffprobe | Required (per-frame audio splitting and duration probing) |
| Python 3 | Required (MiniMax caller and proxy probing) |
| Platform | macOS / Linux (`net-env.sh` probing depends on bash + python3) |

## Quick start

```bash
git clone https://github.com/suonian/ZWhyperframes-Harness.git
cd ZWhyperframes-Harness

npm run bootstrap    # install locked dependencies + verify HF version + refresh official skills
npm run doctor       # environment check: CLI version / skills / browser / ffmpeg / MiniMax credentials
source ./hf-env.sh   # production entry point (provides the hf function, network policy, skips init's network check)
npm test             # 45 tests
```

> The caption test genuinely imports official `faceless-explainer`'s `captions.mjs` (verifying the "rendering goes through official" path). It depends on the official skill installed by `npm run bootstrap`; without bootstrapping, that test is **explicitly marked skip** rather than failed. CI runs bootstrap first, so this path is **really executed** in CI.

### Networking

`scripts/net-env.sh` is the single owner of network policy:

- npm defaults to the mainland China mirror `registry.npmmirror.com`
- The GitHub/npm proxy **probes `http://127.0.0.1:7890` by default and enables it only when reachable**
- MiniMax connects directly to `api.minimaxi.com` (`no_proxy` exemption plus proactive proxy-variable clearing inside `tools/minimax`, belt and braces)

Why probe: pointing a proxy at a local port that isn't listening makes `git`/`npm` **hang silently** (no timeout), which is fatal for developers who don't run a proxy. Probing uses a Python socket connection with a 1s timeout, and never `nc` or bash `/dev/tcp` — both of those hang themselves when packets are silently dropped, which is exactly the failure being avoided.

Overrides:

```bash
HARNESS_NO_PROXY=1 bash scripts/bootstrap.sh          # force proxy off
HARNESS_PROXY=http://127.0.0.1:1080 bash scripts/bootstrap.sh   # explicit (no probing)
```

### MiniMax credentials

```bash
export MINIMAX_API_KEY="your API key"        # preferred
```

Or store it in the macOS Keychain (service name defaults to `MINIMAX_API_KEY`, overridable via `MINIMAX_KEYCHAIN_SERVICE`):

```bash
security add-generic-password -a minimax -s MINIMAX_API_KEY -w 'your API key'
```

## Repository layout

```text
AGENTS.md              Agent entry point: positioning, rule navigation, hard boundaries
docs/rules/            Production rules (visual / captions / segmentation / workflow, each a single owner)
docs/architecture/     Official capability audit and cross-session handoff
docs/plans/            Launch design
scripts/               Management scripts (single-step, deterministic, agent-call-free)
  net-env.sh           Single owner of network policy
  new-video.mjs        Project scaffolding (locked-script freezing + segmentation + per-segment init)
  minimax-tts.mjs      MiniMax speech + word-level timing
  inject-audio-meta.mjs  Word-level timing → official audio_meta.json
  captions-zh.mjs      Chinese caption grouping data (rendering still official)
  gate.mjs             Gates (10 commands, see "Why you can trust it")
  state.mjs            The only write entry point for state and approvals
  finalize-master.mjs  Master concatenation (thin ffmpeg concat)
tools/minimax/         MiniMax API callers (TTS / image / video)
tests/                 Tests (unit + e2e, fully offline)
```

Video products **do not enter this repository**; by default they are written to `~/Documents/ZWhyperframes-products/`.

## Rules

| File | Owns |
| --- | --- |
| `docs/rules/production-workflow-rules.md` | Official Step 0–6 landing points, decision gates, three-tier mandatory capability list, handoff and issue ledger |
| `docs/rules/visual-production-rulebook.md` | Visual quality floor |
| `docs/rules/captions-contract.md` | Caption contract (requirements immutable) |
| `docs/rules/segment-production-rules.md` | Locked-script freezing and segmentation |

Precedence: **current user instruction > AGENTS.md > `docs/rules/` > official HF contracts** (with the built `$HYPERFRAMES_REPO` as ground truth).

> **Language policy.** The four files under `docs/rules/` are maintained in **Chinese only**, and Chinese is authoritative for their normative requirements. This is deliberate: they are normative contracts with a single owner, so an English twin would create two sources of truth, and this repo's precedence order has no language dimension to adjudicate drift. The same applies to `AGENTS.md`, `docs/architecture/`, and `docs/plans/`. Community and governance documents are bilingual — see the "English" column in the documentation index below.

## Getting help

| Situation | Channel |
| --- | --- |
| Usage question or bug | [Open an issue](https://github.com/suonian/ZWhyperframes-Harness/issues) (three templates: bug / feature request / question) |
| Feature proposal | [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md), which requires passing the architectural-invariant self-check |
| Security vulnerability | **Do not** open a public issue — see the private reporting process in [SECURITY.en.md](SECURITY.en.md) |
| Contributing code | See "Contributing" below |

## Contributing

See [CONTRIBUTING.en.md](CONTRIBUTING.en.md). Running `npm test` is **mandatory** after changing any rule, script, or schema.

## Documentation index

| Document | Contents | 中文 |
| --- | --- | --- |
| [CONTRIBUTING.en.md](CONTRIBUTING.en.md) | Contribution guide and design discipline | [中文](CONTRIBUTING.md) |
| [CHANGELOG.en.md](CHANGELOG.en.md) | Changelog | [中文](CHANGELOG.md) |
| [SECURITY.en.md](SECURITY.en.md) | Security policy, credential handling, third-party telemetry | [中文](SECURITY.md) |
| [CODE_OF_CONDUCT.en.md](CODE_OF_CONDUCT.en.md) | Code of conduct | [中文](CODE_OF_CONDUCT.md) |
| [DISCLAIMER.en.md](DISCLAIMER.en.md) | Trademark and content-copyright disclaimer | [中文](DISCLAIMER.md) |
| [AGENTS.md](AGENTS.md) | Agent entry point — **Chinese only** | — |
| [NOTICE](NOTICE) | Third-party attribution (language-neutral legal text) | — |
| [CITATION.cff](CITATION.cff) | Citation metadata (GitHub generates "Cite this repository" from it) | — |

## Privacy and telemetry

This project sends **no telemetry of its own**. However, the HyperFrames CLI it invokes **does report anonymous usage telemetry**, and `--skill=faceless-explainer` is stamped into each project's `hyperframes.json` so renders can be attributed to that authoring workflow.

To disable entirely: `export HYPERFRAMES_NO_TELEMETRY=1`. See [SECURITY.en.md](SECURITY.en.md).

## Contact

For project inquiries and discussions, scan the QR code below to add the author on WeChat:

<img src="assets/wechat-qr.jpg" width="140" alt="WeChat QR Code">

## License

Built on HyperFrames by [HeyGen, Inc.](https://github.com/heygen-com), licensed under the [Apache License 2.0](LICENSE). This project **contains no** HyperFrames source and consumes it purely as an external dependency — see [NOTICE](NOTICE).