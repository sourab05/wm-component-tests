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
  await el.scrollIntoViewIfNeeded().catch(() => {});
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
 * Toggle a boolean property. Studio often hides the raw checkbox; click the visible `wms-toggle` host instead.
 */
async function setToggle(page: Page, xpath: string, _value: boolean): Promise<void> {
  const field = page.locator(`xpath=${xpath}`).first();
  await field.scrollIntoViewIfNeeded().catch(() => {});

  const wmsToggle = field.locator('xpath=ancestor::wms-toggle[1]');
  if ((await wmsToggle.count()) > 0) {
    const host = wmsToggle.first();
    if (await host.isVisible({ timeout: 2000 }).catch(() => false)) {
      await host.click();
      await page.waitForTimeout(500);
      return;
    }
  }

  const row = field.locator('xpath=ancestor::li[1]');
  const pseudo = row.locator('.toggle, .switch, span[class*="toggle"], label').first();
  if (await pseudo.isVisible({ timeout: 1500 }).catch(() => false)) {
    await pseudo.click();
  } else {
    await field.click({ force: true });
  }
  await page.waitForTimeout(500);
}

/**
 * Select a value from a dropdown property.
 */
async function setDropdown(page: Page, xpath: string, value: string): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
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
 * Open the binding dialog via the bind icon, switch to "Use Expression" tab,
 * type the expression, and confirm.
 *
 * Expression format: Variables.<Name>.dataSet.dataValue
 */
async function setBinding(page: Page, xpath: string, expression: string): Promise<void> {
  const el = page.locator(`xpath=${xpath}`).first();
  await el.waitFor({ state: 'visible', timeout: 5000 });

  // Step 1: Click the bind icon next to the property field (stay relative to the property row;
  // never fall back to typing in the text field — that would paste the expression as literal caption).
  const bindIconSelectors = [
    'xpath=ancestor::li[1]//button[contains(@class,"bind")]',
    'xpath=ancestor::li[1]//i[contains(@class,"bind")]/..',
    'xpath=ancestor::li[1]//span[contains(@class,"bind")]/..',
    'xpath=ancestor::li[1]//*[contains(@class,"bind") and (self::button or self::a)]',
    'xpath=ancestor::div[contains(@class,"property")][1]//button[contains(@class,"bind")]',
    'xpath=ancestor::li[1]//*[@name="wm-bind-property-caption"]',
  ];

  let iconClicked = false;
  for (const sel of bindIconSelectors) {
    const icon = el.locator(sel).first();
    if (await icon.isVisible({ timeout: 2000 }).catch(() => false)) {
      await icon.click();
      await page.waitForTimeout(1000);
      iconClicked = true;
      console.log(`    Bind icon clicked via: ${sel}`);
      break;
    }
  }

  if (!iconClicked) {
    throw new Error(
      'Bind control not found next to this property; refusing to fill the text box with a binding expression.',
    );
  }

  const bindModal = page.locator('.modal.show, .modal.in.show, [role="dialog"]:visible').last();
  await bindModal.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {
    throw new Error('Bind dialog did not open after clicking the bind control.');
  });

  // Step 2: Click "Use Expression" tab in the bind dialog
  const exprTabSelectors = [
    'text="Use Expression"',
    'a:has-text("Use Expression")',
    'button:has-text("Use Expression")',
    '.nav-tabs a:has-text("Expression")',
    'li:has-text("Expression") a',
  ];

  for (const sel of exprTabSelectors) {
    const tab = bindModal.locator(sel).first();
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(500);
      console.log(`    Expression tab clicked via: ${sel}`);
      break;
    }
  }

  // Step 3: Type the expression only inside the bind dialog (avoid Studio page CodeMirrors)
  const editorSelectors = [
    '.CodeMirror textarea',
    'textarea.expression-input',
    '.bind-expression textarea',
    '.expression-editor textarea',
    'textarea[class*="bind"]',
    '.modal-body textarea',
    '.CodeMirror',
  ];

  let typed = false;
  for (const sel of editorSelectors) {
    const editor = bindModal.locator(sel).first();
    if (await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (sel === '.CodeMirror') {
        await editor.click();
        await page.waitForTimeout(200);
        await page.keyboard.type(expression, { delay: 30 });
      } else {
        await editor.fill(expression);
      }
      await page.waitForTimeout(300);
      typed = true;
      console.log(`    Expression typed via: ${sel} (scoped to bind modal)`);
      break;
    }
  }

  if (!typed) {
    throw new Error('Expression editor not found inside the bind dialog.');
  }

  // Step 4: Confirm the binding
  const confirmSelectors = [
    'button:has-text("Bind")',
    'button:has-text("Done")',
    'button:has-text("Apply")',
    '.modal-footer button.btn-primary',
  ];

  for (const sel of confirmSelectors) {
    const btn = bindModal.locator(sel).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      console.log(`    Binding confirmed via: ${sel}`);
      return;
    }
  }

  throw new Error('Could not find Bind/Done/Apply in the bind dialog.');
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

  const inputType = tc.inputType === 'binding' ? 'binding' : section.interactionType;
  await applyInput(page, section.xpath, inputType, tc.input);
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
