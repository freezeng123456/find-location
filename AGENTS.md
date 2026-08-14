# Repository agent guidance

`迹点` is a skill-first place memory. Keep semantic decisions in the Codex
skill and enforce identity, validation, state transitions, and audit history in
deterministic application code.

When processing user links or text for place candidates, follow the
`place-curator` skill in `.agents/skills/place-curator/SKILL.md`.

Invariant rules:

- A query candidate is not a permanent place.
- Only the authenticated user's explicit **加入** action creates or merges a
  place.
- Confidence belongs to query history, never to a permanent place.
- All reads and writes are scoped to one user.
- Merges require confirmation; deletion is soft and auditable.
- Agent-proposed reusable rules remain inactive until user acceptance.
- Update the schema, CLI validator, Skill reference, and tests together when
  candidate fields change.
