import { Page, Frame } from '@playwright/test';

const BUILD_KEYWORDS = ['Step ', 'Bundling', 'Initializing', 'Transpling', 'Compiling', 'Installing'];

function isBuildText(text: string): boolean {
  return BUILD_KEYWORDS.some(k => text.includes(k));
}

/**
 * Open the preview via Ctrl+Alt+R and handle the Pop-Up Blocker modal if it appears.
 * Returns the preview page (new tab/popup).
 */
export async function openPreview(page: Page): Promise<Page> {
  console.log('Opening preview via Ctrl+Alt+R...');

  const popupPromise = page.context().waitForEvent('page', { timeout: 30_000 });
  await page.keyboard.press('Control+Alt+r');

  let previewPage: Page;
  try {
    previewPage = await popupPromise;
  } catch {
    // Pop-Up Blocker modal may have appeared — click Manual Launch
    const manualLaunch = page.locator('button:has-text("Manual Launch")').first();
    if (await manualLaunch.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Pop-Up Blocker detected, clicking Manual Launch...');
      const retryPopup = page.context().waitForEvent('page', { timeout: 30_000 });
      await manualLaunch.click();
      previewPage = await retryPopup;
    } else {
      throw new Error('Preview did not open and no Manual Launch button found.');
    }
  }

  await previewPage.waitForLoadState('domcontentloaded');
  console.log('Preview tab opened.');
  return previewPage;
}

/**
 * Wait for the 2-phase preview build to complete.
 *
 * Phase 1 (outer): 8-step build on the preview wrapper page.
 * Phase 2 (inner): 3-step build inside the rn-bundle iframe.
 */
export async function waitForPreviewBuild(previewPage: Page, maxWaitMs = 300_000): Promise<Frame> {
  const deadline = Date.now() + maxWaitMs;

  // Phase 1: outer build (8 steps)
  console.log('Waiting for Phase 1 (outer build)...');
  while (Date.now() < deadline) {
    await previewPage.waitForTimeout(5000);
    const body = await previewPage.evaluate(() => document.body?.innerText ?? '');
    if (!isBuildText(body)) break;
    const stepMatch = body.match(/Step (\d+) of (\d+)/);
    if (stepMatch) console.log(`  Phase 1: Step ${stepMatch[1]} of ${stepMatch[2]}`);
  }

  // Phase 2: inner rn-bundle iframe (3 steps)
  console.log('Waiting for Phase 2 (rn-bundle iframe build)...');
  let rnFrame: Frame | undefined;
  while (Date.now() < deadline) {
    await previewPage.waitForTimeout(5000);
    const frames = previewPage.frames();
    rnFrame = frames.find(f => f.url().includes('rn-bundle'));
    if (!rnFrame) continue;

    const frameBody = await rnFrame.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (frameBody.trim() && !isBuildText(frameBody)) break;

    const stepMatch = frameBody.match(/Step (\d+) of (\d+)/);
    if (stepMatch) console.log(`  Phase 2: Step ${stepMatch[1]} of ${stepMatch[2]}`);
  }

  if (!rnFrame) {
    throw new Error('rn-bundle iframe not found after build wait.');
  }

  // Hydration buffer
  await previewPage.waitForTimeout(3000);
  console.log('Preview build complete.');

  return rnFrame;
}

/**
 * Return to the Studio tab from the preview.
 */
export async function returnToStudio(studioPage: Page, previewPage: Page): Promise<void> {
  await previewPage.close();
  await studioPage.bringToFront();
  await studioPage.waitForTimeout(1000);
}

/**
 * Reload the rn-bundle iframe for incremental preview (faster than full rebuild).
 */
export async function reloadPreviewFrame(previewPage: Page, maxWaitMs = 120_000): Promise<Frame> {
  const rnFrame = previewPage.frames().find(f => f.url().includes('rn-bundle'));
  if (!rnFrame) {
    throw new Error('rn-bundle iframe not found for reload.');
  }

  await rnFrame.evaluate(() => location.reload());
  return waitForPreviewBuild(previewPage, maxWaitMs);
}
