import { Page, type Locator } from '@playwright/test';
import type { VariableDefinition } from '../types';

/**
 * Variable creation UI automation targets Studio **Model** variables (New Variable → Model → Properties).
 * Other categories (Service, Navigation, …) use different wizards and are not handled here yet.
 */

const DEFAULT_STUDIO_CATEGORY = 'Model';

const SAVE_CLOSE_BUTTON_XPATH = '//button[@name="wm-addvariable-save_close"]';

/** Prefer toolbar near the canvas over the global header. */
const CANVAS_VARIABLES_BUTTON_SELECTORS = [
  'button[name="wm-canvas-variables"]',
  'button[name="wm-variables-canvas"]',
  '.studio-canvas-toolbar button[title="Variables"]',
  '.frame-toolbar button[title="Variables"]',
  '.wm-canvas-toolbar button[title="Variables"]',
  'wms-canvas-toolbar button[title="Variables"]',
  '[class*="canvas-toolbar"] button[title="Variables"]',
  '[class*="studio-canvas"] button[title="Variables"]',
];

const HEADER_VARIABLES_BUTTON_SELECTORS = [
  'button[name="wm-header-variables"]',
  'button[name="wm-variables-dropdown"]',
  'button[title="Variables"]',
  '.variables-dropdown button',
  'button:has-text("Variables")',
  '.toolbar button:has-text("Variable")',
];

/**
 * After Save/Save & Close, PRISM often **keeps the variable editor open** (name + Properties stay visible)
 * while the variable already appears in the tree — so waiting for `wm-addvariable-property-name` to hide
 * times out. When `savedVariableName` is set, wait for that row in the Variables dialog, then dismiss
 * the panel. Without a name (e.g. before opening Variables from toolbar), only settle spinners.
 */
async function waitForVariableWizardClosed(page: Page, savedVariableName?: string): Promise<void> {
  if (!savedVariableName) {
    await waitForSpinnerGone(page);
    await page.waitForTimeout(400);
    return;
  }

  const dialog = page.getByRole('dialog').filter({ hasText: /variables/i }).first();

  await dialog
    .getByRole('listitem', {
      name: new RegExp(`^\\s*${escapeRegExp(savedVariableName)}\\s*$`, 'i'),
    })
    .first()
    .waitFor({ state: 'visible', timeout: 20000 });

  await waitForSpinnerGone(page);

  const saveClose = dialog.getByRole('button', { name: /save\s*&\s*close/i }).first();
  if (await saveClose.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveClose.click();
    await page.waitForTimeout(500);
    await waitForSpinnerGone(page);
  }

  const closeBtn = dialog.getByRole('button', { name: /^close$/i }).first();
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(500);
    await waitForSpinnerGone(page);
  }

  await page.waitForTimeout(300);
}

/** If the add wizard is still interactable, Escape may return to the list / canvas. */
async function ensureNoVariableWizardBlocksChrome(page: Page): Promise<void> {
  const nameField = page.locator('input[name="wm-addvariable-property-name"]').first();
  if (await nameField.isVisible({ timeout: 600 }).catch(() => false)) {
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      console.log('    Sent Escape — add-variable form still visible');
    }
  }
  await waitForSpinnerGone(page);
}

async function waitForSpinnerGone(page: Page): Promise<void> {
  const overlay = page.locator('.wms-spinner-overlay');
  if (await overlay.isVisible({ timeout: 500 }).catch(() => false)) {
    await overlay.waitFor({ state: 'hidden', timeout: 30000 });
  }
}

function workspaceRoot(page: Page) {
  return page
    .locator(
      '.studio-main, .page-main, [class*="workspace"]:not([class*="workspace-list"]), wms-studio-page, .studio-editor',
    )
    .first();
}

/**
 * True if the variables list dialog is open (shows "New Variable").
 */
async function isVariablesListOpen(page: Page): Promise<boolean> {
  const newVar = page.getByRole('button', { name: /new variable/i }).first();
  return newVar.isVisible({ timeout: 1500 }).catch(() => false);
}

/**
 * Click Variables on canvas (preferred) or header to open the variables list dialog.
 */
/**
 * Toolbar may open a dropdown first; choose the item that opens the variables list dialog.
 */
