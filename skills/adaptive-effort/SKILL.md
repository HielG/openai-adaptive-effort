---
name: adaptive-effort
description: Inspect prompt-effort classification or the companion Codex runner's usage report, and help users configure adaptive per-turn reasoning. Use for Adaptive Effort setup, routing diagnostics, or usage reporting; not as a claim that desktop hooks can control the active chat's effort.
---

# Adaptive Effort for OpenAI

This plugin's prompt hook is advisory. It cannot rewrite the native effort of the current desktop turn. Do not claim it changed the model or reduced billed tokens. Do not edit global Codex settings to emulate per-turn control.

The companion CLI at `../../bin/adaptive-effort.mjs` applies real effort overrides to its own new/resumed Codex thread. Read the plugin-root README.md for usage and current compatibility before setup. Resolve paths relative to this skill, not a guessed installation location.

For classification, run `node <plugin-root>/bin/adaptive-effort.mjs classify` with the prompt supplied through stdin or `--prompt-file`. Treat the result as a heuristic; explicit user choices and frozen task contracts take precedence.

For a usage report, use `report --workspace <directory> --state <relative-state-file>` against the runner session the user actually selected. A report does not change settings or invoke a model. Missing usage and savings are unavailable, not zero.

Do not silently launch a separate agent/thread to handle an ordinary user prompt. Only use the runner when the user requests that execution path. New sessions need an explicitly chosen model and baseline; model catalog membership does not establish account entitlement. A manual `--effort` applies to one runner turn. Continuations retain its previous effort; ordinary work returns to its saved baseline.

If a run is uncertain, inspect the captured thread and possible effects before using explicit recovery. Never replay the original prompt automatically. Retain approval, sandbox, hook-trust, and workspace restrictions. Package installation and trusting hooks are separate from merely creating the plugin.
