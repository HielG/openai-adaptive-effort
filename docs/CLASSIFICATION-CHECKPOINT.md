# Classification improvement — 4 November 2026

Current checkpoint: classification changes reviewed and accepted for the user-requested commit and push. Review corrections, final acceptance, and the token-effectiveness assessment are in [CLASSIFICATION-REVIEW.md](CLASSIFICATION-REVIEW.md).

Outcome: classify the surrounding request rather than keywords in pasted Markdown code or block quotes, and count repeated identical complexity cues once. Preserve baseline/manual routing, supported-effort validation, and explicit debugging or deep requests. Owned files: `src/policy.mjs`, `tests/policy.test.mjs`, the routing explanation in `README.md`, and this checkpoint.

Acceptance: fenced/inline/indented code and block quotes do not supply intent keywords; code-only and quote-only messages retain baseline; closing/unclosed/mixed fences and CRLF are covered; distinct complexity thresholds remain configurable; explicit request cues, manual choices, and existing routing behavior pass regression tests.

Evidence: cloned `HielG/openai-adaptive-effort` main at `c634e21`. `evidence/baseline-2026-11-04.log`: exit 0, 72 tests, 71 passed, one Windows symlink privilege skip. `evidence/classification-focused-2026-11-04.log`: exit 1, 57/58 passed; the failed new fixture incorrectly expected two request cues plus code to remain ordinary work. Corrected that fixture to use a block quote, retaining the existing code-plus-complexity rule. `evidence/classification-acceptance-2026-11-04.log`: exit 0, 101 tests, 100 passed, one Windows symlink privilege skip. `git diff --check`: exit 0. Exact base revision, final source hashes, and check exits are in `evidence/classification-source-2026-11-04.json`. Full acceptance failures in this slice: zero.

Exclusions: no runner lifecycle, permissions, model settings, installation, live inference, publishing, or billing changes. No full Markdown parser or multilingual intent detector. Existing integration acceptance and independent review history remain in CONTRACT.md and POSTBUILD-REVIEW.md; this small classifier slice adds no integration. No independent worker was needed. Graphify/Serena discovery returned no available tools; source navigation used rg and direct reads. Actual model/effort and attributable token/credit accounting are unavailable.

Next action: commit and push the reviewed changes, then confirm the remote revision. Actual token savings remain unmeasured; a live matched comparison needs an explicit model, baseline, and usage budget. Historical failure and review ledgers remain unchanged.
