---
name: discover-widget-selectors
description: >-
  Auto-inspect WaveMaker Studio DOM to discover all property panel selectors,
  canvas widget XPaths, and preview accessibility selectors for a given widget.
  Outputs a complete widget-config.json ready for the test framework.
---

# Discover Widget Selectors

## Purpose

This skill opens WaveMaker Studio, adds a widget to the canvas, and systematically inspects the DOM across 3 contexts to produce a machine-readable `widget-config.json` file. This config drives the deterministic test framework — no manual DOM inspection needed.

## Input Parameters

| Parameter | Type | Required | Example |
|-----------|------|----------|---------|
| WIDGET_NAME | string | Yes | `Button` |
| WIDGET_TAG | string | Yes | `wm-button` |
| WIDGET_PREFIX | string | Yes | `button` |
| COMPONENT_PANEL_ID | string | Yes | `#property-Button` |

## Steps

### Step 1: Login to Studio

- Use Playwright to navigate to `STUDIO_BASE_URL`
- Login using `STUDIO_USERNAME` / `STUDIO_PASSWORD` (WaveMaker form login)
- Navigate to the canvas: `{STUDIO_BASE_URL}/s/page/Main?project-id={PROJECT_ID}`
- Wait for Studio interface to fully load

### Step 2: Add Widget to Canvas

- Open the Components panel (left sidebar grid icon)
- Search for `WIDGET_NAME` in the search input
- Drag-and-drop the widget onto `wm-page-content` using the JS slow-mouse approach:
  ```js
  mouse.down() → 600ms hold → move in 20 steps → 500ms hover → mouse.up()
  ```
- Verify the widget is placed: URL contains `&f={WIDGET_PREFIX}1`
- Select the widget, confirm right panel shows `{WIDGET_TAG}: {WIDGET_PREFIX}1`

### Step 3: Inspect Properties Panel (All 4 Tabs)

For each tab (**Properties**, **Styles**, **Events**, **Device**):

1. Click the tab to switch to it
2. For each visible section/property in the panel:
   - Record the **property name** (the label text)
   - Determine the **interaction type**: `text` (input field), `toggle` (switch/checkbox), `dropdown` (select/custom), `binding` (has bind icon)
   - Record the **XPath** to the input element (the actual field the user interacts with)
   - If a section is collapsed, expand it first
3. Scroll through the entire tab to find all properties

**Output structure per property:**
```json
{
  "Caption": {
    "xpath": "//div[contains(@class,'property-row') and .//label[text()='Caption']]//input",
    "interactionType": "text"
  }
}
```

### Step 4: Inspect Canvas DOM

With the widget selected on the canvas:

1. Evaluate JavaScript in the page to find the widget element by `@name` attribute
2. Record the **root XPath**: `//button[@name='{WIDGET_PREFIX}1']` (or appropriate tag)
3. Find all significant child elements (caption spans, icon elements, etc.)
4. Record XPaths for each sub-element using `@name`, `@widgettype`, `@class`

**Output structure:**
```json
{
  "root": "//button[@name='button1']",
  "caption": "//button[@name='button1']//span[@class='btn-caption']",
  "icon": "//button[@name='button1']//i"
}
```

### Step 5: Inspect Preview DOM

1. Open preview via `Ctrl+Alt+R`
2. Handle Pop-Up Blocker modal if it appears (click "Manual Launch")
3. Wait for 2-phase build (outer 8-step + inner rn-bundle 3-step)
4. In the rn-bundle iframe, evaluate JavaScript to find elements with `@data-testid` or `@aria-label`
5. Filter for elements matching the widget prefix pattern: `{WIDGET_PREFIX}1_*`
6. Record XPaths for each discovered element

**Output structure:**
```json
{
  "root": "//div[@data-testid='button1_caption']/ancestor::div[@data-testid='non_animatableView'][1]",
  "caption": "//div[@data-testid='button1_caption']"
}
```

### Step 6: Write Config File

Combine all discovered data into `widget-configs/{widget}.config.json`:

```json
{
  "widget": "Button",
  "tag": "wm-button",
  "prefix": "button",
  "componentPanelId": "#property-Button",
  "defaultName": "button1",
  "canvasXPaths": { ... },
  "previewXPaths": { ... },
  "propertiesPanel": {
    "Properties": { ... },
    "Styles": { ... },
    "Events": { ... },
    "Device": { ... }
  }
}
```

## Output

- File: `widget-configs/{widget_lowercase}.config.json`
- The file must be valid JSON matching the `WidgetConfig` interface in `src/types.ts`

## Error Handling

| Issue | Resolution |
|-------|------------|
| Widget not found in Components | Clear search, retype slowly, try "Commonly Used" category |
| Drag-drop fails | Retry with adjusted target coordinates (tgtX=490, tgtY=350) |
| Properties panel shows wrong widget | Click widget text on canvas, verify URL has `&f={prefix}1` |
| Preview build timeout | Wait up to 5 minutes, poll every 5s |
| rn-bundle iframe not found | Check all frames, look for URL containing "rn-bundle" |
