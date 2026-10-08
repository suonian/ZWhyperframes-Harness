[中文](CONTRIBUTING.md) | **English**

# Contributing

Thanks for taking part. This project's core proposition is that it is a **management layer**: core capabilities come from official HyperFrames, and this repository only fills management gaps that official does not cover. Any contribution that strays outside that boundary will be rejected.

## Development environment

```bash
npm run bootstrap    # install locked dependencies + refresh official skills
npm run doctor       # environment check
source ./hf-env.sh   # production entry point
```

## Required before submitting

**Run `npm test` after modifying rules, scripts, or schemas.** The test suite runs fully offline and must not fail or hang because of network problems.

Also make sure:

- Scripts stay **single-step, idempotent, deterministic, and agent-call-free** — sub-agent dispatch happens only inside the main agent conversation
- Shell scripts pass `bash -n`; Python scripts pass `python3 -m py_compile`
- New gates are registered in `scripts/gate.mjs` and written into the mandatory quality-capability list in §3 of `docs/rules/production-workflow-rules.md`
- No new secret shapes are introduced: API keys come only from environment variables or the macOS Keychain, and **never enter the repository or the logs**

> The files under `docs/rules/` are currently maintained in **Chinese only**, and Chinese is authoritative for their normative requirements. See [Documentation index](#rule-documents) below.

## Design discipline (non-negotiable)

1. **fail-closed rather than best-effort.** Segment scripts, TTS artifacts, injection bindings, and MP4s are bound together with a SHA-256 chain; a frame's voiceover is released only when it is fully equal to the locked script after normalization.
2. **Evidence cannot be forged.** A missing historical binding can only be re-derived; **back-filling a hash after the fact to "green" a gate is forbidden**. A back-filled hash is a fabricated binding that was never verified.
3. **Offline is a capability floor.** The production main chain must not depend on the network. Connectivity probes must carry a hard timeout — `nc` and bash `/dev/tcp` hang themselves when packets are silently dropped.
4. **Do not reinvent the wheel.** You must not build your own composition, assembly, transitions, caption rendering, check, or rendering capabilities; gates are thin wrappers around official commands.
5. **Tests must be non-vacuous.** A new assertion must genuinely distinguish right from wrong — verify it: once the logic under test is removed, the test case must fail.

## Rule documents

> These four files under `docs/rules/` are maintained in **Chinese only**, and Chinese is authoritative. This is deliberate: they are normative contracts with a single owner, and an English twin would create two sources of truth for normative requirements with no machine rule to adjudicate drift.

The four files under `docs/rules/` are each a **single owner**, with no overlap:

| File | Responsibility |
| --- | --- |
| `production-workflow-rules.md` | Production flow, decision gates, quality-capability list |
| `visual-production-rulebook.md` | Visual quality floor |
| `captions-contract.md` | Caption contract (requirements must not change) |
| `segment-production-rules.md` | Locked-script freezing and segmentation |

Conflict adjudication order: **the user's current instruction > AGENTS.md > `docs/rules/` > the official HF contract**.

## Already-delivered products

Already-delivered videos are **no longer maintained and no longer supported**. Do not migrate or repair historical projects; historical-format artifacts inside them are a matter of record.

## Version pinning

HyperFrames is pinned to `0.8.36`. Upgrading is not a version-number change but a **contract audit** task: official skill content changes together with `skills update`, and the rules here quote it verbatim. Do a contract diff audit first, then verify the risk points separately, and only then change the pinned version.

## License

Submitting a contribution means you agree to license your changes under Apache-2.0. This project builds on HyperFrames (Apache-2.0, HeyGen, Inc.) and contains none of its source code; see [NOTICE](NOTICE).
