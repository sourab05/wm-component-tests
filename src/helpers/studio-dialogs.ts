import { Page } from '@playwright/test';

/**
 * Close Studio overlays that block the canvas / toolbar (Variables wizard, variable modal, etc.).
 * Call before reselecting the widget or clicking Run so pointer events reach the intended controls.
 */
export async function dismissBlockingStudioDialogs(page: Page): Promise<void> {
  const varsDialog = page.getByRole('dialog').filter({ hasText: /variables/i }).first();
  if (await varsDialog.isVisible({ timeout: 500 }).catch(() => false)) {
    const saveClose = varsDialog.getByRole('button', { name: /save\s*&\s*close/i }).first();
    if (await saveClose.isVisible({ timeout: 1500 }).catch(() => false)) {
      await saveClose.click();
      await page.waitForTimeout(400);
    }
    const closeBtn = varsDialog.getByRole('button', { name: /^close$/i }).first();
    if (await varsDialog.isVisible({ timeout: 300 }).catch(() => false)) {
      if (await closeBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(400);
      }
    }
  }

  const variableModal = page.locator('wms-dialog#variableModal, wms-dialog#addVariableModal').first();
  if (await variableModal.isVisible({ timeout: 500 }).catch(() => false)) {
    const close = variableModal.locator('.modal-header button.close, button[aria-label="Close"]').first();
    if (await close.isVisible({ timeout: 1500 }).catch(() => false)) {
      await close.click();
      await page.waitForTimeout(400);
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }
  }

  const overlay = page.locator('.wms-spinner-overlay');
  if (await overlay.isVisible({ timeout: 400 }).catch(() => false)) {
    await overlay.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});
  }
}
