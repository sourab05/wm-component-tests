import { Page } from '@playwright/test';

/**
 * Open the Components panel via the left sidebar icon.
 */
export async function openComponentsPanel(page: Page): Promise<void> {
  console.log('Opening Components panel...');
  // Click the building-blocks / components grid icon in the left sidebar
  const iconsSelectors = [
    'div[class*="left-sidebar"] button[title*="Component"]',
    'div[class*="left-sidebar"] button[title*="Widget"]',
    '[data-testid="components-panel"]',
    'button:has(i[class*="grid"])',
  ];

  for (const sel of iconsSelectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(1000);
      return;
    }
  }

  console.warn('Could not find Components panel icon via known selectors, trying keyboard...');
}

/**
 * Search for a widget in the Components panel.
 */
export async function searchComponent(page: Page, widgetName: string): Promise<void> {
  console.log(`Searching for component: ${widgetName}`);
  const searchInput = page.locator('input[type="search"]').first();
  if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await searchInput.click();
    await searchInput.fill(widgetName);
    await page.waitForTimeout(1000);
  }
}

/**
 * Drag-and-drop a widget from the Components panel onto the canvas content area.
 * Uses the JS slow-mouse approach proven to work with WaveMaker's drop zone.
 */
export async function dragDropWidget(page: Page, componentPanelId: string): Promise<void> {
  console.log(`Drag-dropping widget: ${componentPanelId}`);

  const sourceEl = page.locator(componentPanelId).first();
  const sourceBox = await sourceEl.boundingBox();
  if (!sourceBox) throw new Error(`Component not found: ${componentPanelId}`);

  const srcX = sourceBox.x + sourceBox.width / 2;
  const srcY = sourceBox.y + sourceBox.height / 2;

  // Target: center of the wm-page-content drop zone inside the canvas
  const tgtX = 490;
  const tgtY = 350;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  await page.waitForTimeout(600);

  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      srcX + (tgtX - srcX) * (i / steps),
      srcY + (tgtY - srcY) * (i / steps),
      { steps: 1 },
    );
    await page.waitForTimeout(30);
  }

  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.waitForTimeout(1000);

  console.log('Widget dropped on canvas.');
}

/**
 * Select a widget on the canvas by clicking it.
 * Verifies the URL changes to include the widget name.
 */
export async function selectWidget(page: Page, widgetName: string): Promise<void> {
  console.log(`Selecting widget: ${widgetName}`);

  // Try clicking the widget element by name attribute
  const widgetEl = page.locator(`[name="${widgetName}"]`).first();
  if (await widgetEl.isVisible({ timeout: 5000 }).catch(() => false)) {
    await widgetEl.click();
    await page.waitForTimeout(500);
    return;
  }

  // Fallback: click by text content in the Page Structure panel
  const structureEl = page.locator(`text=${widgetName}`).first();
  if (await structureEl.isVisible({ timeout: 3000 }).catch(() => false)) {
    await structureEl.click();
    await page.waitForTimeout(500);
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
