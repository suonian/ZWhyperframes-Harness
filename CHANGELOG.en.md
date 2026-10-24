[中文](CHANGELOG.md) | **English**

# Changelog

This project records notable changes in its releases.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/lang/en/).

> ⚠️ **HyperFrames version pinning**: `0.8.36`. Upgrading is not a version-number change but a **contract audit** task — official skill content changes with upstream commits, and the rules in this repository quote it verbatim.

> The files under `docs/rules/` referenced below are maintained in **Chinese only**; Chinese is authoritative for their normative requirements.

## [Unreleased]

Nothing yet.

## [0.2.3] — 2026-10-24

Measured adaptation of the SkillHub publishing path: the platform caps the publish request body at roughly 476KB and does not accept a gzip-compressed body. This release narrows the published package's content boundary accordingly, and adds a reproducible publish script with a fail-closed volume gate.

> On the version number: the `v0.2.2` GitHub Release is already published and does not contain the publish script added below, so those changes land in `0.2.3` — the same version number never points at different content on the two release lines. `0.2.2` has been submitted to SkillHub (HTTP 201); the platform publishes it itself after review, as it did before.

### Added
- `scripts/publish-skillhub.mjs` (`npm run publish-skill`): this repo's SkillHub publishing path. It works from the output of `scripts/build-skill-package.mjs` (rather than acting on the repository root directly), and keeps its fields and file-collection rules aligned with the SkillHub CLI's `parse_skill_md_frontmatter` / `_collect_skill_files` / `_post_publish_multipart`. Credentials are read only from the local CLI's credential file (the `user` node of `~/.skillhub/credentials.json`) — never from the repo, the logs, or the environment. Supports `--root` / `--changelog` / `--dry-run`.
- A volume gate on the publish request body: over the measured limit it fails closed with an explicit message and **sends no request**. Past the limit the server just drops the connection, and the client only sees a Broken pipe with nothing readable in it.
- `tests/packaging.test.mjs` grows to 4 cases: "the request body over the limit fails closed and sends no request" and "a body within the limit passes the gate and completes a dry run". Both were sensitivity-checked by mutation (relaxing the limit to 10MB turned the over-limit case red on the spot).
- `tests/changelog.test.mjs` (4 cases): a regression gate for changelog extraction, extracted into `scripts/lib/changelog.mjs`. The "the result is never empty" case targets a **silently failing** defect: the original implementation used the multi-line regex `(?=\n## \[|$)` to take a section's body, but in multiline mode `$` matches at any line end, so the non-greedy capture group was always empty — the script still succeeded, the platform still accepted the upload, only the changelog was always empty and showed the platform's default text. A mutation test confirms all four cases turn red when the old implementation is restored.
- **The publish script's changelog extraction now scans line by line** (`scripts/lib/changelog.mjs`). The old multi-line regex implementation always returned an empty string, so the changelog uploaded for 0.2.2 was empty and the platform displayed its default text "Initial release" — the 0.2.0 upload, by contrast, displayed the Chinese description correctly and serves as a control.

### Fixed
- The published package's content boundary is now two layers — the platform admission allowlist plus a content manifest for the package — rather than filtering by extension alone. The package previously carried governance documents, change history, the English mirror, internal architecture notes and this repo's own gate test cases (68 files / 488KB), over the server's limit; it is now 45 files / 319KB.
- The packaging script's exclusion list gained `.skillhub-pkg/` — that is the script's own output directory, and without the exclusion it swept the previous package in as well (measured: the file count rose from 45 to 135, tripping the platform limit outright).
- The packaging script's exclusion list gained `.github/` — this repo's own CI definitions and issue templates are repository infrastructure, of no use to a skill consumer. The published package is now 39 files / 314KB.
- The packaging manifest is now written **beside** the package directory (`<out>.manifest.json`): it is metadata about the package, not package content, and inside the package it made the package carry a self-referential file.
- The publish script no longer crashes when `CHANGELOG.md` is missing — that file is only the source of the release notes, not a precondition for publishing.
- The publish script's packaging output now goes to a system temp directory, leaving no build artifact in the workspace; `.gitignore` gained `.skillhub-pkg/` accordingly.

