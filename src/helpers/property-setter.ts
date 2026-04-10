import { Page } from '@playwright/test';
import type { WidgetConfig, TestCase, PropertySection, InputType } from '../types';

/**
 * Resolve the property section config from the widget config using the test case's section path.
 * Section format: "Properties > Caption" or "Properties > Behavior > Show"
 */
function resolvePropertySection(config: WidgetConfig, section: string): PropertySection | null {
  const parts = section.split('>').map(p => p.trim());
  if (parts.length < 2) return null;

  const tab = parts[0]; // e.g. "Properties", "Styles", "Events", "Device"
  const propertyPath = parts.slice(1).join(' > '); // e.g. "Caption" or "Behavior > Show"

  const tabConfig = config.propertiesPanel[tab];
  if (!tabConfig) return null;

  return tabConfig[propertyPath] || null;
}

/**
 * Click on the appropriate tab in the properties panel (Properties, Styles, Events, Device).
 */
async function switchTab(page: Page, tabName: string): Promise<void> {
  const tab = page.locator(`text="${tabName}"`).first();
  if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Set a text input property by clearing and typing the value.
 */
async function setText(page: Page, xpath: string, value: string): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();
  await el.click({ clickCount: 3 }); // triple-click to select all
  await page.waitForTimeout(200);

  if (value === '') {
    await page.keyboard.press('Backspace');
  } else {
    await el.fill(value);
  }

  await page.keyboard.press('Tab'); // commit the value
  await page.waitForTimeout(300);
}

/**
 * Toggle a boolean property (click the toggle/checkbox).
 */
async function setToggle(page: Page, xpath: string, value: boolean): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();
  await el.click();
  await page.waitForTimeout(500);
}

/**
 * Select a value from a dropdown property.
 */
async function setDropdown(page: Page, xpath: string, value: string): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();
  await el.click();
  await page.waitForTimeout(500);

  // Try native select first
  const selectEl = page.locator(`xpath=${xpath}//select, xpath=${xpath}`).first();
  try {
    await selectEl.selectOption({ label: value }, { timeout: 3000 });
    return;
  } catch {
    // Fall through to custom dropdown
  }

  // Custom dropdown: click option by text
  const option = page.locator(`text="${value}"`).first();
  if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
    await option.click();
  }
  await page.waitForTimeout(300);
}

/**
 * Open the binding dialog and enter a bind expression.
 */
async function setBinding(page: Page, xpath: string, expression: string): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();

  // Look for the bind icon next to the property field
  const bindIcon = el.locator('xpath=ancestor::*[1]//button[contains(@class, "bind")]').first();
  if (await bindIcon.isVisible({ timeout: 3000 }).catch(() => false)) {
    await bindIcon.click();
    await page.waitForTimeout(1000);
  } else {
    await el.click();
  }

  // In the binding dialog, enter the expression
  const bindInput = page.locator('textarea[class*="bind"], input[class*="bind-expression"]').first();
  if (await bindInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await bindInput.fill(expression);
    await page.waitForTimeout(300);

    // Confirm the binding
    const doneBtn = page.locator('button:has-text("Done"), button:has-text("Bind"), button:has-text("Apply")').first();
    if (await doneBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await doneBtn.click();
    }
  }

  await page.waitForTimeout(500);
}

/**
 * Apply a combined set of property changes (for multi-property test cases).
 */
async function setCombined(
  page: Page,
  config: WidgetConfig,
  inputObj: Record<string, unknown>,
): Promise<void> {
  for (const [key, value] of Object.entries(inputObj)) {
    // Try to find the property section by searching all tabs
    for (const [_tab, sections] of Object.entries(config.propertiesPanel)) {
      for (const [sectionName, sectionConfig] of Object.entries(sections)) {
        if (sectionName.toLowerCase().includes(key.toLowerCase())) {
          await applyInput(page, sectionConfig.xpath, sectionConfig.interactionType, value);
          break;
        }
      }
    }
  }
}

/**
 * Apply an input value using the appropriate interaction method.
 */
async function applyInput(page: Page, xpath: string, inputType: InputType, value: unknown): Promise<void> {
  switch (inputType) {
    case 'text':
      await setText(page, xpath, String(value));
      break;
    case 'toggle':
      await setToggle(page, xpath, Boolean(value));
      break;
    case 'dropdown':
      await setDropdown(page, xpath, String(value));
      break;
    case 'binding':
      await setBinding(page, xpath, String(value));
      break;
    default:
      throw new Error(`Unknown input type: ${inputType}`);
  }
}

/**
 * Apply a test case's property change in the Studio properties panel.
 */
export async function applyTestCase(page: Page, config: WidgetConfig, tc: TestCase): Promise<void> {
  const tabName = tc.section.split('>')[0].trim();
  await switchTab(page, tabName);

  if (tc.inputType === 'combined' && typeof tc.input === 'object' && tc.input !== null) {
    await setCombined(page, config, tc.input as Record<string, unknown>);
    return;
  }

  const section = resolvePropertySection(config, tc.section);
  if (!section) {
    throw new Error(`Property section not found in config: "${tc.section}"`);
  }

  await applyInput(page, section.xpath, section.interactionType, tc.input);
}

/**
 * Apply cleanup action if defined on a test case (restore to previous state).
 */
export async function applyCleanup(page: Page, config: WidgetConfig, tc: TestCase): Promise<void> {
  if (!tc.cleanup) return;

  const section = resolvePropertySection(config, tc.cleanup.section);
  if (!section) return;

  const tabName = tc.cleanup.section.split('>')[0].trim();
  await switchTab(page, tabName);
  await applyInput(page, section.xpath, tc.cleanup.inputType, tc.cleanup.input);
}
