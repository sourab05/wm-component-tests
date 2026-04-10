---
name: analyze-failures
description: >-
  Analyze structured test report JSON to categorize failures, identify patterns,
  suggest fixes, and optionally create GitHub issues. Use when tests have failed
  and the user wants to understand why, triage failures, or fix broken selectors.
---

# Analyze Failures

See the full skill instructions at: `skills/analyze-failures/SKILL.md`

This skill reads the structured JSON report and provides failure categorization, root cause patterns, and fix suggestions.

## Quick Reference

1. Load `reports/{widget}-report.json`
2. Filter failed cases
3. Categorize: selector broken, timing, value mismatch, preview-only, canvas-only, environment
4. Cluster by section/strategy/context
5. Suggest fixes per cluster

**Full instructions**: Read `skills/analyze-failures/SKILL.md`
