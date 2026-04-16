#!/usr/bin/env tsx
/**
 * Discover Widget Selectors
 *
 * Usage: npx tsx scripts/discover-widget-selectors.ts Button wm-button button "#property-Button"
 *
 * Opens WaveMaker Studio, verifies the widget exists via Markup tab comparison,
 * selects it via Page Structure tree, and systematically inspects the DOM across
 * 3 contexts (Properties Panel, Canvas, Preview) to produce a widget-configs/{widget}.config.json.
 */

import { chromium, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { ENV } from '../src/helpers/env';
import { studioLogin, waitForPageLoad } from '../src/helpers/studio-auth';
import { navigateToCanvas, waitForStudioReady } from '../src/helpers/studio-app';
import {
  openComponentsPanel,
  searchComponent,
  selectWidget,
} from '../src/helpers/widget-manager';
import { openPreview, waitForPreviewBuild } from '../src/helpers/preview-manager';
import type { WidgetConfig, PropertySection, InputType } from '../src/types';

// ── CLI arguments ──────────────────────────────────────────
// With `npx tsx scripts/discover-widget-selectors.ts Button ...`, argv[2] is the script path; args start after it.
function discoverCliArgs(): string[] {
  const idx = process.argv.findIndex(a => /discover-widget-selectors\.[tj]s$/.test(a));
  if (idx >= 0) return process.argv.slice(idx + 1);
  return process.argv.slice(2);
}
const [WIDGET_NAME, WIDGET_TAG, WIDGET_PREFIX, COMPONENT_PANEL_ID] = discoverCliArgs();

if (!WIDGET_NAME || !WIDGET_TAG || !WIDGET_PREFIX || !COMPONENT_PANEL_ID) {
  console.error('Usage: npx tsx scripts/discover-widget-selectors.ts <Name> <tag> <prefix> <panelId>');
  console.error('Example: npx tsx scripts/discover-widget-selectors.ts Button wm-button button "#property-Button"');
  process.exit(1);
}

const DEFAULT_NAME = `${WIDGET_PREFIX}1`;
const TABS = ['Properties', 'Styles', 'Events', 'Device'] as const;

// ── Logging helpers ────────────────────────────────────────

const LOGS_DIR = path.join(process.cwd(), 'logs');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function snap(page: Page, label: string): Promise<string> {
  ensureDir(LOGS_DIR);
  const p = path.join(LOGS_DIR, `discover-${label}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: true }).catch(() => {});
  return p;
}

// ── Markup helpers ─────────────────────────────────────────

async function getMarkup(page: Page): Promise<string> {
  const markupBtn = page.locator('button:has-text("Markup"), a:has-text("Markup")').first();
  await markupBtn.click();
  await page.waitForTimeout(2000);

  const markup = await page.evaluate(() => {
    const cm = (document.querySelector('.CodeMirror') as any)?.CodeMirror?.getValue?.() ?? '';
    if (cm) return cm;
    const ace = (window as any).ace?.edit?.(document.querySelector('.ace_editor'))?.getValue?.() ?? '';
    if (ace) return ace;
    const editorEl = document.querySelector('.markup-editor, .code-editor, .CodeMirror-code, .ace_content');
    return editorEl?.textContent?.trim() ?? '';
  });

  return markup;
}

async function switchToCanvas(page: Page): Promise<void> {
  const canvasBtn = page.locator('button:has-text("Canvas"), a:has-text("Canvas")').first();
  if (await canvasBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await canvasBtn.click();
    await page.waitForTimeout(2000);
  }
}

function countTagInMarkup(markup: string, tag: string): number {
  const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
  return (markup.match(regex) || []).length;
}

// ── Drag-drop with dynamic target ──────────────────────────

async function smartDragDrop(page: Page, componentPanelId: string): Promise<void> {
  console.log(`  Drag-dropping: ${componentPanelId}`);

  const sourceEl = page.locator(componentPanelId).first();
  await sourceEl.waitFor({ state: 'visible', timeout: 10_000 });
  const srcBox = await sourceEl.boundingBox();
  if (!srcBox) throw new Error(`Source not found: ${componentPanelId}`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;

  let tgtX = 490, tgtY = 350;
  for (const sel of ['wm-page-content', '[widgettype="wm-page-content"]', '[name="page_content1"]']) {
    const t = page.locator(sel).first();
    if (await t.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await t.boundingBox();
      if (box) { tgtX = box.x + box.width / 2; tgtY = box.y + box.height / 2; break; }
    }
  }

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  await page.waitForTimeout(800);
  const steps = 25;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(srcX + (tgtX - srcX) * (i / steps), srcY + (tgtY - srcY) * (i / steps), { steps: 1 });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(2000);
}

// ── Page Structure tree helpers ────────────────────────────

async function openPageStructureAndFind(page: Page, widgetName: string): Promise<boolean> {
  const structBtn = page.locator('button[name="wm-category-page-structure"]').first();
  if (await structBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await structBtn.click();
    await page.waitForTimeout(1500);
  }
  const node = page.locator(`li.tree-node[data-nodename="${widgetName}"] a.label`).first();
  return node.isVisible({ timeout: 3000 }).catch(() => false);
}

async function selectWidgetFromTree(page: Page, widgetName: string): Promise<boolean> {
  const node = page.locator(`li.tree-node[data-nodename="${widgetName}"] a.label`).first();
  if (await node.isVisible({ timeout: 3000 }).catch(() => false)) {
    await node.click();
    await page.waitForTimeout(1500);
    console.log(`  Selected "${widgetName}" from Page Structure tree.`);
    return true;
  }
  return false;
}

// ── Right panel tab discovery & clicking ───────────────────

/**
 * Tab IDs map to their <a> link IDs in the right panel tabset.
 * DOM structure: <ul class="nav nav-tabs"> → <li> → <a id="properties-link"> → <i title="Properties">
 * The 5 tabs: Properties, Styles, Events, Device, Security
 */
const TAB_LINK_IDS: Record<string, string> = {
  Properties: '#properties-link',
  Styles: '#styles-link',
  Events: '#events-link',
  Device: '#device-link',
  Security: '#security-link',
};

async function clickRightPanelTab(page: Page, _tabIndex: number, tabName: string): Promise<boolean> {
  // Strategy 1: use the exact link ID (most reliable)
  const linkId = TAB_LINK_IDS[tabName];
  if (linkId) {
    const el = page.locator(linkId).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(800);
      console.log(`    Tab "${tabName}" via ${linkId}`);
      return true;
    }
  }

  // Strategy 2: find the <i> icon with title attribute inside .wm-tabs
  const iconEl = page.locator(`.wm-tabs i[title="${tabName}"]`).first();
  if (await iconEl.isVisible({ timeout: 2000 }).catch(() => false)) {
    await iconEl.click();
    await page.waitForTimeout(800);
    console.log(`    Tab "${tabName}" via icon title`);
    return true;
  }

  // Strategy 3: click the parent <a> of the icon
  const parentLink = page.locator(`.wm-tabs a:has(i[title="${tabName}"])`).first();
  if (await parentLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await parentLink.click();
    await page.waitForTimeout(800);
    console.log(`    Tab "${tabName}" via parent <a>`);
    return true;
  }

  return false;
}

// ── Property discovery (DOM-aware) ─────────────────────────

function classifyInput(hasToggle: boolean, hasDropdown: boolean): InputType {
  if (hasToggle) return 'toggle';
  if (hasDropdown) return 'dropdown';
  return 'text';
}

/**
 * Verify which tab is currently active by checking for tab.active.tab-pane.
 */
async function getActiveTabId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.querySelector('tab.active.tab-pane');
    return active?.id || '(none)';
  });
}

/**
 * Discover all properties in the currently active right-panel tab.
 *
 * DOM structure per property:
 *   <li id="property-caption" class="property-caption">
 *     <div class="property-label"><label class="control-label" title="Caption">Caption</label></div>
 *     <div class="property-value">
 *       <wms-properties-template>
 *         <div>
 *           <input data-identifier="property-caption" class="form-control app-textbox">  ← text
 *           <select data-identifier="property-animation" class="form-control app-select"> ← dropdown
 *           <wms-toggle class="switch"> → <input type="checkbox">                         ← toggle
 *           <wms-typeahead> → <input class="typeahead-input">                              ← typeahead
 *           <wms-event-handler> → <input class="typeahead-input">                          ← event
 *         </div>
 *       </wms-properties-template>
 *     </div>
 *   </li>
 *
 * Active tab: tab.active.tab-pane  (only its <li> children are visible)
 */
async function discoverTabProperties(page: Page): Promise<Record<string, PropertySection>> {
  const properties: Record<string, PropertySection> = {};

  const rows = await page.evaluate(() => {
    const results: Array<{
      propertyId: string;
      label: string;
      dataIdentifier: string;
      inputType: 'text' | 'toggle' | 'dropdown' | 'typeahead' | 'event' | 'checkboxset';
    }> = [];

    // Only scan the active tab pane
    const activeTab = document.querySelector('tab.active.tab-pane');
    if (!activeTab) return results;

    // Find all <li> property rows inside the active tab
    const lis = activeTab.querySelectorAll('li[id^="property-"]');
    for (const li of lis) {
      const id = li.id; // e.g. "property-caption"
      const labelEl = li.querySelector('.property-label label.control-label');
      if (!labelEl) continue;
      const label = labelEl.getAttribute('title') || labelEl.textContent?.trim() || '';
      if (!label) continue;

      const valueDiv = li.querySelector('.property-value');
      if (!valueDiv) continue;

      // Determine input type by checking what's inside the value div
      let inputType: 'text' | 'toggle' | 'dropdown' | 'typeahead' | 'event' | 'checkboxset' = 'text';
      let dataIdentifier = '';

      const toggle = valueDiv.querySelector('wms-toggle');
      const select = valueDiv.querySelector('select.app-select, select.form-control');
      const typeahead = valueDiv.querySelector('wms-typeahead');
      const eventHandler = valueDiv.querySelector('wms-event-handler');
      const checkboxset = valueDiv.querySelector('wm-checkboxset');
      const textInput = valueDiv.querySelector('input.app-textbox, input.form-control');

      if (toggle) {
        inputType = 'toggle';
        const cb = toggle.querySelector('input[type="checkbox"]');
        dataIdentifier = cb?.id || id;
      } else if (select) {
        inputType = 'dropdown';
        dataIdentifier = select.getAttribute('data-identifier') || id;
      } else if (eventHandler) {
        inputType = 'event';
        const inp = eventHandler.querySelector('input.typeahead-input');
        dataIdentifier = inp?.id || id;
      } else if (typeahead) {
        inputType = 'typeahead';
        const inp = typeahead.querySelector('input.typeahead-input');
        dataIdentifier = inp?.getAttribute('data-identifier')
          || typeahead.getAttribute('data-identifier') || id;
      } else if (checkboxset) {
        inputType = 'checkboxset';
        dataIdentifier = checkboxset.getAttribute('data-identifier') || id;
      } else if (textInput) {
        inputType = 'text';
        dataIdentifier = textInput.getAttribute('data-identifier') || id;
      } else {
        continue; // no recognizable input
      }

      results.push({ propertyId: id, label, dataIdentifier, inputType });
    }

    return results;
  });

  for (const row of rows) {
    let interactionType: InputType;
    let xpath: string;

    switch (row.inputType) {
      case 'toggle':
        interactionType = 'toggle';
        xpath = `//li[@id='${row.propertyId}']//wms-toggle//input[@type='checkbox']`;
        break;
      case 'dropdown':
        interactionType = 'dropdown';
        xpath = `//li[@id='${row.propertyId}']//select[contains(@class,'app-select')]`;
        break;
      case 'typeahead':
        interactionType = 'dropdown';
        xpath = `//li[@id='${row.propertyId}']//wms-typeahead//input[contains(@class,'typeahead-input')]`;
        break;
      case 'event':
        interactionType = 'text';
        xpath = `//li[@id='${row.propertyId}']//wms-event-handler//input[contains(@class,'typeahead-input')]`;
        break;
      case 'checkboxset':
        interactionType = 'toggle';
        xpath = `//li[@id='${row.propertyId}']//wm-checkboxset`;
        break;
      default:
        interactionType = 'text';
        xpath = `//li[@id='${row.propertyId}']//input[contains(@class,'app-textbox') or contains(@class,'form-control')]`;
        break;
    }

    properties[row.label] = { xpath, interactionType };
  }

  return properties;
}

