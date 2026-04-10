import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { WidgetConfig, TestCasesFile, TestCase, TestResult } from '../types';
import { ENV } from '../helpers/env';
import { navigateToCanvas, waitForStudioReady, saveProject } from '../helpers/studio-app';
import { addWidgetToCanvas, reselectWidget } from '../helpers/widget-manager';
import { applyTestCase, applyCleanup } from '../helpers/property-setter';
import { assertCanvas } from '../helpers/canvas-asserter';
import { openPreview, waitForPreviewBuild, returnToStudio } from '../helpers/preview-manager';
import { assertPreview } from '../helpers/preview-asserter';
import { generateReport } from '../helpers/test-reporter';

const WIDGET_NAME = process.env.WIDGET_NAME || 'Button';

function loadConfig(widget: string): WidgetConfig {
  const configPath = path.join(process.cwd(), 'widget-configs', `${widget.toLowerCase()}.config.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Widget config not found: ${configPath}. Run the discover-widget-selectors skill first.`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function loadTestCases(widget: string): TestCasesFile {
  const tcPath = path.join(process.cwd(), 'test-cases', `${widget.toLowerCase()}-test-cases.json`);
  if (!fs.existsSync(tcPath)) {
    throw new Error(`Test cases not found: ${tcPath}. Run the generate-test-cases skill first.`);
  }
  return JSON.parse(fs.readFileSync(tcPath, 'utf-8'));
}

const config = loadConfig(WIDGET_NAME);
const { testCases } = loadTestCases(WIDGET_NAME);
const results: TestResult[] = [];
const startTime = Date.now();

test.describe.configure({ mode: 'serial' });

test.describe(`${WIDGET_NAME} Property Tests`, () => {
  let studioPage: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    studioPage = await context.newPage();

    await navigateToCanvas(studioPage);
    await waitForStudioReady(studioPage);
    await addWidgetToCanvas(studioPage, config.widget, config.componentPanelId, config.defaultName);
  });

  // --- CANVAS PHASE: per-case property set + assert ---
  for (const tc of testCases) {
    test(`[Canvas] ${tc.id}: ${tc.testCase}`, async () => {
      const caseStart = Date.now();
      const result: TestResult = {
        id: tc.id,
        testCase: tc.testCase,
        section: tc.section,
        canvasResult: 'skip',
        previewResult: 'skip',
        durationMs: 0,
      };

      try {
        await reselectWidget(studioPage, config.defaultName);
        await applyTestCase(studioPage, config, tc);
        await studioPage.waitForTimeout(500);
        await assertCanvas(studioPage, tc.canvasAssert);
        result.canvasResult = 'pass';
      } catch (err: any) {
        result.canvasResult = 'fail';
        result.canvasError = err.message;
        throw err;
      } finally {
        result.durationMs = Date.now() - caseStart;
        results.push(result);
      }

      if (tc.cleanup) {
        await applyCleanup(studioPage, config, tc);
      }
    });
  }

  // --- PREVIEW PHASE: individual cases ---
  const individualCases = testCases.filter(tc => tc.previewMode === 'individual');

  for (const tc of individualCases) {
    test(`[Preview-Individual] ${tc.id}: ${tc.testCase}`, async () => {
      const existingResult = results.find(r => r.id === tc.id);

      await reselectWidget(studioPage, config.defaultName);
      await applyTestCase(studioPage, config, tc);
      await saveProject(studioPage);

      const previewPage = await openPreview(studioPage);
      try {
        const rnFrame = await waitForPreviewBuild(previewPage);
        await assertPreview(rnFrame, tc.previewAssert);
        if (existingResult) existingResult.previewResult = 'pass';
      } catch (err: any) {
        if (existingResult) {
          existingResult.previewResult = 'fail';
          existingResult.previewError = err.message;
        }
        throw err;
      } finally {
        await returnToStudio(studioPage, previewPage);
      }

      if (tc.cleanup) {
        await applyCleanup(studioPage, config, tc);
      }
    });
  }

  // --- PREVIEW PHASE: batched cases ---
  const batchedCases = testCases.filter(tc => tc.previewMode === 'batched');

  if (batchedCases.length > 0) {
    test(`[Preview-Batched] Assert ${batchedCases.length} properties in preview`, async () => {
      await saveProject(studioPage);
      const previewPage = await openPreview(studioPage);

      try {
        const rnFrame = await waitForPreviewBuild(previewPage);

        for (const tc of batchedCases) {
          const existingResult = results.find(r => r.id === tc.id);
          try {
            await assertPreview(rnFrame, tc.previewAssert);
            if (existingResult) existingResult.previewResult = 'pass';
          } catch (err: any) {
            if (existingResult) {
              existingResult.previewResult = 'fail';
              existingResult.previewError = err.message;
            }
            console.error(`Preview assertion failed for ${tc.id}: ${err.message}`);
          }
        }
      } finally {
        await returnToStudio(studioPage, previewPage);
      }
    });
  }

  test.afterAll(async () => {
    const totalDuration = Date.now() - startTime;
    generateReport(WIDGET_NAME, results, totalDuration);
  });
});
