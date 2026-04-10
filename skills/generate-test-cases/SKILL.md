---
name: generate-test-cases
description: >-
  Generate comprehensive, machine-executable test case JSON for a WaveMaker widget
  by reading its widget-config.json. Covers every property with valid, edge, empty,
  and binding test cases. Output includes XPath assertions for canvas and preview.
---

# Generate Test Cases

## Purpose

This skill reads a widget config file (produced by `discover-widget-selectors`) and generates a complete `{widget}-test-cases.json` file covering every discoverable property with multiple test scenarios. The output is machine-executable — Playwright consumes it directly with zero AI tokens.

## Input Parameters

| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| WIDGET_NAME | string | Yes | `Button` |

## Prerequisites

- `widget-configs/{widget}.config.json` must exist (run `discover-widget-selectors` first)
- `src/types.ts` must exist (defines the TestCase JSON schema)

## Steps

### Step 1: Read Widget Config

Load `widget-configs/{widget_lowercase}.config.json` and parse the `propertiesPanel` section to get all properties with their interaction types.

### Step 2: Read Types Schema

Read `src/types.ts` to understand the exact `TestCase` interface. Every generated test case must conform to this schema:

```typescript
interface TestCase {
  id: string;               // e.g. "TC01"
  section: string;           // e.g. "Properties > Caption"
  testCase: string;          // human-readable description
  input: string | boolean | number | object;
  inputType: InputType;      // "text" | "toggle" | "dropdown" | "binding" | "combined"
  canvasAssert: AssertDefinition;
  previewAssert: AssertDefinition;
  previewMode: PreviewMode;  // "individual" | "batched"
  cleanup?: { section, input, inputType } | null;
}
```

### Step 3: Generate Test Cases Per Property

For each property in the config, generate test cases based on its `interactionType`:

**Text properties** (Caption, Name, Width, Height, Icon Class, etc.):
- Valid value (e.g., "Submit")
- Empty value ("")
- Special characters ("Save & Exit <Now>")
- Very long value (50+ chars)
- Numeric value ("12345")
- Binding expression ("{{variables.varName}}")

**Toggle properties** (Show, Disabled, Accessible, etc.):
- Toggle ON (true)
- Toggle OFF (false)
- Bind to boolean variable ("{{variables.boolVar}}")

**Dropdown properties** (Animation, Icon Position, Accessibility Role, etc.):
- Each valid option
- Empty/none option

**Combined test cases** (interaction between multiple properties):
- Show=OFF + Disabled=ON
- Show=ON + Disabled=ON
- Skeleton ON + custom width/height

### Step 4: Compute Assertion XPaths

For each test case, derive the correct assertion from the widget config:

**canvasAssert**: Use XPaths from `config.canvasXPaths`:
- Text properties → strategy: `text-content`, xpath: caption/text sub-element
- Visibility properties → strategy: `visibility`, xpath: root element
- Layout properties → strategy: `css-property`, xpath: root element, cssProperty: "width"/"height"
- Class properties → strategy: `class-contains`, xpath: root element

**previewAssert**: Use XPaths from `config.previewXPaths`:
- Same strategies but with `@data-testid` / `@aria-label` XPaths

### Step 5: Assign Preview Mode

- `"batched"` (default): for properties where the final state is observable (caption, icon, width, etc.)
- `"individual"`: for properties that change visibility, toggle show/hide, or require a specific build state (Show=OFF, binding tests, skeleton toggle)

### Step 6: Add Cleanup

For destructive test cases (Show=OFF, invalid values, empty name), add a `cleanup` field that restores the property to its default state.

### Step 7: Validate and Write

1. Validate all generated test cases against the `TestCase` schema
2. Ensure every `id` is unique (TC01, TC02, ...)
3. Ensure every `xpath` in assertions is non-empty
4. Write to `test-cases/{widget_lowercase}-test-cases.json`:

```json
{
  "widget": "Button",
  "totalTestCases": 85,
  "testCases": [ ... ]
}
```

## Output

- File: `test-cases/{widget_lowercase}-test-cases.json`
- Must be valid JSON matching `TestCasesFile` interface from `src/types.ts`
- **Human must review and approve** before tests can run

## Quality Checklist

- [ ] Every property in the config has at least 2 test cases
- [ ] All XPaths reference actual elements from the config (no placeholders)
- [ ] Binding test cases use `{{variables.varName}}` format
- [ ] Combined test cases cover important property interactions
- [ ] Cleanup is defined for destructive cases
- [ ] `previewMode: "individual"` for visibility/binding cases
- [ ] IDs are sequential and unique
