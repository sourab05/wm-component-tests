import { Page } from '@playwright/test';
import { ENV } from './env';
import { waitForPageLoad } from './studio-auth';

/**
 * Navigate to the Studio canvas for the configured project.
 */
export async function navigateToCanvas(page: Page): Promise<void> {
  const baseUrl = ENV.studioBaseUrl.replace(/\/$/, '');
  const canvasPath = ENV.canvasPath.replace('${PROJECT_ID}', ENV.projectId);
  const url = `${baseUrl}/${canvasPath}`;

  console.log(`Navigating to canvas: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await waitForPageLoad(page);
}

/**
 * Wait for Studio interface to fully load — dark sidebar, canvas, properties panel.
 */
export async function waitForStudioReady(page: Page, timeout = 30_000): Promise<void> {
  console.log('Waiting for Studio interface...');
  await page.waitForTimeout(3000);

  // Wait for the canvas area (mobile phone mockup)
  try {
    await page.waitForSelector('div[class*="canvas"], div[class*="studio-canvas"], .app-canvas', {
      state: 'visible',
      timeout,
    });
  } catch {
    console.warn('Canvas selector not found, continuing...');
  }

  await page.waitForTimeout(2000);
  console.log('Studio interface loaded.');
}

/**
 * Open an existing app from the Studio Apps dashboard.
 */
export async function openApplication(page: Page, appName: string): Promise<void> {
  console.log(`Opening application: ${appName}`);

  // If already on a Studio page with the project, skip
  if (page.url().includes('project-id=')) {
    console.log('Already on a project page, skipping app open.');
    return;
  }

  // Navigate to dashboard if needed
  const baseUrl = ENV.studioBaseUrl.replace(/\/$/, '');
  if (!page.url().includes(baseUrl)) {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await waitForPageLoad(page);
  }

  // Search for the app
  const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first();
  if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await searchInput.fill(appName);
    await page.waitForTimeout(1000);
  }

  // Click the app card
  const appCard = page.locator(`text=${appName}`).first();
  await appCard.hover();
  await page.waitForTimeout(500);

  // Click "Open in studio" or the app card itself
  const openBtn = page.locator('text=Open in studio, text=Open').first();
  if (await openBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await openBtn.click();
  } else {
    await appCard.click();
  }

  await waitForStudioReady(page);
}

/**
 * Save the current Studio project.
 */
export async function saveProject(page: Page): Promise<void> {
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  console.log('Project saved.');
}