### Platform measurements
- **The SkillHub server caps the publish request body at roughly 476KB** (protocol §8.3 says ≤10MB — the documentation and the deployed service disagree, the same class of problem as this repo's earlier finding that `.jpg` is listed in the allowlist but rejected live). Measured: 475KB passes, 480KB is dropped.
- **The server does not accept a `Content-Encoding: gzip` request body**: a multipart body with that header fails at form parsing with 400 "解析表单失败: multipart: NextPart: EOF". Size must therefore be met by trimming content, not by compressing. (Note: authorization fails before form parsing and returns 401, so a 401 **cannot** be read as evidence that the server decompresses — this repo initially misread that signal once.)

## [0.2.2] — 2026-10-23

This repo is now distributed as a SkillHub skill; the three facts that actually decide whether it works — install into a discovery directory, bootstrap after install, no automatic index entry — are now documented instead of left for the user to infer.

> On the version number: the platform published this repo's first SkillHub artifact as `0.2.1` after review passed (content equivalent to `v0.2.0` plus `SKILL.md`). The protocol requires the local version to be strictly greater than the published one, so this release goes straight to `0.2.2`. GitHub does not publish `0.2.1`, so the same version number never points at different content on the two release lines.

### Added
- `tests/packaging.test.mjs` (2 cases): the packaging script did not exclude `vendor/` — once bootstrap had fetched the upstream `skills/` subtree, packaging swept it in as well (measured: 805 files, far past the platform §8.3 limit of 100, so the build was rejected). The cases drive the packaging script against a minimal synthetic repository (so they do not depend on whether the dev machine has bootstrapped) and assert that the artifact contains no `vendor/` paths and stays within the file limit. Sensitivity confirmed by mutation (removing `vendor` from the exclusion list): both cases turned red on the spot.
- `tests/docs-links.test.mjs` (6 cases): turns previously manual document consistency checks into a machine gate — ① zero dead relative links across all markdown; ② README TOC anchors in both languages match their headings (using GitHub's real slug rule, each space replaced individually, never collapsed); ③ the version number agrees across `package.json` / `package-lock.json` / `CITATION.cff` / `SKILL.md`; ④ `SKILL.md` satisfies protocol §8.2's frontmatter requirements (`name` kebab-case, `version` valid SemVer, `displayName` and `description` present and single-line); ⑤ `SKILL.md` declares that it only routes; ⑥ the test count declared in the docs (both README badges and bodies, plus the SKILL.md body) equals the actual number of cases under `tests/`. The first five were mutation-verified — injecting a dead link, restoring the version skew, dropping `name`, dropping the routing declaration each turns a case red, and restoring turns them green again. Item ③ is the version-skew defect this release fixes, reproduced verbatim. Item ⑥ targets a drift shape that keeps recurring here — adding cases without updating the README badge (which is exactly what happened this round: the badge stayed at 50 while the real count was 52); a mutation test confirms it is caught.
- `scripts/build-skill-package.mjs`: builds this repo into a SkillHub-uploadable skill package. The platform protocol (`iflytek/skillhub` docs/07 §8.3) constrains uploads by file type, ≤100 files, ≤10MB total, and ≤1MB per file — while this repo's `LICENSE` / `NOTICE` / `.gitignore` / `CITATION.cff` are all outside that set. The script filters by the admission rules, validates every constraint fail-closed, emits to a separate directory, and writes a `package-manifest.json` carrying each file's SHA-256. Single-step, idempotent, deterministic, agent-call-free.
- `scripts/install-skill.sh` (`npm run install-skill`): installs this repo into a client's skill discovery directory. **This fills a real gap**: the SkillHub CLI's default install path is not scanned by any client (it lands in `/private/tmp/skills/`), and the CLI does not write the `<skill>` block into `AGENTS.md` (both `agents/skills` and `AGENTS.md` occur zero times in its source — protocol §8.4 and §8.5 are unimplemented). The script probes the four-level priority from §8.4 (or takes `--dir`), installs, fail-closed checks that `SKILL.md` exists, and prints the bootstrap and index steps. Single-step, idempotent, deterministic, agent-call-free.

### Fixed
- **Upstream contract audit: official skills are now fetched at the locked commit.** Upstream retired `skills/faceless-explainer/` and `skills/embedded-captions/` on 2026-10-21 (PR #5651, a breaking change), which turned this repo's CI red (`Unknown skill(s): faceless-explainer`). Findings and evidence are in `docs/architecture/hf-contract-audit-2026-10-21.md`.
  - `scripts/bootstrap.sh` no longer uses `hyperframes skills update` — that command hardcodes "latest" as upstream main's **live HEAD**, so it cannot be pinned to the commit this repo declares, and it "removes any no longer published" skills. It now fetches the official `skills/` tree at the pinned SHA into `vendor/skills/` via git: an outer loop over transports (HTTPS / SSH) and an inner loop over ref forms (by SHA / by tag), trying all four combinations, and every successful fetch is immediately verified with `git rev-parse FETCH_HEAD` to confirm it is the pinned commit; `--filter=blob:none` makes the fetch take only commit and trees, pulling blobs on demand at checkout, so the transfer excludes the whole-repository content this repo does not need. It then fail-closed checks the 10 official artifacts this repo actually references; a missing one is an error, never a silent skip.
  - A seemingly viable alternative was ruled out by measurement: `npx skills add owner/repo@<sha>` honours the sha only during **discovery** (it reports "Found 13 skills"), but what it installs is byte-for-byte main HEAD — it does not actually pin.
  - The locked version is symlinked into each agent's discovery directory (`~/.agents/skills`, `~/.claude/skills`, `~/.config/opencode/skills`), so the contract an agent reads matches the version this repo's rules cite.
  - **bootstrap is now idempotent**: when vendor is already pinned to the same commit, the fetch is skipped (measured: a repeat run went from 17 s to 1.0 s); discovery-directory replacement is always an in-place `ln -sfn` rather than "delete then recreate" — replacing a symlink is O(1), whereas deletion cost scales with directory content (in environments with a recoverable-deletion shim, per-item `rm -rf` was measured in the minutes); only when the target really is a directory is it moved to a staging area and cleared once at the end.
- **Corrected two stale official contract paths**: the rules and architecture docs placed brief-contract / review-loop / storyboard-format / subagent-dispatch / frame-worker-core under `skills/hyperframes/references/`, while at the locked commit they live in `skills/hyperframes-core/references/`. The error predates this upstream change — bootstrap had always pulled live main, and those files had long since disappeared from main. The `skills/hyperframes/references/pitch-round.md` path cited by `scripts/gate.mjs` was already correct and needed no change.
- **Corrected the `sprintf-js` residual-alert wording**: its advisory (GHSA-hp3w-g68c-fv3c) was **withdrawn** on 2026-10-22 (non-empty `withdrawn_at`) and is no longer a live vulnerability. The "[0.2.0]" entry stating it "stays open until a patch ships" was accurate as of its date, so history is not rewritten; the correction is recorded here.
- `hono` moved from 4.13.7 to 4.13.13 (transitive dependency, inside the existing `^4.0.0` range; the `hyperframes` pin is untouched), fixing GHSA-5r4p-p66f-jhc7 — that advisory declares affected range `>=4.12.4, <4.13.11` with 4.13.11 as the fix, and the previously installed 4.13.7 fell inside it. Dependabot could not fix it automatically (the `first_patched_version` it read was empty), so the bump was made by hand within the existing semver range.
- `.github/ISSUE_TEMPLATE/question.md` linked to `README.md` relatively, which resolved to a non-existent file from that directory — corrected to `../../README.md`.
- **Official skill resolution is consolidated onto a single source of truth.** `scripts/captions-zh.mjs` and `scripts/inject-audio-meta.mjs` previously fell back to `~/.claude/skills`, `~/.agents/skills` and `~/.config/opencode/skills` when `vendor/skills/` was absent — and the skill of the same name in those directories may come from any version (the upstream CLI's `skills update` pulls main's live HEAD, `npx skills add` measurably does not actually pin a commit, or a hand install). The consequence: a gate could validate a *different* official artifact and still report success. Measured on a clean clone (no `vendor/`): all 53 cases passed with 0 skipped — it was validating the version in the local discovery directory, not the pinned commit. A new `scripts/lib/official-skills.mjs` now consolidates the three duplicated lookups and accepts `vendor/skills/` only; with no vendor, the caption case **skips explicitly**. Verified: 52 pass / 1 skip on a clean clone, and unchanged when a deliberately throwing "upstream main HEAD" version is planted in a faked HOME.
- `scripts/doctor.sh` claimed to check skills in its header but had no such check — one is now added: it verifies the official skills at the locked commit are present under `vendor/skills/`, and that the four runtime files the production main chain actually imports (`captions.mjs` / `audio.mjs` / `lib/tokens.mjs` / `lib/dimensions.mjs`) are all there. A health script whose stated scope differs from its implementation is itself a real defect.
- The packaging allowlist now follows the **measured** admission rules. Protocol §8.3 lists `.png` / `.jpg` / `.svg`, but the live server rejects `.jpg` ("不允许的文件类型: assets/wechat-qr.jpg") — the documentation and the deployed service disagree, so the measurement wins.
- `scripts/build-skill-package.mjs` now excludes `vendor/`. That directory is the upstream artifact tree bootstrap fetches at the locked commit (it is in `.gitignore`) and is not distributed with this repo; without the exclusion, packaging swept it in as well (measured: 805 files, far past the platform §8.3 limit of 100, so the build was rejected).
- The documentation-link gate now excludes `vendor/`. Its 326 markdown files are maintained upstream, and whether their internal relative links resolve must not turn this repo's gate red — a gate may only assert on content this repo is responsible for. Verified by injecting a markdown file with a dead link into `vendor/`: all five documentation gates stayed green.
- Version skew: the published version had already advanced to `0.2.1` through the review flow while the local tree was still at `0.2.0`, which would have failed the next publish with a 409. The project version (`package.json` / `package-lock.json` / `CITATION.cff` / `SKILL.md`) now moves to `0.2.2`.

### Documentation
- Added `SKILL.md`: the repo's SkillHub distribution wrapper. It routes only and carries no normative requirements — those remain uniquely owned by `AGENTS.md` and `docs/rules/`. `AGENTS.md` gained a reciprocal note stating that `AGENTS.md` and `docs/rules/` win on any conflict.
- `SKILL.md` frontmatter gained the `name` field (required by protocol §8.2, and mapped to `skill.slug` on first publish, after which it cannot change); the `LICENSE` link now points at an absolute GitHub URL, with a note that the file is not distributed in the package.
- **`SKILL.md`'s `description` is now a trigger condition.** Protocol §8.2 maps `description` to `skill.summary` — the text the platform displays and uses for routing. It previously described what the skill *is*; matching in search was poor, so it now states *when to use it*.
- **`SKILL.md` gained three measured facts**: "how a new agent loads it" (discovery directory precedence; the CLI writes no `AGENTS.md` index block), "how to start production" (the full parameter forms of `new-video.mjs init` / `segment`), and a note on directory conventions (`docs/` plays the protocol's `references/` role, `tools/` plays `assets/`; both are optional in the protocol).
- Both READMEs gained an "Install as a SkillHub skill" section with the platform and local install commands, the discovery directory precedence, and three caveats (the directory must be given explicitly, the install still needs bootstrapping, it won't enter the index on its own).
- The wording in `CONTRIBUTING.md` / `CONTRIBUTING.en.md` and `.github/dependabot.yml` — "official skill content changes together with `skills update`" — is corrected to "changes with upstream commits": the retrieval path is now a fetch at the pinned commit, and `skills update` is no longer this repo's retrieval path.
- The precedence statement in `AGENTS.md` / `SKILL.md` / both READMEs cited `$HYPERFRAMES_REPO` as the ground truth for official contracts — a variable with no counterpart in this repo (the upstream repository is no longer checked out wholesale; only the `skills/` subtree is fetched). It now reads "the official text at the locked commit under `vendor/skills/`".

## [0.2.0] — 2026-10-08

Project positioning unified as a harness engineering project, with the true coverage of enforcement disclosed by tier; plus two new machine gates.

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
- **Corrected the project's positioning**: it was previously described as a "management layer" that "only fills management gaps official does not have", which inverts cause and effect. The real driver is that **HyperFrames can run but cannot police itself** — rules and official capabilities are "nominally in use" but never actually executed. The positioning is restated as **the harness that reins HyperFrames in**, with the three duties re-characterized as "protect the process (enforcement) / enforce capabilities (enforcement) / fill the gaps (fill-in)", and "anti-duplication is a boundary, not the purpose".
- **README restructured into six sections** (both languages): what it is in one line / why it's needed / what this is and what it is not / how it works / why you can trust it / usage and governance. The "why you can trust it" section states only verifiable facts and publishes the true coverage of the three enforcement tiers — only 3 of the 12 official capabilities have machine gates.
- Added a **non-goals** section: "does not rebuild official capabilities", "scripts are agent-call-free", and "does not track unreleased versions" are promoted from a corner, because they are part of what this is.
- **Aligned with the standard-readme spec**: the short description is now 112 characters and matches the GitHub repository description; a table of contents was added (the README exceeds the 100-line threshold); License moved to the last section.
- **Corrected the GitHub repository description**: it was still the 292-character old positioning ("management layer… mandatory use of quality capabilities"), contradicting the rewritten docs.
- The Chinese README gained the problem-statement section it was missing (the English version already had one); the two structures now align.
- **Bilingual community and governance documents**: added English versions of `CONTRIBUTING` / `CHANGELOG` / `CODE_OF_CONDUCT` / `SECURITY` / `DISCLAIMER`, with a language switcher in both directions on every pair.
- **Fixed the README language switcher**: `README.md` previously read `**English** | [中文](#...)`, where "English" was bold but not a link, making the repository landing page look like it had no English version. Now `[English](README.en.md) | **中文**`.
- **Established a language policy**: community and governance documents are bilingual; `docs/rules/`, `AGENTS.md`, `docs/architecture/`, and `docs/plans/` stay Chinese-only single-source. They are normative contracts with a single owner, so an English twin would create two sources of truth for normative requirements, and this project's precedence order has no language dimension to adjudicate drift.

### Security
- Merged two Dependabot patch PRs: `sharp` 0.35.4→0.35.5 and `source-map-js` 1.2.1→1.2.2, turning both high-severity alerts to fixed. Both are transitive dependencies of `hyperframes@0.8.36`; the patches land inside the existing semver ranges, `package.json` is untouched, and the HyperFrames version pin is unchanged.
- **Residual alert (not resolvable from this repo)**: `sprintf-js` (medium, GHSA-hp3w-g68c-fv3c) arrives transitively via `roarr`. The installed 1.1.3 is the latest release on npm and upstream has no patched version, so this alert stays open until `sprintf-js` ships a fix. Recorded as-is, with no downgrade or suppression.
- Enabled GitHub secret scanning (including push protection) and dependabot security updates.
- Enabled private vulnerability reporting — the channel `SECURITY.md` points reporters to was previously disabled.

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

[Unreleased]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.2.0...v0.2.2
[0.2.0]: https://github.com/suonian/ZWhyperframes-Harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/suonian/ZWhyperframes-Harness/releases/tag/v0.1.0
