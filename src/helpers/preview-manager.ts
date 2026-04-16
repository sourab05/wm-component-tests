import { Page, Frame, BrowserContext } from '@playwright/test';

/** Studio toolbar Run / Preview control. */
const PREVIEW_PLAY_BUTTON_XPATH = "//button[@class='play-btn']";

/** Max time to obtain the preview window after clicking Run (new tab or redirected existing window). */
const PREVIEW_WINDOW_TIMEOUT_MS = 45_000;

const BUILD_KEYWORDS = ['Step ', 'Bundling', 'Initializing', 'Transpling', 'Compiling', 'Installing'];

function isBuildText(text: string): boolean {
  return BUILD_KEYWORDS.some(k => text.includes(k));
}

/**
 * Studio stays on the editor; Run opens or reuses another window/tab and navigates it to preview.
 * That may emit `page` (brand-new tab) or only redirect an existing second window — both are handled here.
 */
async function waitForPreviewPage(studioPage: Page, context: BrowserContext, deadlineMs: number): Promise<Page> {
  const deadline = Date.now() + deadlineMs;

  while (Date.now() < deadline) {
    for (const p of context.pages()) {
      if (p === studioPage) continue;
      const url = p.url();
      if (url && url !== 'about:blank') {
        return p;
      }
    }
    await Promise.race([
      context.waitForEvent('page', { timeout: 400 }).catch(() => null),
      studioPage.waitForTimeout(400),
    ]);
  }

  throw new Error(
    'Preview window not found: no second tab/window with a loaded URL after Run (check pop-up blocker or modal blocking the play button).',
  );
}

/**
 * Open the preview by clicking the Studio play button and handle the Pop-Up Blocker modal if it appears.
 * Resolves the **preview** `Page` whether Studio opens a new tab or navigates an existing preview window.
 */
export async function openPreview(page: Page): Promise<Page> {
  console.log('Opening preview via play button...');

  const playBtn = page.locator(`xpath=${PREVIEW_PLAY_BUTTON_XPATH}`).first();
  await playBtn.waitFor({ state: 'visible', timeout: 30_000 });

  const context = page.context();
  await playBtn.click();

  let previewPage: Page;
  try {
    previewPage = await waitForPreviewPage(page, context, PREVIEW_WINDOW_TIMEOUT_MS);
  } catch (firstErr) {
    const manualLaunch = page.locator('button:has-text("Manual Launch")').first();
    if (await manualLaunch.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Pop-Up Blocker detected, clicking Manual Launch...');
      await manualLaunch.click();
      try {
        previewPage = await waitForPreviewPage(page, context, PREVIEW_WINDOW_TIMEOUT_MS);
      } catch {
        throw firstErr;
      }
    } else {
      throw firstErr;
    }
  }

  await previewPage.waitForLoadState('domcontentloaded');
  console.log('Preview window ready.');
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
  const started = Date.now();
  const logHeartbeat = (phase: string, detail: string) => {
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`  [preview build ${elapsed}s] ${phase}: ${detail}`);
  };

  // Phase 1: outer build (8 steps)
  console.log('Waiting for Phase 1 (outer build)...');
  let phase1Polls = 0;
  while (Date.now() < deadline) {
    await previewPage.waitForTimeout(5000);
    phase1Polls++;
    const body = await previewPage.evaluate(() => document.body?.innerText ?? '');
    if (!isBuildText(body)) {
      if (phase1Polls > 1 || body.trim()) {
        logHeartbeat('Phase 1', 'outer page no longer shows build progress text');
      }
      break;
    }
    const stepMatch = body.match(/Step (\d+) of (\d+)/);
    if (stepMatch) console.log(`  Phase 1: Step ${stepMatch[1]} of ${stepMatch[2]}`);
    else if (phase1Polls % 3 === 0) logHeartbeat('Phase 1', 'build UI present, polling…');
  }

  // Phase 2: inner rn-bundle iframe (3 steps)
  console.log('Waiting for Phase 2 (rn-bundle iframe build)...');
  let rnFrame: Frame | undefined;
  let phase2Polls = 0;
  while (Date.now() < deadline) {
    await previewPage.waitForTimeout(5000);
    phase2Polls++;
    const frames = previewPage.frames();
    rnFrame = frames.find(f => f.url().includes('rn-bundle'));
    if (!rnFrame) {
      if (phase2Polls === 1 || phase2Polls % 3 === 0) {
        logHeartbeat(
          'Phase 2',
          `rn-bundle iframe not found yet (${frames.length} frame(s); preview may still be starting)`,
        );
      }
      continue;
    }

    const frameBody = await rnFrame.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (frameBody.trim() && !isBuildText(frameBody)) {
      logHeartbeat('Phase 2', 'rn-bundle ready (no build progress text)');
      break;
    }

    const stepMatch = frameBody.match(/Step (\d+) of (\d+)/);
    if (stepMatch) console.log(`  Phase 2: Step ${stepMatch[1]} of ${stepMatch[2]}`);
    else if (phase2Polls % 3 === 0) {
      const preview = frameBody.slice(0, 120).replace(/\s+/g, ' ');
      logHeartbeat('Phase 2', `iframe found; waiting for app UI (body preview: "${preview}"…)`);
    }
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
 * Return focus to Studio. By default closes the preview tab; set `keepPreviewOpen` to reuse it next run (faster).
 */
export async function returnToStudio(
  studioPage: Page,
  previewPage: Page,
  options?: { keepPreviewOpen?: boolean },
): Promise<void> {
  if (!options?.keepPreviewOpen) {
    await previewPage.close();
  }
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
