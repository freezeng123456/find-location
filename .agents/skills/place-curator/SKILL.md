---
name: place-curator
description: Process pending 迹点 queries from links or text, identify semantically relevant China-mainland POI candidates, verify map matches, and submit structured candidates. Use when the user asks Codex to 整理地点、处理地点收件箱、分析链接中的地点、维护迹点, or invokes $place-curator. Do not use this skill to add candidates to a user's permanent map without their button confirmation.
---

# 迹点候选维护

This repository treats Codex as the semantic agent and deterministic code as
the persistence boundary. Your job ends after producing candidates. A
candidate becomes a permanent place only when the user clicks **加入** in the
website.

## Required workflow

1. From the repository root, run:

   ```bash
   npm run places -- pending
   ```

2. If more than one query is pending and the user did not identify one, process
   the oldest query. Run:

   ```bash
   npm run places -- show <query-id>
   ```

   This returns the source and all active rules. Apply rules in this order:
   system, user, current task, historical correction. Never silently create a
   new reusable user rule.

3. Read the source.
   - For text input, use it verbatim.
   - For a public link, retrieve the article and distinguish article body from
     navigation, advertisements, comments, and related links.
   - If the page is inaccessible, do not invent its contents. Tell the user to
     paste the text and leave the query pending.

4. Identify candidates semantically.
   - Include a POI only when the body meaningfully discusses or proposes it.
   - Do not extract every geographic token.
   - Regions may be context but are not POIs unless the text treats the region
     itself as a destination.
   - The current product scope is mainland China.
   - Preserve uncertain-but-plausible candidates with a clear note.
   - Ask a question only when ambiguity would materially change the map entity
     and cannot be represented safely as a low-confidence candidate.

5. Verify every map entity before submission.
   - Confirm the canonical name, address, longitude, and latitude.
   - Coordinates must fall within the mainland-China bounds enforced by the
     schema.
   - Use context such as city, district, nearby places, and full institutional
     names to resolve homonyms.
   - `mentionConfidence` answers “is the source really discussing this POI?”
   - `matchConfidence` answers “is this the correct real-world map entity?”
   - Scores are 0–100 evidence assessments, not decorative certainty. Lower
     the score when evidence is missing.

6. Create a JSON file following
   [references/candidate-schema.md](references/candidate-schema.md). Quotes
   must be copied exactly from the source. Do not include chain-of-thought.

7. Submit through the validator:

   ```bash
   npm run places -- submit <query-id> <json-file>
   ```

   Fix validation errors rather than bypassing the command. Remove the
   temporary JSON file after a successful submission.

8. Report the candidate count and any ambiguity. Remind the user that nothing
   has been added to the permanent map yet.

## Existing places and rule proposals

- Duplicate detection runs when the user clicks **加入**. The website must ask
  before merging; never pre-merge from this skill.
- A candidate may cite a place that already exists. Submit it normally so the
  source can be attached after user confirmation.
- If a repeated user correction suggests a reusable preference, propose it
  instead of applying it silently:

  ```bash
  npm run places -- propose-rule <user-email> "<concise rule>"
  ```

  Proposed rules remain inactive until accepted in the website.

## Non-negotiable boundaries

- Never modify the SQLite database with ad-hoc SQL.
- Never mark a candidate as liked or assign a category.
- Never expose one user's source, rules, or places to another user.
- Never manufacture a quote, address, coordinate, or confidence justification.
- Never put confidence on the permanent `Place` record; confidence belongs to
  the historical candidate only.
