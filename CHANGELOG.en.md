[中文](CHANGELOG.md) | **English**

# Changelog

This project records notable changes in its releases.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/lang/en/).

> ⚠️ **HyperFrames version pinning**: `0.8.36`. Upgrading is not a version-number change but a **contract audit** task — official skill content changes together with `skills update`, and the rules in this repository quote it verbatim.

> The files under `docs/rules/` referenced below are maintained in **Chinese only**; Chinese is authoritative for their normative requirements.

## [Unreleased]

### Documentation
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
