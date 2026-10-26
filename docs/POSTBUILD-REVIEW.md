# Post-build independent review — 26 October 2026

Final verdict: **GO for the bounded local artifact and handoff**. The correction review had been conditional on the final full gate, which now passed as recorded below. The installed Codex 0.147.0 synthetic-provider smoke demonstrates three real CLI requests with `reasoning.effort` `low`, `high`, then `medium`, one resumed thread, read-only sandbox and approval policy `never`. These are wire and runtime checks, not paid inference or account entitlement. The latest staged marketplace check discovers `openai-adaptive-effort@hiel-openai-tools` with `plugin list --available --json`; it did not install or trust the plugin. The advisory hook and companion runner are accurately distinguished in the README and manifests.

## Blocking findings and corrections verified

1. **Crash recovery and accounting — corrected.** Earlier `recoverState` changed `running` to `idle` without moving `pendingAttempt` into history or clearing `cumulativeUsage`; a later turn could lose the interrupted attempt and inherit its tokens. The revised `src/state.mjs` appends the pending attempt once as uncertain, clears it, and resets the cumulative boundary. The hard-crash fixture and focused runner gate pass.
2. **Stale-lock recovery exclusivity — corrected.** Earlier two recoverers could unlink each other's replacement session lock. Recovery now acquires a separate exclusive `.recovery.lock` before inspecting/removing a stale session lock; it never silently removes a stale recovery guard. The concurrent recovery test passes. A crashed guard requires the documented manual inspection and cleanup.
3. **Timeout and inherited streams — corrected with a platform limit.** `executeTurn` now closes/destroys its streams on interruption and awaits direct child `exit`, which bounds the runner's wait even if a descendant keeps a pipe open. The revised descendant fixture passes on this Windows host, where the inherited pipe closed at launcher exit; the retained-pipe branch is supported by the code path but was not reproduced by this OS fixture. The README states that an already-orphaned descendant may need manual inspection before recovery.

## Follow-up checks

- `recover --acknowledge-uncertain` cannot prove that an orphan Codex child has stopped. The README correctly tells the user to inspect thread/effects and does not promise automatic replay. Keep that limitation explicit after cleanup changes.
- `bin/adaptive-effort.mjs` now reads stdin and prompt files as a stream with a 1 MiB byte limit. `focused-package-08.log` tests a rejected oversized CLI input.
- The classifier is heuristic. Manual effort and the frozen baseline remain explicit, and catalog membership is correctly described as capability evidence rather than entitlement.

## Evidence reviewed

