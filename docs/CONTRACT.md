# Adaptive Effort for OpenAI — bounded build

Started 26 October 2026. Tier 2: model-control integration, local process lifecycle and token accounting. User budget unset. No paid API requests required for verification. Only this project directory is owned; Facebook artifacts/configuration and the original GitHub repository remain unchanged.

## Outcome

Adapt HielG/claude-adaptive-effort at 58ee67ff718cf73ce43b55b4486b417f20315e20 into an MIT-licensed local OpenAI/Codex plugin plus a functioning per-turn runner. Preserve social/trivial/work/continuation/planning/ideation/review/complex routing, baseline semantics, explicit manual effort, and a usage report. Do not claim control or savings unavailable from the host.

## Architecture decision / ADR 001

Native Codex UserPromptSubmit hooks offer context/status, not a documented reasoning-effort override. App-server model/list exposes each model's actual effort capabilities. Codex exec and exec resume accept model_reasoning_effort configuration overrides.

Chosen: a no-dependency Node CLI that discovers capabilities with app-server, then executes an isolated/resumable Codex thread with a per-invocation override. A packaged native hook/skill provides advisory classification and reporting. It never changes this already-open desktop conversation.

Alternatives: a context-only plugin cannot truthfully promise actual routing; an API proxy adds credentials, transport and billing obligations; a full app-server chat client duplicates approval/tool interaction machinery. Global config edits and private desktop APIs are rejected because they race other chats and silently change user settings.

## Acceptance

1. Pure classifier and model-capability policy cover short replies, compound work, code, explicit effort and deep work; unknown capabilities fail safely.
2. Ordinary work returns to the configured baseline; continuations retain prior effort; deep work never lowers the baseline; manual effort takes precedence.
3. New and resumed turns use a documented real Codex setting, with literal prompt input through stdin and no shell interpolation. Runner changes neither model nor user/global config implicitly.
4. Capability discovery handles pagination, malformed/error responses, subprocess failures/timeouts, and cleanup. Never pass an unsupported effort.
5. State is local, atomically saved and locked against concurrent same-session runs. Preserve thread identity and history across failures; uncertain/partial execution never retries automatically. Wrong-workspace/model sessions are rejected.
6. Record actual per-turn usage with missing data null, separate cached input from total input, and distinguish estimates from observed counters. No Claude cache surcharge, hard-coded current model table, or fabricated monetary savings. Raw prompts and full agent output are not stored by this package.
7. Native hook protocol is valid, fail-open, bounded, non-executing, and explicitly advisory. Package/skill paths are valid. No automatic installation/trust bypass.
8. Behavioral tests, real installed CLI capability probe and a local synthetic Responses-provider smoke exercise actual new/resumed reasoning.effort requests without paid inference. Preserve source hashes, distinct raw logs, counts/exits, independent review and corrections.

## Before build: attacker pass

Conditional go. Highest risks: unsupported effort leading to a hung request; claiming hook control it cannot exert; shell injection on Windows; corrupt/concurrent session state; replaying a request after ambiguous failure; counting cumulative or missing usage incorrectly; exposing prompt text in logs. Resolve through catalog validation, explicit advisory labeling, shell:false argv/stdin transport, exclusive locks/atomic writes, uncertain-state stop, usage schema validation and metadata-only local records.

## Exclusions

No global installation, hook trust changes, current-chat effort changes, silent model switching, public release/PR, background automation, real API billing experiment or proven savings claim. Live OpenAI inference remains unverified unless separately authorized. Default runner sandbox is read-only; no approval/rules/hook bypass flags are generated.

## Evidence and checkpoint

Source SHA above; official references are in README.md. Graphify/Serena and OpenAI API-key setup tools were checked once and are not available. Installed CLI observed: codex-cli 0.147.0. Full-gate failures: 0. Independent prebuild review: conditional go (capabilities do not imply entitlement; freeze model/baseline; probe sandbox, terminal status, cumulative usage).

Focused tests 01: exit 1, 48/63 passed, command classifier defect plus sandbox temp rename restrictions. Tests 02: exit 0, 50/50 policy/runner cases after fixes. Tests 03: interrupted due denied taskkill cleanup; fixed direct-child fallback. Focused transport 04: exit 0, 13/13. Initial smoke QtBOEJ: loopback network blocked by sandbox; isolated elevated smoke OoQEBB identified cumulative CLI counts. Corrected boundary subtraction, smoke V1D9tP: exit 0, 3/3 actual new/resumed local provider calls with low/high/medium, exact thread and read-only/never settings. No paid inference. Raw distinct logs retained under evidence/.

Skill validation passed using PyYAML 6.0.3 installed only under evidence/local-smoke/validation-deps. Native marketplace discovery passed after using CLI's required `--available` flag for uninstalled entries (verify-plugin-Ug26q5.json). No user installation or hook trust changed.

Independent postbuild review found three blockers: crash history/accounting, stale-lock recovery race, inherited stream timeout. One consolidated correction/re-review round resolved them; details and exact hashes remain in POSTBUILD-REVIEW.md. Focused recovery06 preserved the earlier descendant-fixture expectation failure; transport07 passed the corrected bounded EOF-or-timeout check. Windows closed inherited pipes early on this host, so descendant-held EOF timeout is not directly observed here. Package08 passed actual hook, metadata and byte-limit checks.

Final gate: npm test exit 0, 72 cases / 71 passed / one Windows symlink privilege skip / zero failures (acceptance-tests-01.log). Final real CLI synthetic smoke exit 0, three low/high/medium requests on the same thread with exact accounting and read-only/never contexts (acceptance-smoke-01.log, smoke-cli-FKSCMU.json). Independent final judge: GO for bounded local artifact. Full gates: one completed, zero failed. This is not live OpenAI inference, desktop installation, hook trust, quality or savings evidence.

Assignment-policy trial record: primary actual model/effort unavailable from metadata and unchanged; reviewer requested gpt-6-sol/high, actual runtime identity unverifiable. First-pass acceptance: no. Independent correction rounds: one consolidated batch plus affected re-review. Measured artifact-work interval starts at CONTRACT creation 11:04:27 UTC on 26 October 2026 and reaches final acceptance at approximately 11:33 UTC (about 29 minutes; excludes earlier research). Attributable tokens/credits and total conversation elapsed unavailable; no new paid model inference was used in integration tests. Account-wide usage was not substituted for task accounting.

Current checkpoint: complete. Clean whitelist release `../releases/openai-adaptive-effort-0.1.0.zip` contains 53 files (77,217 bytes); SHA-256 `ad3deae265c00691eee1b5396f989447f8cc9c67a93034c1661b136ac7296423`. ZIP CRC and every packaged source hash verified (evidence/release.json). The clean extracted release was discovered by the installed CLI using its own root marketplace (evidence/release-discovery.json); no plugin was installed or trusted. The archive retains the pre-packaging contract snapshot and its own source manifest; this final checkpoint is a source-workspace handoff update. Raw failure/review history remains preserved. No required work remains. Any later installation should use the clean extracted release and the client's normal hook review flow. No ongoing goal or background task was created.