async function revealVariablesListFromDropdownIfNeeded(page: Page): Promise<void> {
  if (await isVariablesListOpen(page)) return;
  const menu = page.locator('.dropdown-menu.show, .dropdown.open .dropdown-menu').first();
  const item = menu
    .locator('a, button')
    .filter({ hasText: /^variables$/i })
    .first();
  if (await item.isVisible({ timeout: 2500 }).catch(() => false)) {
    await item.click();
    await page.waitForTimeout(800);
    console.log('    Opened variables list from toolbar dropdown item');
  }
}

async function openVariablesListFromToolbar(page: Page): Promise<void> {
  await waitForVariableWizardClosed(page);
  await waitForSpinnerGone(page);

  const ws = workspaceRoot(page);
  if (await ws.isVisible({ timeout: 2000 }).catch(() => false)) {
    for (const sel of CANVAS_VARIABLES_BUTTON_SELECTORS) {
      const btn = ws.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ timeout: 15000 });
        await page.waitForTimeout(800);
        console.log(`    Clicked variables (canvas toolbar): ${sel}`);
        await revealVariablesListFromDropdownIfNeeded(page);
        return;
      }
    }
  }

  for (const sel of HEADER_VARIABLES_BUTTON_SELECTORS) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click({ timeout: 15000 });
      await page.waitForTimeout(800);
      console.log(`    Clicked variables control (header): ${sel}`);
      await revealVariablesListFromDropdownIfNeeded(page);
      return;
    }
  }

  throw new Error('Could not find Variables button (canvas toolbar or header).');
}

/**
 * Ensure the first dialog — variables list with "New Variable" — is visible.
 */
async function ensureVariablesListDialog(page: Page): Promise<void> {
  if (await isVariablesListOpen(page)) {
    console.log('    Variables list dialog already open');
    return;
  }
  await openVariablesListFromToolbar(page);
  await page.getByRole('button', { name: /new variable/i }).first().waitFor({
    state: 'visible',
    timeout: 15000,
  });
}

async function clickNewVariable(page: Page): Promise<void> {
  const btn = page.getByRole('button', { name: /new variable/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
  await page.waitForTimeout(800);
  console.log('    Clicked New Variable');
}

/**
 * Second dialog / step: choose variable category (Model, Service, …).
 */
async function selectVariableStudioCategory(page: Page, categoryLabel: string): Promise<void> {
  const modal = page.locator('.modal.show, wms-dialog .modal.in.show, [role="dialog"]').last();

  const attempts: { desc: string; locator: Locator }[] = [
    {
      desc: 'role=button exact',
      locator: modal.getByRole('button', { name: new RegExp(`^\\s*${escapeRegExp(categoryLabel)}\\s*$`, 'i') }),
    },
    {
      desc: 'role=button contains',
      locator: modal.getByRole('button', { name: new RegExp(escapeRegExp(categoryLabel), 'i') }),
    },
    {
      desc: 'link/card contains',
      locator: modal.locator(`a, button, [role="option"], .card, li, .list-group-item`).filter({
        hasText: new RegExp(escapeRegExp(categoryLabel), 'i'),
      }),
    },
    {
      desc: 'page text tile',
      locator: page.locator(`a, button, .card, li`).filter({
        hasText: new RegExp(escapeRegExp(categoryLabel), 'i'),
      }),
    },
  ];

  for (const { desc, locator } of attempts) {
    const el = locator.first();
    if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
      await el.click();
      await page.waitForTimeout(600);
      console.log(`    Selected variable category "${categoryLabel}" (${desc})`);
      return;
    }
  }

  console.warn(
    `    Category "${categoryLabel}" not found; continuing — Studio may skip type picker or use a single default.`,
  );
}

async function clickNextIfPresent(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: /^next$/i });
  if (await next.isVisible({ timeout: 2000 }).catch(() => false)) {
    await next.click();
    await page.waitForTimeout(500);
    console.log('    Clicked Next in variable wizard');
  }
}

function modelVariableTypeLabel(t: VariableDefinition['type']): string {
  switch (t) {
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'list':
      return 'List';
    case 'number':
      return 'Number';
    default:
      return 'String';
  }
}

/**
 * Add-variable form lives in #addVariableModal. The host wms-dialog may not be "visible" to Playwright
 * while `.modal.in.show` inside it is — fall through to #variableModal only when the add wizard is not open.
 */
