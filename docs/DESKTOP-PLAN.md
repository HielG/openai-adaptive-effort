# Desktop runner — active contract

4 November 2026. Tier 2: a native Windows UI talks to the existing local runner over child-process JSON lines. Budget unset; no paid inference is needed for development or acceptance. Source starts at bf848ceb002dd43b2bf719fffaf246aeae8edcac.

## Bounded outcome / ADR 002

One-click Windows executable and Desktop shortcut; workspace picker; Terra/Sol/Astra family and exact catalog model selection; baseline and optional one-turn effort; readable chat; live effort/status badge; new chat, Stop, error handling. Existing runTurn owns model selection, locking, thread identity, accounting and read-only/never enforcement. No new credential storage, global settings edits, automatic model switching, native Codex chat modification, web server, or prompt persistence by this package. Chat text stays in UI memory; Codex retains its normal session history.

Chosen: WinForms compiled with the installed .NET Framework C# compiler, with a hidden Node child using stdin/stdout JSON lines. Alternative: browser UI plus loopback server would add origin/CSRF and service-lifetime boundaries; Electron would add a downloaded runtime and dependency/update burden. Native controls provide keyboard and accessibility behavior without additional packages. Node and installed Codex remain prerequisites.

Owned files: desktop/ UI and bridge, scripts/build-desktop.mjs, cancellation support in src/process.mjs and src/runner.mjs, tests for changed behavior, README/package script, and this plan. Generated builds, evidence, and local sessions stay ignored. No changes to plugin hooks or the 0.2.0 installed release are required for the standalone UI.

## Acceptance

1. Build an executable using installed Windows tools; double-click opens UI without a console. Install a user Desktop shortcut only after checks pass.
2. Discover models through the actual Codex catalog; keep exact IDs and supported effort sets. Unavailable Astra/Terra/Sol are visibly unavailable, never silently substituted.
3. Workspace, model and baseline freeze after the first send; New chat explicitly resets them. Unsupported selections and empty prompts cannot execute.
4. Send and resume produce readable Unicode responses and status events; badge reflects the exact effort supplied. One-turn manual choice resets to Auto after submission.
5. Only one request runs per UI session; duplicate sends, new-chat and catalog refresh are refused while running. No automatic request replay.
6. Stop, closing the window, or bridge stdin EOF cancel the owned active subprocess tree and preserve uncertain session state. Pre-aborted calls must not spawn. No detached background service remains.
7. Failed/timeout/cancelled runs are clearly uncertain and block further sends in that session pending inspection; UI allows explicit New chat without replaying text.
8. Bridge accepts only bounded typed JSON commands; no shell interpolation or arbitrary config passthrough. Raw stdout/stderr never becomes executable UI markup. Diagnostic errors stay bounded and prompts are not logged.
9. Native UI interactions and real subprocess bridge smoke use synthetic data, including all three family fixtures, unavailable families, workspace paths with spaces, Unicode, error and cancellation paths. Real installed catalog smoke makes no model call.
10. Focused tests, full regression and independent review pass, with exact source hashes, raw logs and exit status retained. Re-review affected corrections; preserve failure counts.

## Pre-build attacker pass

Conditional go. Highest risks: native stdout callbacks touching UI from background threads, closing leaving a running child, unsupported effort hangs, cancellation misreported as completion, duplicate sends, and treating unavailable models as selectable. Mitigate with marshalled UI callbacks, bounded protocol, cancellation signals and lifecycle tests, catalog validation, frozen session config, and no retries. Probe installed compiler/WinForms/JSON/process boundary before building; preserve synthetic integration tests before broad gates. Independent contract review is required before acceptance.

Current checkpoint: complete. Source accepted after independent correction/re-review; native chat/cancel/missing-node checks pass and full regression passes 130 tests with one Windows symlink privilege skip. The verified 0.3.0 bundle is installed under the user's Applications/Adaptive Effort directory, its Desktop shortcut has been read back, and the actual installed window/corrected layout and real catalog were inspected. See DESKTOP-REVIEW.md and local evidence/current-checkpoint.json for findings, identities and publication state. Next action: user opens Adaptive Effort, selects the workspace/model/baseline and sends in Auto mode. Full-gate failures: 0. Attributable tokens/credits and actual primary model/effort are unavailable. Prior ledgers remain in CLASSIFICATION-REVIEW.md and INDICATOR-CHECKPOINT.md.