// ── Canvas / Preview DOM inspection ────────────────────────

async function discoverCanvasXPaths(page: Page, prefix: string, tag: string): Promise<Record<string, string>> {
  // Make sure we're on Canvas view
  await switchToCanvas(page);
  await page.waitForTimeout(1000);

  return page.evaluate(({ prefix, tag }) => {
    const results: Record<string, string> = {};
    const widgetType = tag.replace('wm-', '');

    // Try multiple search strategies
    let root =
      document.querySelector(`[name="${prefix}1"]`) ??
      document.querySelector(`[widgettype="${widgetType}"]`) ??
      document.querySelector(tag);

    // Also try searching all elements with name starting with prefix
    if (!root) {
      const all = document.querySelectorAll(`[name^="${prefix}"]`);
      if (all.length > 0) root = all[0];
    }

    if (!root) {
      // Debug: list all named elements
      const named = document.querySelectorAll('[name]');
      const names = Array.from(named).map(e => e.getAttribute('name')).filter(Boolean).slice(0, 20);
      (results as any)['_debug_all_names'] = names.join(', ');
      return results;
    }

    const rootTag = root.tagName.toLowerCase();
    // Use {widgetName} placeholder instead of hardcoded name so tests can substitute at runtime
    results['root'] = `//${rootTag}[@name='{widgetName}']`;

    const seen = new Set<string>();
    for (const child of root.querySelectorAll('*')) {
      const cn = child.className?.toString() || '';
      const role = child.getAttribute('role') || '';
      const testId = child.getAttribute('data-testid') || '';

      let key = '';
      if (testId) key = testId;
      else if (cn.includes('caption') || cn.includes('btn-caption')) key = 'caption';
      else if (cn.includes('icon') || child.tagName === 'I') key = 'icon';
      else if (cn.includes('badge')) key = 'badge';
      else if (cn.includes('label') && !cn.includes('label-')) key = 'label';
      else if (cn.includes('image') || child.tagName === 'IMG') key = 'image';
      else if (role && !['presentation'].includes(role)) key = role;

      if (key && !seen.has(key)) {
        seen.add(key);
        const ct = child.tagName.toLowerCase();
        let xpath = `//${rootTag}[@name='{widgetName}']//${ct}`;
        const mc = cn.split(/\s+/).find((c: string) =>
          ['caption', 'icon', 'badge', 'label', 'image'].some(k => c.includes(k))
        );
        if (mc) xpath += `[contains(@class,'${mc}')]`;
        results[key] = xpath;
      }
    }
    return results;
  }, { prefix, tag });
}

