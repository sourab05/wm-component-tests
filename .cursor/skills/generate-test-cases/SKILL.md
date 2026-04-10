---
name: generate-test-cases
description: >-
  Generate comprehensive, machine-executable test case JSON for a WaveMaker widget
  by reading its widget-config.json. Covers every property with valid, edge, empty,
  and binding test cases. Use when the user wants to generate test cases, create test data,
  or prepare tests for a new widget.
---

# Generate Test Cases

See the full skill instructions at: `skills/generate-test-cases/SKILL.md`

This skill reads a widget config file and generates a complete `{widget}-test-cases.json` covering every property with multiple scenarios. Output is machine-executable — Playwright consumes it directly.

## Quick Reference

1. Read `widget-configs/{widget}.config.json`
2. Read `src/types.ts` for the TestCase schema
3. For each property: generate valid, empty, special chars, long, binding test cases
4. Embed canvas + preview XPaths from config into assertions
5. Assign `previewMode` (batched vs individual)
6. Validate against schema, write `test-cases/{widget}-test-cases.json`
7. **Human must review and approve**

**Full instructions**: Read `skills/generate-test-cases/SKILL.md`
