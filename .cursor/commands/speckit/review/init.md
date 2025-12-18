description: Initialize streamlined SpecKit review workspace and import specification JSON payloads.
---

<developer>
## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Step-by-Step Workflow

1. Choose a deterministic `RUN_ID` (example: `review-20251108-main-001`) and reuse it for the entire run.
2. Execute `.specify/scripts/bash/review-init.sh --run_id 'RUN_ID' [--base '<sha>'] [--head '<sha>'] [--branch '<name>']`.
   - The script prepares the secure workspace automatically; no manual adjustments are required.
3. Read all specification artifacts within the feature directory (spec, plan, tasks, research, data model, quickstart, contracts).
4. Build a JSON payload that matches the **Spec Import JSON Schema** and capture every required mapping.
5. Import the payload with `review-import-spec.sh`, supplying either `--json '<payload>'` or `--file '<path>'`.
6. When additional identifiers are needed, construct a payload that follows the **Append Spec JSON Schema** and call `review-append-spec.sh`.
7. Run `review-spec-validate.sh --run_id 'RUN_ID'` to confirm the specification is complete before proceeding to `/speckit.review.record`.

## Spec Import JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Spec Import Payload",
  "type": "object",
  "required": [
    "name",
    "overview",
    "details",
    "phases",
    "user_stories",
    "acceptance_criteria",
    "feature_modules"
  ],
  "properties": {
    "name": { "type": "string", "minLength": 3 },
    "overview": { "type": "string", "minLength": 25 },
    "details": { "type": "string", "minLength": 25 },
    "phases": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "user_stories": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "acceptance_criteria": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "feature_modules": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    }
  },
  "additionalProperties": false
}
```

## Append Spec JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Append Spec Payload",
  "type": "object",
  "properties": {
    "phases": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "user_stories": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "acceptance_criteria": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    },
    "feature_modules": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": { "type": "string", "minLength": 25 }
    }
  },
  "additionalProperties": false
}
```

## Operational Notes
- Use `--file` when editing large payloads; keep identifiers deterministic.
- Re-importing the full specification resets validation; always rerun `review-spec-validate.sh` afterward.
- Append commands update only the sections provided; untouched sections remain intact.
</developer>