async function discoverPreviewXPaths(rnFrame: Frame, prefix: string): Promise<Record<string, string>> {
  const xpaths: Record<string, string> = {};
  const data = await rnFrame.evaluate((prefix) => {
    const results: Array<{ key: string; xpath: string }> = [];
    const pat = new RegExp(`^${prefix}\\d+`, 'i');

    for (const el of document.querySelectorAll('[data-testid]')) {
      const tid = el.getAttribute('data-testid') || '';
      if (!pat.test(tid)) continue;
      const suffix = tid.replace(new RegExp(`^${prefix}\\d+_?`, 'i'), '') || 'root';
      // Replace actual name with {widgetName} placeholder
      const paramTid = tid.replace(new RegExp(`^${prefix}\\d+`, 'i'), '{widgetName}');
      results.push({ key: suffix, xpath: `//${el.tagName.toLowerCase()}[@data-testid='${paramTid}']` });
    }
    for (const el of document.querySelectorAll('[aria-label]')) {
      const lbl = el.getAttribute('aria-label') || '';
      if (!pat.test(lbl)) continue;
      const suffix = lbl.replace(new RegExp(`^${prefix}\\d+_?`, 'i'), '') || 'root';
      if (results.some(r => r.key === suffix)) continue;
      const paramLbl = lbl.replace(new RegExp(`^${prefix}\\d+`, 'i'), '{widgetName}');
      results.push({ key: suffix, xpath: `//${el.tagName.toLowerCase()}[@aria-label='${paramLbl}']` });
    }
    return results;
  }, prefix);

  for (const { key, xpath } of data) xpaths[key] = xpath;
  if (Object.keys(xpaths).length > 0 && !xpaths['root']) {
    const first = Object.keys(xpaths)[0];
    xpaths['root'] = `${xpaths[first]}/ancestor::div[@data-testid='non_animatableView'][1]`;
  }
  return xpaths;
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Discover Widget Selectors: ${WIDGET_NAME}`);
  console.log(`  Tag: ${WIDGET_TAG} | Prefix: ${WIDGET_PREFIX} | Panel: ${COMPONENT_PANEL_ID}`);
  console.log(`${'='.repeat(60)}\n`);

  ENV.validate();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ── Step 1: Login ──
    console.log('[Step 1] Logging into Studio...');
    await studioLogin(page);
    console.log('  Login successful.\n');

    // ── Step 2: Navigate to canvas ──
    console.log('[Step 2] Navigating to canvas...');
    await navigateToCanvas(page);
    await waitForStudioReady(page);
    console.log('Canvas ready.\n');

    // ── Step 3: Check markup for existing widget ──
    console.log(`[Step 3] Checking if <${WIDGET_TAG}> exists via Markup tab...`);

    const markupBefore = await getMarkup(page);
    const countBefore = countTagInMarkup(markupBefore, WIDGET_TAG);
    console.log(`Markup has ${countBefore} existing <${WIDGET_TAG}> tag(s).`);

    let widgetInstanceName = DEFAULT_NAME;

    if (countBefore > 0) {
      // Extract the first instance name
      const allNames = [...markupBefore.matchAll(new RegExp(`<${WIDGET_TAG}[^>]*name="(${WIDGET_PREFIX}\\d+)"`, 'gi'))];
      if (allNames.length > 0) {
        widgetInstanceName = allNames[0][1];
        console.log(`  Using existing instance: ${widgetInstanceName} (of ${allNames.length} total)`);
      }
    } else {
      console.log(`  No <${WIDGET_TAG}> found. Attempting drag-drop...`);
      await switchToCanvas(page);
      await openComponentsPanel(page);
      await page.waitForTimeout(1000);
      await searchComponent(page, WIDGET_NAME);
      await page.waitForTimeout(1500);
      await smartDragDrop(page, COMPONENT_PANEL_ID);

      const markupAfter = await getMarkup(page);
      const countAfter = countTagInMarkup(markupAfter, WIDGET_TAG);
      console.log(`  After drag-drop: ${countAfter} <${WIDGET_TAG}> (was ${countBefore}).`);

      if (countAfter > countBefore) {
        console.log('  DRAG-DROP VERIFIED via markup.');
        const allNames = [...markupAfter.matchAll(new RegExp(`<${WIDGET_TAG}[^>]*name="(${WIDGET_PREFIX}\\d+)"`, 'gi'))];
        if (allNames.length > 0) widgetInstanceName = allNames[allNames.length - 1][1];
      } else {
        console.warn('  DRAG-DROP FAILED (markup unchanged).');
        await snap(page, '03-dragdrop-failed');
      }
    }

    // Switch back to Canvas
    await switchToCanvas(page);
    await page.waitForTimeout(1000);

    // ── Step 3b: Select widget via Page Structure tree ──
    console.log(`\n  Selecting "${widgetInstanceName}" via Page Structure tree...`);
    const foundInTree = await openPageStructureAndFind(page, widgetInstanceName);

    if (foundInTree) {
      await selectWidgetFromTree(page, widgetInstanceName);
    } else {
      console.log('  Not in tree. Trying canvas click...');
      await selectWidget(page, widgetInstanceName);
    }

    await page.waitForTimeout(1500);
    const url = page.url();
    console.log(`  URL: ${url}`);
    console.log(`  Selected: ${url.includes(`f=${widgetInstanceName}`)}`);
    await snap(page, '03-selected');
    console.log('');

    // ── Step 4: Inspect Properties Panel (all 4 tabs) ──
    console.log('[Step 4] Inspecting Properties Panel...');
    const propertiesPanel: Record<string, Record<string, PropertySection>> = {};

    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i];
      console.log(`  Scanning tab: ${tab}...`);

      const clicked = await clickRightPanelTab(page, i, tab);
      if (clicked) {
        const activeId = await getActiveTabId(page);
        console.log(`    Active tab pane: #${activeId}`);
        propertiesPanel[tab] = await discoverTabProperties(page);
        console.log(`    Found ${Object.keys(propertiesPanel[tab]).length} properties`);
        for (const [name, sec] of Object.entries(propertiesPanel[tab])) {
          console.log(`      ${name} (${sec.interactionType})`);
        }
      } else {
        console.log(`    Tab "${tab}" not clickable`);
        propertiesPanel[tab] = {};
      }
    }

    await snap(page, '04-properties');
    console.log('');

    // ── Step 5: Inspect Canvas DOM ──
    console.log('[Step 5] Inspecting Canvas DOM...');
    const canvasXPaths = await discoverCanvasXPaths(page, WIDGET_PREFIX, WIDGET_TAG);
    console.log(`  Found ${Object.keys(canvasXPaths).length} canvas XPaths:`);
    for (const [key, xpath] of Object.entries(canvasXPaths)) {
      console.log(`    ${key}: ${xpath}`);
    }
    console.log('');

    // ── Step 6: Inspect Preview DOM ──
    console.log('[Step 6] Opening Preview...');
    let previewXPaths: Record<string, string> = {};
    try {
      await page.keyboard.press('Control+s');
      await page.waitForTimeout(2000);
      const previewPage = await openPreview(page);
      console.log('  Waiting for preview build...');
      const rnFrame = await waitForPreviewBuild(previewPage);
      previewXPaths = await discoverPreviewXPaths(rnFrame, WIDGET_PREFIX);
      console.log(`  Found ${Object.keys(previewXPaths).length} preview XPaths:`);
      for (const [key, xpath] of Object.entries(previewXPaths)) console.log(`    ${key}: ${xpath}`);
      await previewPage.close();
      await page.bringToFront();
    } catch (err) {
      console.warn(`  Preview failed: ${err}`);
    }
    console.log('');

    // ── Step 7: Write config ──
    console.log('[Step 7] Writing config file...');
    const config: WidgetConfig = {
      widget: WIDGET_NAME,
      tag: WIDGET_TAG,
      prefix: WIDGET_PREFIX,
      componentPanelId: COMPONENT_PANEL_ID,
      defaultName: widgetInstanceName,
      canvasXPaths,
      previewXPaths,
      propertiesPanel,
    };

    const outDir = path.join(process.cwd(), 'widget-configs');
    ensureDir(outDir);
    const outPath = path.join(outDir, `${WIDGET_NAME.toLowerCase()}.config.json`);
    fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
    console.log(`  Written: ${outPath}\n`);

    // ── Summary ──
    const totalProps = TABS.reduce((n, t) => n + Object.keys(propertiesPanel[t] || {}).length, 0);
    console.log(`${'='.repeat(60)}`);
    console.log('  Discovery Summary');
    console.log(`${'='.repeat(60)}`);
    console.log(`  Widget:       ${WIDGET_NAME} (${WIDGET_TAG})`);
    console.log(`  Instance:     ${widgetInstanceName}`);
    console.log(`  Total props:  ${totalProps}`);
    console.log(`  Per tab:      ${TABS.map(t => `${t}(${Object.keys(propertiesPanel[t] || {}).length})`).join(', ')}`);
    console.log(`  Canvas:       ${Object.keys(canvasXPaths).length} XPaths`);
    console.log(`  Preview:      ${Object.keys(previewXPaths).length} XPaths`);
    console.log(`  Config file:  ${outPath}`);
    console.log(`${'='.repeat(60)}\n`);

  } catch (err) {
    console.error('Discovery failed:', err);
    await snap(page, 'error');
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
