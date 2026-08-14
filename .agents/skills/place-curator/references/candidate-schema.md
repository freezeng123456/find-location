# Candidate submission schema

Submit one JSON object:

```json
{
  "title": "Short title for this query",
  "sourceUrl": "https://example.com/article",
  "candidates": [
    {
      "name": "Name shown to the user",
      "canonicalName": "Verified map entity name",
      "address": "Full mainland-China address",
      "latitude": 30.24361,
      "longitude": 120.16194,
      "type": "校园",
      "quote": "Exact quote copied from the source",
      "mentionConfidence": 99,
      "matchConfidence": 98,
      "note": "Brief ambiguity or verification note",
      "thumbnailUrl": ""
    }
  ],
  "diagnostics": {
    "summary": "Concise processing summary",
    "model": "codex",
    "warnings": []
  }
}
```

## Constraints

- `title`: 1–160 characters.
- `sourceUrl`: optional for text input.
- `candidates`: 1–100 entries.
- `name`, `canonicalName`: 1–120 characters.
- `address`: 1–240 characters.
- `latitude`: 3–54.
- `longitude`: 73–136.
- `type`: 1–40 characters.
- `quote`: exact source text, 1–800 characters.
- both confidence fields: integer 0–100.
- `note`: at most 300 characters; use an empty string when unnecessary.
- `thumbnailUrl`: an absolute, reusable image URL or an empty string.

The server computes the displayed confidence as the rounded geometric mean of
the mention and match scores. The permanent place does not copy that score.