async function resolveVariableFormRoot(page: Page): Promise<Locator> {
  const addHost = page.locator('wms-dialog#addVariableModal');
  const addModalVisible = page
    .locator(
      'wms-dialog#addVariableModal .modal.in.show, wms-dialog#addVariableModal .modal.show, #addVariableModal .modal.in.show',
    )
    .first();
  if (await addModalVisible.isVisible({ timeout: 800 }).catch(() => false)) {
    return addHost;
  }
  if (await addHost.isVisible({ timeout: 500 }).catch(() => false)) {
    return addHost;
  }
  const titled = page.locator('wms-dialog').filter({ hasText: /new variable/i }).first();
  if (await titled.isVisible({ timeout: 2000 }).catch(() => false)) {
    return titled;
  }
  return page.locator('wms-dialog#variableModal, #variableModal').first();
}

/** Properties tab holds Type + JSON dataValue (PRISM "New Variable: Main Page" layout). */
async function ensureVariablePropertiesTab(page: Page, root: Locator): Promise<void> {
  const tab = root.getByRole('tab', { name: /^properties$/i });
  if (await tab.isVisible({ timeout: 2500 }).catch(() => false)) {
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
      await tab.click();
      await page.waitForTimeout(500);
      console.log('    Activated Properties tab');
    }
    return;
  }
  const fallback = root.locator('.nav-tabs a, .nav-link, [role="tab"]').filter({ hasText: /^properties$/i }).first();
  if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
    await fallback.click();
    await page.waitForTimeout(500);
    console.log('    Activated Properties tab (nav fallback)');
  }
}

/**
 * Row containing the Type field. UI uses "Type (Mandatory)" / "Type (Required)" — match any copy starting with "Type".
 */
function typeFieldRow(root: Locator): Locator {
  return root
    .locator('.wms-form-row, li, .form-group, wms-form-field, div[class*="form-group"], tr, div.row')
    .filter({ hasText: /^type\b/i })
    .first();
}

async function tryNativeSelectForType(root: Locator, label: string, t: VariableDefinition['type']): Promise<boolean> {
  const trySelect = async (selectEl: Locator): Promise<boolean> => {
    const count = await selectEl.count().catch(() => 0);
    if (count === 0) return false;
    const visible = await selectEl.isVisible({ timeout: 800 }).catch(() => false);
    if (!visible) {
      try {
        await selectEl.selectOption({ label });
        return true;
      } catch {
        try {
          await selectEl.selectOption({ value: t });
          return true;
        } catch {
          return false;
        }
      }
    }
    try {
      await selectEl.selectOption({ label });
    } catch {
      try {
        await selectEl.selectOption({ value: t });
      } catch {
        const count = await selectEl.locator('option').count();
        let matched = false;
        for (let i = 0; i < count; i++) {
          const opt = selectEl.locator('option').nth(i);
          const text = (await opt.textContent())?.trim() ?? '';
          if (text.toLowerCase() === label.toLowerCase() || text.toLowerCase().startsWith(label.toLowerCase())) {
            await selectEl.selectOption({ index: i });
            matched = true;
            break;
          }
        }
        if (!matched) return false;
      }
    }
    return true;
  };

  const rowSelect = typeFieldRow(root).locator('select.app-select, select.form-control, select').first();
  if (await trySelect(rowSelect)) {
    console.log(`    Set Type (native select in Type row): ${label}`);
    return true;
  }

  const selectSelectors = [
    'select[name="wm-addvariable-property-type"]',
    'select[name="wm-addvariable-property-datatype"]',
    'select[name="dataType"]',
    'select[name="type"]',
    'select[formcontrolname="dataType"]',
    'select[formcontrolname="type"]',
    'select[ng-model*="dataType"]',
    'select[ng-model*="variableType"]',
    'select.app-select',
    'select.variable-data-type',
    '.model-variable-form select',
    'li:has(label:has-text("Type")) select',
  ];

  for (const sel of selectSelectors) {
    const selectEl = root.locator(sel).first();
    if (await trySelect(selectEl)) {
      console.log(`    Set Type (native select): ${label} via ${sel}`);
      return true;
    }
  }

  return false;
}

/**
 * PRISM Model variable Type uses wms-typeahead on [name="wm-addvariable-property-type"] — target the inner input, not the container div.
 */
