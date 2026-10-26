# Adaptive Effort for OpenAI / Codex

Adapted from [HielG/claude-adaptive-effort](https://github.com/HielG/claude-adaptive-effort) at commit `58ee67ff718cf73ce43b55b4486b417f20315e20`, under its MIT license.

**Two different capabilities, labeled honestly:**

- The local Codex plugin classifies prompts and shows an **advisory** recommendation. It cannot change the effort of an already-open desktop chat. No API requests, prompt storage, or settings changes happen in the hook.
- The companion `codex-adaptive` runner applies **real** `model_reasoning_effort` overrides when starting or resuming its own Codex thread. It keeps the model and baseline you chose and records observed per-turn usage.

Creating this package does not install it, trust its hook, publish it, or change any existing chat. It is a local desktop/CLI plugin, not a public directory release.

Source code: [HielG/openai-adaptive-effort](https://github.com/HielG/openai-adaptive-effort). This public repository distributes the local plugin and runner; it is separate from the public plugin directory.

## Get the source

```powershell
git clone https://github.com/HielG/openai-adaptive-effort.git
cd openai-adaptive-effort
npm test
```

No dependency installation is required. Use the installation steps below to register the advisory plugin. The desktop hook does not provide a persistent indicator below the chat; its messages are advisory notices.

## Routing

| Prompt | Choice |
| --- | --- |
| Whole-turn greetings/thanks | Lower supported effort, never above your baseline |
| Short signal-free requests | Lower supported effort |
| Yes, proceed, approved | Previous successful runner effort |
| Ordinary implementation/explanation | Your saved baseline |
| Planning, ideation, review, complex work | Higher supported effort, capped at `max` unless the baseline is already higher |
| `--effort LEVEL` | Your explicit one-turn choice, if supported |

The model catalog is queried at runtime; there is no hard-coded current model list. Unsupported/manual efforts and unknown models are rejected rather than silently substituted. Automatic routing does not enter `ultra`, which may change delegation behavior. Models/efforts available to your account can differ from the installed CLI's capability catalog. Heuristics can misclassify; use the manual override for consequential work or frozen contracts.

## Requirements

Node.js 20+ and the official Codex CLI. No npm dependencies. The runner uses the CLI's existing login and normal environment; it does not read, copy, or store credentials. A catalog listing is not a successful login/model inference test. This build was probed with CLI 0.147.0 using an isolated test home.

## Use the runner

From this directory:

```powershell
node bin/adaptive-effort.mjs models
'Plan a safe database migration' | node bin/adaptive-effort.mjs plan --model YOUR_CATALOG_MODEL --baseline high
'Plan a safe database migration' | node bin/adaptive-effort.mjs run --model YOUR_CATALOG_MODEL --baseline high
'Proceed' | node bin/adaptive-effort.mjs run
'Explain the result' | node bin/adaptive-effort.mjs run --effort high
node bin/adaptive-effort.mjs report
```

Use `--prompt-file prompt.txt` for exact multiline Unicode text, especially in Windows PowerShell. `--workspace DIR` selects the working directory; `--state .adaptive-effort/another.json` selects a separate runner session. State must remain inside that workspace. New sessions require both model and baseline. Existing sessions preserve them; use a new state file to intentionally change either. `plan`/`run --dry-run` query capabilities and show the chosen arguments without inference or a session-state update.

`--codex` accepts a native Codex executable or its npm `bin/codex.js`, including paths with spaces. Commands use literal argv and prompts go through stdin. No shell interpolation or dangerous bypass flags are used. The runner enforces a read-only filesystem sandbox and denies permission escalation on both new and resumed turns. It is intended for analysis; it does not grant write/deployment authority. Existing Codex policies and hook trust remain in force. No arbitrary CLI config passthrough is provided.

`--timeout-ms` bounds a turn (default five minutes). A failed, timed-out, contradictory, or incomplete run is marked uncertain and will not be retried automatically. Its captured thread ID is retained. Inspect the thread/effects before `recover --acknowledge-uncertain`; this releases an uncertain session for a *new* follow-up without resending the old prompt. If a lock owner is still alive or no thread ID was captured, recovery refuses. Do not remove a live lock. Recovery cannot reverse effects or prove that an interrupted model turn finished.

Recovery is itself serialized with a `.recovery.lock` guard. A crashed recovery may leave that guard: inspect its PID and verify all session/recovery owners stopped before removing it manually. It is never removed automatically. The runner attempts to stop its process tree on timeout and closes inherited pipes to keep the wait bounded. If a launcher already exited, a detached descendant may require manual inspection before recovery.

## Install the native advisory plugin

The package includes a repo marketplace at `.agents/plugins/marketplace.json`, portable root manifest and a `.codex-plugin/plugin.json` compatibility manifest. Open this project in a supported local Codex client, find **Hiel OpenAI Tools**, then install **Adaptive Effort for OpenAI**. Follow the client's hook review/trust flow; restart/reload as the client requires. The included skill is `adaptive-effort`.

To register an extracted package explicitly, run `codex plugin marketplace add /absolute/path/to/openai-adaptive-effort`. Inspect it with `codex plugin list --available --marketplace hiel-openai-tools --json`; uninstalled plugins are omitted without `--available`. Registration and installation are separate. Keep your CODEX_HOME outside the plugin source before installing; do not include test homes, credentials or session state in a plugin distribution.

The hook requires `node` on PATH. Disable/uninstall the plugin through the client to stop its advisories; delete/archive your own `.adaptive-effort` state to remove runner metadata after retaining anything you need. No global settings need restoring. Hook-bearing plugins currently have local distribution restrictions; see [plugin packaging](https://developers.openai.com/plugins/build/plugins).

## Usage, privacy, and cache accounting

Local state stores model, baseline, thread ID, category, effort, timestamps, outcome and available token counters. This package does not persist raw prompt text or full assistant/tool output. Codex itself keeps its normal session history under its own retention settings. Stderr/final messages are displayed to your terminal, not recorded by this package.

Codex CLI 0.147.0 emits cumulative session counters. The runner subtracts successive verified boundaries to obtain each turn's increment. Keep this thread exclusively runner-owned: activity outside the runner would contaminate those differences. Missing/uncertain boundaries stay unknown; after recovery the next successful result establishes a fresh boundary without attributing the unknown interval to that turn. Older state without a stored boundary is handled the same way.

`input_tokens` includes cached input; `cached_input_tokens` is its subset, not an additional input charge. Missing/inconsistent counts stay null. The report separates known and unknown observations. It does **not** call all output tokens “thinking,” estimate billing from a ChatGPT subscription, or report the baseline counterfactual as measured savings.

Claude's cache-write surcharge, fixed output-price ratio, cache TTL, and cross-model priors are deliberately not copied. OpenAI's cache behavior/prices are different. A causal cache-loss or savings claim requires a separately designed matched experiment, current model prices, and account usage evidence. None is claimed by this build. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Configuration and verification

Pass `--policy FILE` to load explicit JSON overrides of the fields in `src/policy.mjs`. Invalid fields or efforts are rejected. No project file is silently loaded as execution configuration.

```powershell
npm test
node scripts/probe-codex.mjs /path/to/codex --isolated
node scripts/smoke-codex.mjs /path/to/codex
```

The probe uses a child-only isolated CODEX_HOME, copies no credentials and invokes no model. The smoke test uses the real installed Codex executable against a local synthetic Responses provider. It verifies new/resumed request effort, thread identity, usage shape and sandbox settings with no paid inference; it does not prove OpenAI service entitlement, real-model quality, or monetary savings. Historical acceptance and independent review are recorded in `docs/CONTRACT.md` and `docs/POSTBUILD-REVIEW.md`. Generated evidence, test homes, and session data are kept locally and excluded from Git; the historical documents' raw evidence paths refer to those local artifacts.

Official integration references checked 26 October 2026: [hook inputs/outputs](https://learn.chatgpt.com/docs/hooks), [CLI configuration and resume](https://learn.chatgpt.com/docs/developer-commands), [model capabilities](https://learn.chatgpt.com/docs/app-server), [reasoning effort](https://developers.openai.com/api/docs/guides/reasoning). Recheck these before expanding to a different runtime.

## License

[MIT](LICENSE), copyright (c) 2026 Hiel Gagarin. Adapted from the MIT-licensed project and exact source commit linked above; the original copyright and permission notice are retained.
