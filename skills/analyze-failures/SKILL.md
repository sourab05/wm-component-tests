---
name: analyze-failures
description: >-
  Analyze structured test report JSON to categorize failures, identify patterns,
  suggest fixes, and optionally create GitHub issues. Triggered automatically
  when the test pipeline detects failures.
---

# Analyze Failures

## Purpose

This skill reads the structured JSON test report and provides actionable analysis: failure categorization, root cause patterns, and fix suggestions. It minimizes human effort in triaging test results.

## Input Parameters

| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| WIDGET_NAME | string | Yes | `Button` |
| REPORT_PATH | string | No | `reports/button-report.json` (defaults to `reports/{widget}-report.json`) |

## Steps

### Step 1: Load Report

Read `reports/{widget_lowercase}-report.json`. The report has this structure:

```json
{
  "widget": "Button",
  "timestamp": "...",
  "totalCases": 85,
  "passed": 80,
  "failed": 5,
  "results": [
    {
      "id": "TC01",
      "testCase": "Set a plain text caption",
      "section": "Properties > Caption",
      "canvasResult": "pass",
      "previewResult": "fail",
      "previewError": "Expected 'Submit' but got ''",
      "durationMs": 1200
    }
  ]
}
```

### Step 2: Filter Failed Cases

Extract only cases where `canvasResult === "fail"` or `previewResult === "fail"`.

### Step 3: Categorize Failures

For each failure, classify into one of these categories:

| Category | Indicator | Likely Cause |
|----------|-----------|--------------|
| **Selector broken** | "not found", "no element", timeout on locator | Studio UI changed, XPath no longer matches |
| **Timing issue** | "timeout", intermittent pass/fail | Need longer wait, animation not settled |
| **Value mismatch** | "Expected X but got Y" | Actual Studio bug or assertion expectation wrong |
| **Preview-only fail** | Canvas passes, preview fails | RN rendering difference, data-testid missing |
| **Canvas-only fail** | Canvas fails, preview not tested | Property setter not working, wrong panel XPath |
| **Environment flake** | "network", "connection", "ECONNREFUSED" | Studio down, network issue, retry |

### Step 4: Cluster by Pattern

Group failures by:
1. **By section**: "All Layout tests failed" → panel XPath for Layout section changed
2. **By strategy**: "All text-content assertions failed" → widget text element XPath changed
3. **By context**: "All preview assertions failed" → preview build or iframe issue

### Step 5: Generate Fix Suggestions

For each cluster:
- **Selector broken**: "Update XPath in widget-configs/{widget}.config.json, section: {section}"
- **Timing issue**: "Add waitForTimeout(1000) after property set in property-setter.ts"
- **Value mismatch**: "Verify expected value in test-cases/{widget}-test-cases.json, case {id}"
- **Preview-only**: "Check if data-testid exists in preview DOM; re-run discover-widget-selectors"
- **Environment**: "Retry the pipeline; check Studio is accessible"

### Step 6: Output Summary

Print a structured summary:

```
=== Failure Analysis: Button ===
Total: 85 | Passed: 80 | Failed: 5

CLUSTER 1: Selector broken (3 failures)
  Section: Properties > Layout
  Cases: TC26, TC27, TC28
  Fix: Update Layout section XPaths in button.config.json

CLUSTER 2: Preview-only fail (2 failures)
  Section: Properties > Caption
  Cases: TC01, TC03
  Fix: Re-run discover-widget-selectors to refresh preview XPaths
```

## Output

- Printed analysis summary to console
- (Future) Auto-create GitHub issues per failure cluster