async function tryWmsTypeaheadPropertyType(page: Page, root: Locator, label: string): Promise<boolean> {
  const input = root
    .locator(
      '[name="wm-addvariable-property-type"] input.typeahead-input, [name="wm-addvariable-property-type"] input.app-textbox, [name="wm-addvariable-property-type"] input.form-control',
    )
    .first();
  if (!(await input.isVisible({ timeout: 2500 }).catch(() => false))) {
    return false;
  }
  const current = (await input.inputValue().catch(() => '')).trim().toLowerCase();
  if (current === label.toLowerCase()) {
    console.log(`    Type already "${label}" (typeahead); skipping`);
    return true;
  }
  await input.scrollIntoViewIfNeeded();
  await input.click({ force: true });
  await input.fill('');
  await page.keyboard.press('Control+a');
  await page.waitForTimeout(100);
  await input.fill(label);
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log(`    Set Type via wm-addvariable-property-type typeahead: ${label}`);
  return true;
}

/**
 * Open WM custom Type control and pick String / Boolean / List / Number.
 * Do not click [name="wm-addvariable-property-type"] alone — it matches the outer container and hits pointer interception.
 */
async function tryCustomTypeDropdown(page: Page, root: Locator, label: string): Promise<boolean> {
  const row = typeFieldRow(root);
  const triggers = [
    row.locator('wms-select input.form-control, wms-select .form-control, wms-select button').first(),
    row.locator('select.app-select, select.form-control').first(),
    root.getByRole('combobox', { name: /type/i }).first(),
    root.getByLabel(/type\s*\(mandatory\)|type\s*\(required\)|^type$/i),
    row.locator('button.dropdown-toggle, .app-select, .select-wrapper').first(),
  ];

  for (const trigger of triggers) {
    if (!(await trigger.isVisible({ timeout: 1200 }).catch(() => false))) continue;
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click({ timeout: 5000 });
    await page.waitForTimeout(450);

    const menuRoots = [
      root.locator('.dropdown-menu.show'),
      page.locator('wms-dialog#addVariableModal .dropdown-menu.show'),
      page.locator('.modal.show .dropdown-menu.show'),
      page.locator('[role="listbox"]'),
    ];

    for (const menu of menuRoots) {
      const opt = menu
        .getByRole('option', { name: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i') })
        .first();
      if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await opt.click();
        await page.waitForTimeout(300);
        console.log(`    Set Type (custom menu option): ${label}`);
        return true;
      }
      const link = menu
        .locator('a, button, li, span')
        .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i') })
        .first();
      if (await link.isVisible({ timeout: 1500 }).catch(() => false)) {
        await link.click();
        await page.waitForTimeout(300);
        console.log(`    Set Type (custom menu item): ${label}`);
        return true;
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  return false;
}

async function ensureIsListCheckbox(page: Page, root: Locator, shouldBeChecked: boolean): Promise<void> {
  const row = root
    .locator('.wms-form-row, li, .form-group, wms-form-field, div[class*="form-group"], tr, div.row')
    .filter({ hasText: /^is\s*list$/i })
    .first();
  const box = row.locator('input[type="checkbox"]').first();
  if (!(await box.isVisible({ timeout: 2000 }).catch(() => false))) return;
  const on = await box.isChecked();
  if (shouldBeChecked !== on) {
    await box.click({ force: true });
    await page.waitForTimeout(250);
    console.log(`    Is List checkbox set to ${shouldBeChecked}`);
  }
}

/**
 * Studio Model variable **Type** dropdown (String, Boolean, List, Number, …).
 */
async function selectModelVariableTypeDropdown(page: Page, t: VariableDefinition['type']): Promise<void> {
  const label = modelVariableTypeLabel(t);
  const root = await resolveVariableFormRoot(page);
  await page.waitForTimeout(250);
  await ensureVariablePropertiesTab(page, root);

  if (await tryWmsTypeaheadPropertyType(page, root, label)) {
    await page.waitForTimeout(200);
    return;
  }

  if (await tryNativeSelectForType(root, label, t)) {
    await page.waitForTimeout(200);
    return;
  }

  if (await tryCustomTypeDropdown(page, root, label)) {
    await page.waitForTimeout(200);
    return;
  }

  const typeAhead = typeFieldRow(root).locator('wms-select input.form-control, wms-select input, input.typeahead-input').first();
  if (await typeAhead.isVisible({ timeout: 2000 }).catch(() => false)) {
    await typeAhead.scrollIntoViewIfNeeded();
    await typeAhead.click({ force: true });
    await typeAhead.fill('');
    await page.keyboard.press('Control+a');
    await page.keyboard.type(label, { delay: 40 });
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    console.log(`    Set Type via type row typeahead keyboard: ${label}`);
    return;
  }

  console.warn(`    Type control not found or could not set "${label}"; check addVariableModal DOM.`);
}

/**
 * **dataValue** under the **JSON** heading on the Properties tab (PRISM layout).
 */
async function fillModelVariableDataValue(page: Page, root: Locator, dataValue: string): Promise<void> {
  await ensureVariablePropertiesTab(page, root);
  await page.waitForTimeout(200);

  const namedDataValueInputs = [
    'input[name="wm-addvariable-property-datavalue"]',
    'textarea[name="wm-addvariable-property-datavalue"]',
    '#wm-addvariable-property-datavalue',
  ];
  for (const sel of namedDataValueInputs) {
    const el = root.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await el.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via ${sel} (${dataValue.length} chars)`);
      return;
    }
  }

  const jsonHeading = root.getByText(/^json$/i).first();
  if (await jsonHeading.isVisible({ timeout: 2500 }).catch(() => false)) {
    const dataValueRow = root
      .locator('.wms-form-row, li, .form-group, div.row, tr')
      .filter({ hasText: /datavalue|data value/i })
      .first();
    const rowInput = dataValueRow.locator('input.app-textbox, input.form-control, textarea').first();
    if (await rowInput.isVisible({ timeout: 2500 }).catch(() => false)) {
      await rowInput.scrollIntoViewIfNeeded();
      await rowInput.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via JSON + dataValue row (${dataValue.length} chars)`);
      return;
    }
  }

  const jsonBlock = root.locator('div, section, fieldset').filter({ hasText: /^json$/i }).first();
  if (await jsonBlock.isVisible({ timeout: 2500 }).catch(() => false)) {
    const dataRow = jsonBlock
      .locator('.wms-form-row, li, .form-group, div.row, tr')
      .filter({ hasText: /datavalue|data value/i })
      .first();
    const inRow = dataRow.locator('input.app-textbox, input.form-control, textarea').first();
    if (await inRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      await inRow.scrollIntoViewIfNeeded();
      await inRow.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via JSON block row (${dataValue.length} chars)`);
      return;
    }
    const firstText = jsonBlock.locator('input.app-textbox, input.form-control, textarea').first();
    if (await firstText.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstText.scrollIntoViewIfNeeded();
      await firstText.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via JSON section first input (${dataValue.length} chars)`);
      return;
    }
  }

  const byLabel = root.getByLabel(/datavalue|data value/i);
  if (await byLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
    await byLabel.scrollIntoViewIfNeeded();
    await byLabel.fill(dataValue);
    await page.waitForTimeout(200);
    console.log(`    Set dataValue via getByLabel (${dataValue.length} chars)`);
    return;
  }

  const valueRow = root
    .locator('.wms-form-row, li, .form-group, wms-form-field, div[class*="form-group"], tr')
    .filter({ hasText: /datavalue|data\s*value|default\s*value/i })
    .first();
  if (await valueRow.isVisible({ timeout: 2000 }).catch(() => false)) {
    const el = valueRow.locator('input, textarea').first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await el.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via labeled row (${dataValue.length} chars)`);
      return;
    }
  }

  const valueInputSelectors = [
    'input[name*="datavalue" i]',
    'textarea[name*="datavalue" i]',
    'input[name="dataValue"]',
    'textarea[name="dataValue"]',
  ];
  for (const sel of valueInputSelectors) {
    const el = root.locator(sel).first();
    if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await el.fill(dataValue);
      await page.waitForTimeout(200);
      console.log(`    Set dataValue via ${sel} (${dataValue.length} chars)`);
      return;
    }
  }

  console.warn('    dataValue field not found (Properties tab → JSON → dataValue).');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fillVariableNameAndValue(page: Page, varDef: VariableDefinition): Promise<void> {
  const root = await resolveVariableFormRoot(page);

  const nameInputSelectors = [
    'input[name="wm-addvariable-property-name"]',
    '#wm-addvariable-property-name',
    'input[name="variableName"]',
    'input[placeholder*="variable name" i]',
    'input[placeholder*="name" i]',
    '.variable-dialog input[type="text"]',
    'input.variable-name',
    'li:has(label:has-text("Name")) input[type="text"]',
  ];

  let nameSet = false;
  for (const sel of nameInputSelectors) {
    const el = root.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await el.fill(varDef.name);
      await el.press('Tab');
      await page.waitForTimeout(400);
      console.log(`    Set name via: ${sel}`);
      nameSet = true;
      break;
    }
  }
  if (!nameSet) {
    console.warn('    Variable name field not found in dialog.');
  }

  await ensureVariablePropertiesTab(page, root);

  // Model variable: Type (Mandatory) on Properties tab; dataValue under JSON heading.
  await selectModelVariableTypeDropdown(page, varDef.type);
  if (varDef.type === 'list') {
    await ensureIsListCheckbox(page, root, true);
  }

  const dataValue = varDef.defaultValue ?? '';
  await fillModelVariableDataValue(page, root, dataValue);
}

/** Save & close the New Variable wizard (Done). */
async function confirmVariableSave(page: Page): Promise<void> {
  const saveCloseByXpath = page.locator(`xpath=${SAVE_CLOSE_BUTTON_XPATH}`).first();
  if (await saveCloseByXpath.isVisible({ timeout: 5000 }).catch(() => false)) {
    await saveCloseByXpath.scrollIntoViewIfNeeded();
    try {
      await saveCloseByXpath.click({ timeout: 10000 });
    } catch {
      await saveCloseByXpath.click({ force: true });
    }
    await page.waitForTimeout(1000);
    console.log(`    Confirmed via xpath: ${SAVE_CLOSE_BUTTON_XPATH}`);
    return;
  }

  const formRoot = await resolveVariableFormRoot(page);
  const primaryDone = formRoot.locator('button[name="wm-addvariable-save_close"]').first();
  if (await primaryDone.isVisible({ timeout: 4000 }).catch(() => false)) {
    try {
      await primaryDone.click({ timeout: 8000 });
    } catch {
      await primaryDone.click({ force: true });
    }
    await page.waitForTimeout(1000);
    console.log('    Confirmed via: button[name="wm-addvariable-save_close"] (scoped to form root)');
    return;
  }

  const doneSelectors = [
    'button:has-text("Done")',
    'button:has-text("Save")',
    'button:has-text("OK")',
    'button:has-text("Create")',
    '.modal-footer button.btn-primary',
  ];

  for (const sel of doneSelectors) {
    const el = formRoot.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await el.click({ timeout: 8000 });
      } catch {
        await el.click({ force: true });
      }
      await page.waitForTimeout(1000);
      console.log(`    Confirmed via: ${sel} (in variable dialog)`);
      return;
    }
  }

  for (const sel of doneSelectors) {
    const el = page.locator('wms-dialog#addVariableModal').locator(sel).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      try {
        await el.click({ timeout: 8000 });
      } catch {
        await el.click({ force: true });
      }
      await page.waitForTimeout(1000);
      console.log(`    Confirmed via: ${sel} (addVariableModal only)`);
      return;
    }
  }

  throw new Error('Could not find Done/Save/OK/Create for new variable.');
}

/**
 * Create a single variable via Studio: Variables list → New Variable → type → form → Save.
 */
export async function createModelVariable(page: Page, varDef: VariableDefinition): Promise<void> {
  const category = varDef.studioCategory?.trim() || DEFAULT_STUDIO_CATEGORY;
  console.log(`  Creating variable: ${varDef.name} (${varDef.type}, default="${varDef.defaultValue}", category="${category}")`);

  await ensureVariablesListDialog(page);
  await clickNewVariable(page);
  await selectVariableStudioCategory(page, category);
  await clickNextIfPresent(page);
  await fillVariableNameAndValue(page, varDef);
  await confirmVariableSave(page);

  await waitForVariableWizardClosed(page, varDef.name);
  await waitForSpinnerGone(page);
  await ensureNoVariableWizardBlocksChrome(page);

  console.log(`  Variable "${varDef.name}" created.`);
}

/**
 * Create all required variables before running test cases.
 */
export async function createAllVariables(page: Page, variables: VariableDefinition[]): Promise<void> {
  if (!variables || variables.length === 0) return;

  console.log(`\nCreating ${variables.length} variable(s)...`);
  for (const varDef of variables) {
    await createModelVariable(page, varDef);
  }
  console.log('All variables created.\n');
}
