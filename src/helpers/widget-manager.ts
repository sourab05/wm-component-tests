import { Page } from '@playwright/test';

/**
 * Open the Components panel via the "Building Blocks" icon in the left sidebar.
 * Selector: button[name="wm-category-page-build"] with title "Building Blocks".
 */
export async function openComponentsPanel(page: Page): Promise<void> {
  console.log('Opening Components panel...');

  const selectors = [
    'button[name="wm-category-page-build"]',
    'button[title="Building Blocks"]',
    'button:has(i.wms-widgets-prefabs)',
  ];

  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(1500);
      console.log(`  Clicked: ${sel}`);
      return;
    }
  }

  console.warn('Could not find Building Blocks icon, Components panel may already be open.');
}

/**
 * Search for a widget in the Components panel.
 * Uses the widget filter input: input[name="wm-widgets-filter"].
 */
export async function searchComponent(page: Page, widgetName: string): Promise<void> {
  console.log(`Searching for component: ${widgetName}`);

  const searchSelectors = [
    'input[name="wm-widgets-filter"]',
    '.widget-list input.wms-search-input',
    '.wm-widgets-panel-container ~ .wm-search-container input',
    'input[type="text"][placeholder="Search..."]',
  ];

  for (const sel of searchSelectors) {
    const input = page.locator(sel).first();
    if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
      await input.click();
      await input.fill(widgetName);
      await page.waitForTimeout(1000);
      console.log(`  Searched using: ${sel}`);
      return;
    }
  }

  console.warn('Could not find widget search input.');
}

/**
 * Drag-and-drop a widget from the Components panel onto the canvas content area.
 * Widget items are `<li>` elements with IDs like "property-Button" and `draggable="true"`.
 * Uses the JS slow-mouse approach proven to work with WaveMaker's drop zone.
 */
export async function dragDropWidget(page: Page, componentPanelId: string): Promise<void> {
  console.log(`Drag-dropping widget: ${componentPanelId}`);

  const sourceEl = page.locator(componentPanelId).first();
  await sourceEl.waitFor({ state: 'visible', timeout: 10_000 });
  const srcBox = await sourceEl.boundingBox();
  if (!srcBox) throw new Error(`Component not found or not visible: ${componentPanelId}`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;

  // Dynamically find the drop target instead of hardcoding coordinates
  let tgtX = 490, tgtY = 350;
  const dropSelectors = [
    'wm-page-content',
    '[widgettype="wm-page-content"]',
    '[name="page_content1"]',
    '.canvas-area',
    '.app-canvas',
  ];
  for (const sel of dropSelectors) {
    const tgt = page.locator(sel).first();
    if (await tgt.isVisible({ timeout: 2000 }).catch(() => false)) {
      const box = await tgt.boundingBox();
      if (box) {
        tgtX = box.x + box.width / 2;
        tgtY = box.y + box.height / 2;
        console.log(`  Drop target "${sel}" at (${Math.round(tgtX)}, ${Math.round(tgtY)})`);
        break;
      }
    }
  }

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  await page.waitForTimeout(800);

  const steps = 25;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      srcX + (tgtX - srcX) * (i / steps),
      srcY + (tgtY - srcY) * (i / steps),
      { steps: 1 },
    );
    await page.waitForTimeout(40);
  }

  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(2000);

  console.log('Widget dropped on canvas.');
}

/**
 * Select a widget on the canvas by clicking it.
 * Tries: canvas element by name → Page Structure tree node → text fallback.
 */
export async function selectWidget(page: Page, widgetName: string): Promise<void> {
  console.log(`Selecting widget: ${widgetName}`);

  // 1. Try clicking the widget element in the canvas iframe/area by name attribute
  const widgetEl = page.locator(`[name="${widgetName}"]`).first();
  if (await widgetEl.isVisible({ timeout: 5000 }).catch(() => false)) {
    await widgetEl.click();
    await page.waitForTimeout(500);
    console.log(`  Selected via [name="${widgetName}"]`);
    return;
  }

  // 2. Try clicking the Page Structure tree node
  const treeNode = page.locator(`li.tree-node[data-nodename="${widgetName}"] > a.label`).first();
  if (await treeNode.isVisible({ timeout: 3000 }).catch(() => false)) {
    await treeNode.click();
    await page.waitForTimeout(500);
    console.log(`  Selected via Page Structure tree node`);
    return;
  }

  // 3. Fallback: click by text
  const structureEl = page.locator(`text=${widgetName}`).first();
  if (await structureEl.isVisible({ timeout: 3000 }).catch(() => false)) {
    await structureEl.click();
    await page.waitForTimeout(500);
    console.log(`  Selected via text fallback`);
  }
}

/**
 * Re-select the widget after a dialog closes (dialogs reset canvas selection).
 */
export async function reselectWidget(page: Page, widgetName: string): Promise<void> {
  await page.waitForTimeout(500);
  await selectWidget(page, widgetName);
}

/**
 * Open the Page Structure panel via the left sidebar icon.
 */
export async function openPageStructure(page: Page): Promise<void> {
  console.log('Opening Page Structure panel...');
  const btn = page.locator('button[name="wm-category-page-structure"]').first();
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1500);
  }
}

/**
 * Full flow: open components panel, search, drag-drop, select.
 */
export async function addWidgetToCanvas(
  page: Page,
  widgetDisplayName: string,
  componentPanelId: string,
  defaultWidgetName: string,
): Promise<void> {
  await openComponentsPanel(page);
  await searchComponent(page, widgetDisplayName);
  await dragDropWidget(page, componentPanelId);
  await selectWidget(page, defaultWidgetName);
}
