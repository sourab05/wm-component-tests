---
name: discover-widget-selectors
description: >-
  Auto-inspect WaveMaker Studio DOM to discover all property panel selectors,
  canvas widget XPaths, and preview accessibility selectors for a given widget.
  Outputs a complete widget-config.json ready for the test framework.
  Use when the user wants to discover selectors, create widget config, inspect Studio DOM,
  or add a new widget to the test framework.
---

# Discover Widget Selectors

See the full skill instructions at: `skills/discover-widget-selectors/SKILL.md`

This skill opens WaveMaker Studio, adds the target widget to the canvas, and systematically inspects the DOM across 3 contexts (Properties Panel, Canvas, Preview) to produce a `widget-configs/{widget}.config.json` file.

## Quick Reference

1. Login to Studio via Playwright
2. Add widget via drag-drop (JS slow-mouse)
3. Walk all 4 tabs (Properties, Styles, Events, Device) — record each property name, input type, XPath
4. Inspect canvas DOM — record `@name`, `@widgettype`, sub-element XPaths
5. Open preview (Ctrl+Alt+R), wait for 2-phase build, inspect `@data-testid` / `@aria-label`
6. Write `widget-configs/{widget}.config.json`

**Full instructions**: Read `skills/discover-widget-selectors/SKILL.md`
