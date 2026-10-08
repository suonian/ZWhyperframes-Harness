[中文](CHANGELOG.md) | **English**

# Changelog

This project records notable changes in its releases.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/lang/en/).

> ⚠️ **HyperFrames version pinning**: `0.8.36`. Upgrading is not a version-number change but a **contract audit** task — official skill content changes together with `skills update`, and the rules in this repository quote it verbatim.

> The files under `docs/rules/` referenced below are maintained in **Chinese only**; Chinese is authoritative for their normative requirements.

## [Unreleased]

### Gates
- **Corrected a false claim**: §3 previously stated "12 mandatory quality capabilities; missing one fails the gate", and claimed item 1 was validated by `gate.mjs` against `BRIEF.md`'s `## Intent` — but that gate **was never implemented**, and the repo contained zero BRIEF-validation code. Conflating "written in the rules" with "already enforced" is exactly the disease this project exists to cure, and it caught it first.
- Added `gate.mjs pitch-round`: validates that the project root's `BRIEF.md` has a non-empty `## Intent` (where official `pitch-round.md` requires the winning concept to land).
- Added `gate.mjs animation-map`: validates that the segment contains `.hyperframes/anim-map/animation-map.json` (the official `animation-map.mjs` default output path).
- **`gate.mjs final-look` now embeds official `check --strict`**: previously `check` and `final-look` never called each other, so render authorization could be granted first and the check run later — or skipped entirely. Render authorization can no longer bypass it.
- Both new gates come with e2e tests, mutation-verified (rewriting each gate to always pass turns the tests red).
- §3 is split into three tiers with honest coverage: 3.1 machine gates in this repo (3 items), 3.2 official CLI commands (6 items, no machine gate), 3.3 process / review evidence (3 items, no machine gate), plus an explicit note that "any claim that this repo is fail-closed on all 12 is wrong".

### Documentation
- `package.json`'s `description` now carries the current positioning, matching the README's first line and the GitHub repository description verbatim (53 characters / 117 bytes) — it previously still read "management customization layer", a retracted framing.
- The README characteristics list grew from 5 entries to 8 (in both languages): added **customizable visuals** (a single `frame.md` as the visual source of truth; the current configuration defines 12 custom colors shared across all 7 segments), **single source of truth** (content / visuals / state / networking / governance each has one owner; every artifact is bound to its input by SHA-256), **modularity** (shared capability concentrated in `scripts/lib/` with nothing copied between scripts; vendor capability isolated in `tools/minimax/`), and **self-evolution** (self-built layers are retired as upstream catches up; blockers enter an issue ledger, merged by root cause and marked resolved). The former "fail-closed" and "evidence cannot be fabricated" entries were merged into "enforcement, not suggestion".
- The README's first screen is now "What it solves · What it gives you · Characteristics": the value statement sits immediately after the one-line description, with the disclaimer and table of contents pushed below. The former "Why this layer exists" section moved up and was removed to avoid duplication. The four characteristics duplicated from the first screen were removed from "Why you can trust it", leaving only the mechanism description and the three-tier enforcement disclosure.
- Added `assets/wechat-qr.jpg` and a "Contact" section in both READMEs, placed immediately before the License section.
- Repository description is now "HyperFrames 的 harness 工程：以规则约束官方流程，以门禁强制能力执行。不重写官方能力。" (53 characters / 117 bytes).
- Added `CITATION.cff`, which GitHub uses to generate "Cite this repository".
- README gained a "Getting help" section listing four channels: issues, feature proposals, security vulnerabilities, and code contributions.
- Topics gained `agent-harness`, `guardrails`, and `llm` as domain search terms (15 total).

