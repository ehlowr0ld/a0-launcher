description: Inspect diffs, batch record file reviews via JSON payloads, and monitor progress.
---

<developer>
## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Continuous Review Loop

1. Confirm `/speckit.review.init` completed and `review-spec-validate.sh` reported success. Reuse the same `RUN_ID` for every command.
2. Run `.specify/scripts/bash/review-status.sh --run_id 'RUN_ID' [--limit <n>]` to triage pending files and plan the next batch.
3. Inspect diffs before recording: `.specify/scripts/bash/review-file-inspect.sh --run_id 'RUN_ID' --path '<file1>' [--path '<file2>' ...]`.
4. Assemble a JSON payload that matches the **File Review Batch JSON Schema** below.
5. Record the batch with `.specify/scripts/bash/review-file-review.sh --run_id 'RUN_ID' --json '<payload>'` or supply `--file '<payload.json>'`.
6. Repeat the status → inspect → record cycle until every changed file is covered. Keep batches focused (roughly 3–5 related files) to stay precise.

## File Review Batch JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "File Review Batch Payload",
  "type": "object",
  "patternProperties": {
    "^.+$": {
      "type": "object",
      "required": ["file_description", "change_description", "findings"],
      "properties": {
        "file_description": {
          "type": "string",
          "minLength": 25
        },
        "change_description": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "string",
            "minLength": 50
          }
        },
        "findings": {
          "type": "array",
          "minItems": 0,
          "items": {
            "type": "object",
            "required": ["finding", "severity", "remediation"],
            "properties": {
              "finding": { "type": "string", "minLength": 25 },
              "severity": {
                "type": "string",
                "enum": ["Critical", "High", "Medium", "Low", "Note"]
              },
              "remediation": { "type": "string", "minLength": 25 }
            },
            "additionalProperties": false
          }
        },
        "notes": {
          "type": "string",
          "minLength": 0
        }
      },
      "additionalProperties": false
    }
  },
  "minProperties": 1,
  "additionalProperties": false
}
```

## Review Discipline
- Use `--file` when editing large payloads and keep every identifier deterministic across reruns.
- `findings` may be empty but must remain present; add `notes` only when additional commentary is essential.
- Re-running `review-file-review.sh` with the same file overwrites prior data—leverage this to refine findings without duplication.
- Never skip diff inspection. `review-status.sh` flags missing inspections; clear those before finishing.
- Once the pending list reaches zero, transition directly to `/speckit.review.finish` while preserving the original `RUN_ID`.
</developer>
