# Adaptive Effort for OpenAI / Codex

Adaptive Effort helps match Codex reasoning effort to the task. Simple messages receive a lighter recommendation, everyday work uses your chosen baseline, and planning or complex reviews receive a higher recommendation. It includes a desktop advisory plugin and a companion CLI runner for applying actual effort settings.

Adapted from [HielG/claude-adaptive-effort](https://github.com/HielG/claude-adaptive-effort) at commit `58ee67ff718cf73ce43b55b4486b417f20315e20`, under its MIT license.

## Choose how to use it

| Mode | What it does | When to choose it |
| --- | --- | --- |
| Codex desktop / interactive CLI plugin | Classifies each submitted prompt and emits an advisory notice. Your current chat's effort stays unchanged. | You want suggestions inside your existing Codex workflow. |
| Companion CLI runner | Selects a supported effort and passes a real `model_reasoning_effort` override to its own new or resumed Codex thread. | You want automatic per-turn effort selection for read-only analysis. |

The runner keeps the model and baseline you chose and records available usage counters. Its read-only sandbox prevents it from being a general file-editing agent. The desktop hook makes no API requests, stores no prompts, and changes no settings. Neither mode promises token or monetary savings.

This is a community project, not an official OpenAI product. The [public source repository](https://github.com/HielG/openai-adaptive-effort) distributes a local plugin and runner; it is separate from OpenAI's public plugin directory.

[Install for Codex](#install-for-openai-codex) · [How it works](#how-it-works) · [Use the runner](#use-the-runner) · [Troubleshooting](#troubleshooting)

## Requirements and source

- [Node.js](https://nodejs.org/) 20 or newer, with `node` on your PATH.
- [OpenAI Codex CLI](https://learn.chatgpt.com/docs/cli) and Git on your PATH.
- A supported local Codex client for the advisory plugin. The runner uses your existing Codex login and account access.

If you do not have the official CLI yet, install it and sign in:

```powershell
npm install -g @openai/codex
codex login
```

Clone this repository:

```powershell
git clone https://github.com/HielG/openai-adaptive-effort.git
cd openai-adaptive-effort
node --version
codex --version
```

This project has no npm dependencies and does not require `npm install`. Commands below use PowerShell; Git, npm, and Codex installation commands also work in other supported shells. CLI integration was tested with `codex-cli 0.147.0`; check your installed CLI's help if its commands differ. Keep `CODEX_HOME` outside this repository so credentials and test/session files do not enter a plugin distribution.

## How it works

### Advisory plugin

1. Codex invokes the trusted `UserPromptSubmit` hook when you submit a prompt.
2. A local Node.js script checks the prompt's wording, length, code blocks, and task cues.
3. The script returns an advisory notice, such as:

```text
Adaptive Effort advisory: social; consider a light supported effort. Current host effort is unchanged.
```

The hook fails open on malformed input and skips subagent or meta prompts. The client controls where its notice appears. There is no persistent live indicator below the desktop chat, and the recommendation does not change the current chat's actual effort.

### Companion runner

1. Query Codex's model catalog for the selected model's supported reasoning levels.
2. Classify the prompt and select a supported effort using your baseline, previous successful effort, and any manual override.
3. Start or resume the runner's own thread through `codex exec`, supplying `model_reasoning_effort` for that invocation.
4. Display the response and save local session metadata and available usage counters for reporting.

The model and baseline stay fixed for the session. Unknown models or unsupported effort values produce an error instead of silently selecting alternatives. You must deliberately invoke the runner; installing the advisory plugin does not route your desktop conversations through it.

### Routing policy

| Prompt | Choice |
| --- | --- |
| Whole-turn greetings/thanks | Lower supported effort, never above your baseline |
| Short signal-free requests | Lower supported effort |
| Yes, proceed, approved | Previous successful runner effort |
| Ordinary implementation/explanation | Your saved baseline |
| Planning, ideation, review, complex work | Higher supported effort, capped at `max` unless the baseline is already higher |
| `--effort LEVEL` | Your explicit one-turn choice, if supported |

The model catalog is queried at runtime; there is no hard-coded current model list. Unsupported/manual efforts and unknown models are rejected rather than silently substituted. Automatic routing does not enter `ultra`, which may change delegation behavior. Models/efforts available to your account can differ from the installed CLI's capability catalog. Heuristics can misclassify; use the manual override for consequential work or frozen contracts.

## Install for OpenAI Codex

### 1. Register the local marketplace

From the cloned repository directory in PowerShell:

```powershell
codex plugin marketplace add (Get-Location).Path
codex plugin list --available --marketplace hiel-openai-tools --json
```

On macOS/Linux shells, use `codex plugin marketplace add "$PWD"` for the first command. The listing should include `openai-adaptive-effort` from `hiel-openai-tools`. This registers the source; it does not install or trust the plugin.

### 2. Install the plugin

```powershell
codex plugin add openai-adaptive-effort@hiel-openai-tools
codex plugin list --marketplace hiel-openai-tools --json
```

Look for `installed: true` and `enabled: true`. Alternatively, start `codex`, open `/plugins`, select **Hiel OpenAI Tools**, and install **Adaptive Effort for OpenAI**.

For the desktop client, open the cloned folder as a project, open its plugin browser, and find **Hiel OpenAI Tools → Adaptive Effort for OpenAI**. Install or enable it if needed, then start a new chat. Desktop controls can differ by client version; use the CLI path above if the local marketplace is not shown.

### 3. Review and trust the hook

Start a fresh interactive Codex session and open the hook browser:

```text
codex
/hooks
```

Review the plugin's `UserPromptSubmit` hook, which invokes `node` and `hooks/advise.mjs`, and trust it if you accept its behavior. Use the desktop client's hook review controls when available. **Installation and enablement do not automatically trust hooks.** Changed hook definitions may require review again. See OpenAI's [plugin guide](https://learn.chatgpt.com/docs/plugins) and [hook trust instructions](https://learn.chatgpt.com/docs/hooks).

### 4. Check that it works

In a new chat, submit `Hello`, then `Review a complex concurrent database migration for security risks`. The classifier should recommend light effort for the first and higher effort for the second, when the trusted hook runs and the client surfaces its notice.

You can also check the classifier directly from the repository:

```powershell
'Hello' | node bin/adaptive-effort.mjs classify
'Review a complex concurrent database migration for security risks' | node bin/adaptive-effort.mjs classify
```

Expected categories: `social`, then `complex`. This local check makes no model request. It verifies classification, while automatic notices additionally depend on installation, enablement, hook trust, and client support.

## Use the runner

The runner works directly from the clone; installing the advisory plugin is optional. Run these commands from the repository directory.

First, inspect the model catalog:

```powershell
node bin/adaptive-effort.mjs models
```

Choose an exact model ID and a supported baseline from that output. Replace `YOUR_CATALOG_MODEL` below with your chosen ID and change `high` if that model requires another supported baseline. A catalog entry does not prove your account can execute that model.

Preview the chosen effort without invoking a model:

```powershell
'Plan a safe database migration' | node bin/adaptive-effort.mjs plan --model YOUR_CATALOG_MODEL --baseline high
```

To execute, start the runner's own session, then send follow-ups:

```powershell
'Plan a safe database migration' | node bin/adaptive-effort.mjs run --model YOUR_CATALOG_MODEL --baseline high
'Proceed' | node bin/adaptive-effort.mjs run
'Explain the result' | node bin/adaptive-effort.mjs run --effort high
node bin/adaptive-effort.mjs report
```

`run` invokes Codex and uses your normal account limits or API billing, depending on your Codex authentication. The runner does not read, copy, or store credentials. Its terminal status shows the actual effort it passes to Codex. `report` reads local usage metadata without making a model request.

Use `--prompt-file prompt.txt` for exact multiline Unicode text, especially in Windows PowerShell. `--workspace DIR` selects the working directory; `--state .adaptive-effort/another.json` selects a separate runner session. State must remain inside that workspace. New sessions require both model and baseline. Existing sessions preserve them; use a new state file to intentionally change either. `plan`/`run --dry-run` query capabilities and show the chosen arguments without inference or a session-state update.

`--codex` accepts a native Codex executable or its npm `bin/codex.js`, including paths with spaces. Commands use literal argv and prompts go through stdin. No shell interpolation or dangerous bypass flags are used. The runner enforces a read-only filesystem sandbox and denies permission escalation on both new and resumed turns. It is intended for analysis; it does not grant write/deployment authority. Existing Codex policies and hook trust remain in force. No arbitrary CLI config passthrough is provided.

`--timeout-ms` bounds a turn (default five minutes). A failed, timed-out, contradictory, or incomplete run is marked uncertain and will not be retried automatically. Its captured thread ID is retained. Inspect the thread/effects before `recover --acknowledge-uncertain`; this releases an uncertain session for a *new* follow-up without resending the old prompt. If a lock owner is still alive or no thread ID was captured, recovery refuses. Do not remove a live lock. Recovery cannot reverse effects or prove that an interrupted model turn finished.

Recovery is itself serialized with a `.recovery.lock` guard. A crashed recovery may leave that guard: inspect its PID and verify all session/recovery owners stopped before removing it manually. It is never removed automatically. The runner attempts to stop its process tree on timeout and closes inherited pipes to keep the wait bounded. If a launcher already exited, a detached descendant may require manual inspection before recovery.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node` or `codex` is not found | Install the requirements, reopen the terminal/client, and check PATH. |
| Marketplace is missing | Register the absolute clone path. Use `--available` to include uninstalled plugins in the listing. |
| Plugin is installed but no notice appears | Check enablement, review `/hooks`, confirm `node` is available to the client, and start a new chat. Direct classification alone does not prove automatic hook execution. |
| Desktop effort stays the same | This is expected in advisory mode. Invoke the companion runner for actual per-turn overrides in its own thread. |
| Unknown model or unsupported baseline | Run `models` and choose an exact ID and supported level. Account entitlement still depends on your Codex login. |
| No runner session exists | Complete a successful `run` in the same workspace and state path before using `report`. |
| Previous execution is uncertain | Inspect its thread and effects before explicit recovery; do not automatically repeat the original prompt. |

Disable or uninstall the plugin through the client to stop its advisories. Archive your own `.adaptive-effort` state after retaining anything you need. No global reasoning settings need restoring. Hook-bearing plugins have local distribution requirements; see [plugin packaging](https://developers.openai.com/plugins/build/plugins).

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

## Contributing

Open an issue or pull request with a reproduction and expected behavior. Run `npm test` before submitting code changes. Keep prompts, credentials, generated `evidence/`, and `.adaptive-effort/` session data out of commits.

## License

[MIT](LICENSE), copyright (c) 2026 Hiel Gagarin. Adapted from the MIT-licensed project and exact source commit linked above; the original copyright and permission notice are retained.