### Security
- Enabled GitHub secret scanning (including push protection) and dependabot security updates.
- Enabled private vulnerability reporting — the channel `SECURITY.md` points reporters to was previously disabled.
- **README restructured into six sections** (both languages): what it is in one line / why it's needed / what this is and what it is not / how it works / why you can trust it / usage and governance. The "why you can trust it" section states only verifiable facts and publishes the true coverage of the three enforcement tiers — only 3 of the 12 official capabilities have machine gates.
- Added a **non-goals** section: "does not rebuild official capabilities", "scripts are agent-call-free", and "does not track unreleased versions" are promoted from a corner, because they are part of what this is.
- **Aligned with the standard-readme spec**: the short description is now 112 characters and matches the GitHub repository description; a table of contents was added (the README exceeds the 100-line threshold); License moved to the last section.
- **Corrected the GitHub repository description**: it was still the 292-character old positioning ("management layer… mandatory use of quality capabilities"), contradicting the rewritten docs.
- **Corrected the project's positioning**: it was previously described as a "management layer" that "only fills management gaps official does not have", which inverts cause and effect. The real driver is that **HyperFrames can run but cannot police itself** — rules and official capabilities are "nominally in use" but never actually executed. The positioning is restated as **the harness that reins HyperFrames in**, with the three duties re-characterized as "protect the process (enforcement) / enforce capabilities (enforcement) / fill the gaps (fill-in)", and "anti-duplication is a boundary, not the purpose".
- The Chinese README gained the problem-statement section it was missing (the English version already had one); the two structures now align.
- **Bilingual community and governance documents**: added English versions of `CONTRIBUTING` / `CHANGELOG` / `CODE_OF_CONDUCT` / `SECURITY` / `DISCLAIMER`, with a language switcher in both directions on every pair.
- **Fixed the README language switcher**: `README.md` previously read `**English** | [中文](#...)`, where "English" was bold but not a link, making the repository landing page look like it had no English version. Now `[English](README.en.md) | **中文**`.
- **Established a language policy**: community and governance documents are bilingual; `docs/rules/`, `AGENTS.md`, `docs/architecture/`, and `docs/plans/` stay Chinese-only single-source. They are normative contracts with a single owner, so an English twin would create two sources of truth for normative requirements, and this project's precedence order has no language dimension to adjudicate drift.

### Changed
- Corrected official contract reference paths: the 5 contracts actually live in `skills/hyperframes/references/`, while the path previously documented, `skills/hyperframes-core/references/`, was a dead link (each one verified individually).

## [0.1.0] — 2026-10-08

First public release.

### Added
- **Management-layer positioning**: preserve the flow (rules and gates), fill the gaps (locked-script segmentation / MiniMax word-level timing injection / master concatenation / state and approvals), upgrade capabilities (mandatory wiring of official quality capabilities).
- **Official capability audit** (`docs/architecture/hf-0.8.36-capability-audit.md`): confirmed that HF 0.8.36 natively adopted a "single agent + one sub-agent per frame" model; the previously self-built worker execution layer, transport evidence, three-slot queue, and heartbeat/lease were all retired.
- **Production scripts** (single-step, idempotent, deterministic, agent-call-free): project scaffolding, MiniMax TTS injection, Chinese caption grouping, gates, state and approvals, master concatenation.
- **Rule documentation** (each a single owner): production workflow, visual rulebook, caption contract, locked script and segmentation.
- **Offline capability floor**: the official escape hatch `HYPERFRAMES_SKIP_SKILLS=1` blocks the segment scaffolding's hidden network dependency; `npm test` runs fully offline, including a black-hole-proxy case for that offline floor.
- **Single-point network policy** (`scripts/net-env.sh`): npm mirror in mainland China; GitHub/npm proxy **probes `127.0.0.1:7890` by default and only enables it when reachable**; MiniMax is exempted for direct connection.
- **Evidence integrity**: SHA-256 chained binding of locked script → TTS → injection binding → MP4; a frame's voiceover must be fully equal to the locked script after normalization.
- **Gates**: `verify` / `authorized` / `final-look` / `check` (a thin wrapper around official `--strict`) / `mp4` / `next-segment` / `master-inputs` / `layout-guard`.
- **Generalized locked-script markers**: `<any-namespace>:script:start|end`, backward compatible with existing material packages.
- **CI**: ubuntu + macos × Node 22/24.

### Security
- API keys come only from environment variables or the macOS Keychain; they never enter the repository or the logs.
- The injection binding schema is versioned; historical formats **refuse back-filled hashes that would forge evidence** and can only be re-derived.
- Secret and personal-identifier scan: the full history contains no secrets and no personal absolute paths.

### License
- Apache-2.0 (consistent with upstream HyperFrames). This project contains no HF source code and only calls it as an external dependency.

[Unreleased]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/suonian/ZWhyperframes-Harness/releases/tag/v0.1.0
