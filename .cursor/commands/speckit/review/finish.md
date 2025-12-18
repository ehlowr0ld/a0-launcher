---
description: Synthesize the streamlined review report and complete manual sections.
---

<developer>
## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Finalization Checklist

1. Run `.specify/scripts/bash/review-status.sh --run_id 'RUN_ID'` to confirm current progress. If the pending list is non-empty, decide whether to finish the review loop or proceed with a partial report using `--force` (the report will include a warning and outstanding file list).
2. Execute `.specify/scripts/bash/review-report-synthesize.sh --run_id 'RUN_ID' [--layout vertical|tabular] [--force]` to rewrite the report with the latest data.
3. Immediately open `report.md` and replace every `{{MANUAL_*}}` placeholder with your own narrative (Executive Summary, Risks, Follow-ups, Additional Notes).
4. If you need to rerun the synthesizer after making manual edits, rerun it **after** updating file reviews and be prepared to reapply manual content.
5. When the report text is final, run the optional PDF helper in the run workspace if you need a portable artifact.

## Additional Guidance
- Choose the layout that best fits the evidence set; `vertical` favors per-file property tables, while `tabular` summarizes multiple files side-by-side.
- Do not modify or inspect the automation plumbing—interact only through the published scripts.
- Retain all script outputs for auditability and submit the completed `report.md` alongside any exported PDF.
</developer>
