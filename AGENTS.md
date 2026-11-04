# AGENTS.md

## Working in this repo

- Run `npm run typecheck` before calling a change done. It is the only automated check; there are no tests or linter.
- Don't bump the version in `package.json`. The maintainer handles releases.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `lulabad/PenPal-AI`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
