# Classification review and effectiveness — 4 November 2026

Verdict: accepted after corrections. No unresolved blocking findings in the final classifier diff. This was a same-agent review of a small local policy change, not an independent integration review. Existing integration review history remains in POSTBUILD-REVIEW.md.

## Findings corrected

- Calling `trim()` before interpreting indentation lost the first code line's indentation. The classifier now parses the original prompt and retains the trimmed form for conversational matching and length checks. Tests cover spaces, tabs, and leading blank lines.
- The inline-code regex could backtrack into a shorter delimiter run and pair unequal runs. Inline spans now pair exact-length backtick runs with precomputed closing positions. Unmatched delimiters remain request text. A backtick fence with backticks in its info string is treated as inline content, preserving instructions following a same-line triple-backtick span.
- Mixed tab/space indentation is now recognized. The README example also uses valid nested Markdown code delimiters.

Final verification: `npm test` exited 0, with 108 tests, 107 passed, zero failures, and one Windows symlink privilege skip. `git diff --check` passed. Raw evidence is local and ignored: `evidence/review-policy-2026-11-04.log` (67/67 focused tests), `evidence/review-acceptance-2026-11-04.log`, and `evidence/review-source-2026-11-04.json` (source hashes and exits). Earlier checkpoint evidence and failures are preserved. No full-gate failure occurred in this review.

## Token-effectiveness assessment

An offline comparison against the original commit `c634e2198f4d5c37192c8e2a93790471980e6c49` used 22 hand-selected regression prompts, supported efforts `low/medium/high/xhigh/max`, baseline `medium`, and previous effort `high`. Expected categories matched 14/22 before and 22/22 after. Eight prompts selected lower effort; fourteen were unchanged; none selected higher effort. This is a targeted regression sample, not an estimate of accuracy or savings on real traffic.

Examples of lower selections:

| Prompt | Before | After |
| --- | --- | --- |
| Explain the inline-code fields `plan` and `review` | max | medium |
| Explain a fenced snippet containing architecture, migration, and security comments | max | medium |
| Explain quoted architecture/migration/security text | max | medium |
| `debug debug debug` as plain request text | max | medium |
| A code-only indented architecture/migration/security line | max | medium |

The sample also retained social/trivial dips, continuation effort, ordinary work, planning, ideation, review, explicit deep requests, and debugging with code. Local reproduction and full rows: `evidence/routing-evaluation-2026-11-04.mjs` and `.json`. No model request was made and measured tokens saved is null.

The desktop hook only emits advice and does not alter effort, so it does not directly deliver model-token savings. Its advisory notice may itself add context. The runner applies real effort settings and sends the original prompt unchanged; masking code for classification does not shorten model input. Avoiding unnecessary raises can reduce reasoning-token use, but the amount depends on the model, task, history, output, and retries. A baseline already at `max` will not be lowered for ordinary work. Hard prompts can still raise effort above a lower baseline and increase token use.

[Official OpenAI reasoning documentation](https://developers.openai.com/api/docs/guides/reasoning), checked 4 November 2026, states that lower effort favors lower token use, while higher effort can improve quality. That supports the mechanism, not a measured savings claim for this repository. The existing synthetic-provider smoke sets token counters itself and cannot establish real savings.

To measure effectiveness, compare the same exact model and prompt corpus at a fixed baseline versus adaptive routing, using independent matched contexts and repeated, order-balanced trials. Record input, cached input as its subset, output and reasoning tokens when exposed, duration, quality/acceptance and repair attempts. Keep failures and repairs in totals. Judge usage per accepted result and report uncertainty; do not infer billing or monetary savings from subscription counters. Model, baseline, and maximum usage budget are still needed before running that experiment.