- `evidence/smoke-cli-V1D9tP.json`: `passed:true`, three requests, same thread ID, per-turn usage increments of cumulative Codex counters, read-only/never contexts.
- `evidence/verify-plugin-Ug26q5.json`: marketplace registration and `plugin list --available --json` both exit 0; one available plugin, none installed.
- `evidence/focused-transport-04.log`: 13 transport tests passed, including timeout and malformed JSONL; this does not yet cover descendants inheriting stdout.
- `evidence/focused-tests-03.log`: interrupted during the earlier timeout defect; it is not a completed full-gate result.
- `evidence/focused-runner-05.log`: 22 passed, one OS privilege skip, including hard-crash history and usage-boundary recovery.
- `evidence/focused-recovery-06.log`: concurrency recovery passed; an overly strict descendant fixture assertion failed although the call returned in 220 ms. This is a superseded focused check, not a successful gate.
- `evidence/focused-transport-07.log`: 14 passed, including bounded EOF-or-timeout behavior with a spawned descendant.
- `evidence/focused-package-08.log`: three passed for manifest parity, actual hook process behavior, and oversized CLI input.
- `evidence/skill-validation.log`: skill validator passed.
- Original MIT license at [source commit](https://github.com/HielG/claude-adaptive-effort/blob/58ee67ff718cf73ce43b55b4486b417f20315e20/LICENSE) carries the same 2026 Hiel Gagarin notice as this package's `LICENSE`.

Correction review snapshot SHA-256: `src/state.mjs` `22CE8C39FB20288754039C54408B171E0929D7B5C76AE45CFABD00C24FAFCE1C`; `src/process.mjs` `01084839DCF69CB543D00D8B9463BFCA1187FA923DF9A4838523D40108463AD3`; `src/runner.mjs` `E7206A2FBC9B577DBB4D8A08488AC02FA133BECE8F0FCAE247710FD4DD28122E`; `bin/adaptive-effort.mjs` `52D7117E81CE755D9C5757AC8014A8F1370300ACC8D523C75A66E36DD1B63C7E`. Actual model/effort of this reviewer cannot be verified from available agent metadata.

## Final acceptance judgment

**GO for the bounded local artifact and handoff.** The lead reports `npm test` exit 0, and `evidence/acceptance-tests-01.log` records 72 tests: 71 passed, zero failed, one skipped because this Windows account cannot create the symlink fixture. `evidence/acceptance-smoke-01.log` reports `passed:true`; its linked `evidence/smoke-cli-FKSCMU.json` records three completed installed-CLI localhost turns on one thread, effective efforts `low`, `high`, `medium`, and observed per-turn input increments `100`, `200`, `300`. The earlier staged `evidence/verify-plugin-Ug26q5.json` and skill validation remain applicable because the relevant manifests, verifier, and skill did not change. This accepts the contract's synthetic transport, lifecycle, classification, packaging, and accounting checks. Live OpenAI inference, account entitlement, savings, desktop installation, and hook trust remain outside the proven scope.

Final source identity (SHA-256, 26 October 2026; exact files reviewed, excluding generated evidence and local smoke homes):

```text
src/policy.mjs                     F2923E2632A5613585A96BB90E8185A76CF940FC6779BAA76B8E6038AF540ECA
src/state.mjs                      22CE8C39FB20288754039C54408B171E0929D7B5C76AE45CFABD00C24FAFCE1C
src/process.mjs                    01084839DCF69CB543D00D8B9463BFCA1187FA923DF9A4838523D40108463AD3
src/runner.mjs                     E7206A2FBC9B577DBB4D8A08488AC02FA133BECE8F0FCAE247710FD4DD28122E
bin/adaptive-effort.mjs            52D7117E81CE755D9C5757AC8014A8F1370300ACC8D523C75A66E36DD1B63C7E
hooks/advise.mjs                   F40C8B7545A0DC23411337255FB77AF1D72CD42C20518D52ABDA58883BB66A60
hooks/hooks.json                   8B80851D1EDF0DFE158E8FEBDE0C861DC5E90068AA647DBE4450906822B3A4B6
skills/adaptive-effort/SKILL.md    CBA96FC8954325265279ED203BC4BE99FA6916305A53EA077D7292AA65898C1A
plugin.json                        D61A500A714D6D484378A3541FA3190DCFDB3E534763C086308AB0D65C3E1E44
.codex-plugin/plugin.json          E0E5C29AFB4CB0CFD4C1A831E0025BF08D56D628C5B60ECC4B51484678C95013
.agents/plugins/marketplace.json   4DB6A0FB8640369EF7EE71A63CF7C460F97F702D7AAC47E31C78319DC2F15F99
package.json                       FADF0A5C9274AFE490B0624D6C6D222BBCFA0F40CE095AF1AFCAAF437771E7A7
scripts/probe-codex.mjs            BA0C45BBD5E45B4C79C5DC9FE0AD84925F388ACE785513C6355B68774A9A6231
scripts/smoke-codex.mjs            EC4CD867BC5F5C5EEE7428DD272D297C0FB96BCD2F6B8DA8BB4FFD960A4B0451
scripts/verify-plugin.mjs          6E0EA8B05CF91E92DDE7CEFD7DDFF9A30B95D97ABD90F50C93D261A0F90A847A
tests/policy.test.mjs              9949581C48C72EBF0542BFA10FACDFC0E2F3F82D81FC8B404CB57C97D3745167
tests/runner.test.mjs              B444ADFCC131C38B29B290A703D063E9B545E14A869A0E49E5D7899F4D18943A
tests/transport.test.mjs           F72796DF758A5C0323DE202B14F79F566E3EB241C0C6DB89D01EF2B3F6C89447
tests/package.test.mjs             79D255562E4DA5DCFD2736C92484BE72FB225EC9CE1FF396BDC99562C4C98FF8
tests/fixtures/fake-codex.mjs     A185172BBEBDEE1205340F75EDFE56869EC0A6B85EA5AFCF2D94FAE1798A6D02
LICENSE                            F878CB3B749665CBA1437B2A57D30695EDCE100465BA46F118B440C11B0678EB
README.md                          9F29D529AEBE011388F73581418C3519130BBC2BD9889F2BBE31C226F73DFB5D
```
