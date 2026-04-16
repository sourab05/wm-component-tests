import { test, Page, Frame } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { WidgetConfig, TestCasesFile, TestResult } from '../types';
import { navigateToCanvas, waitForStudioReady, saveProject } from '../helpers/studio-app';
import { addWidgetToCanvas, reselectWidget } from '../helpers/widget-manager';
import { createAllVariables } from '../helpers/variable-manager';
import { applyTestCase, applyCleanup } from '../helpers/property-setter';
import { assertCanvas } from '../helpers/canvas-asserter';
import { openPreview, waitForPreviewBuild, returnToStudio, reloadPreviewFrame } from '../helpers/preview-manager';
import { assertPreview } from '../helpers/preview-asserter';
import { generateReport } from '../helpers/test-reporter';
import { dismissBlockingStudioDialogs } from '../helpers/studio-dialogs';

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
const testCasesFile = loadTestCases(WIDGET_NAME);
const { testCases } = testCasesFile;

// Single test with generous timeout: ~3 min per TC (preview build is slow)
const PER_CASE_TIMEOUT_MS = 3 * 60 * 1000;
const TOTAL_TIMEOUT_MS = testCases.length * PER_CASE_TIMEOUT_MS;

test.describe(`${WIDGET_NAME} Property Tests`, () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test(`Run all ${testCases.length} test cases`, async ({ browser }) => {
    const results: TestResult[] = [];
    const startTime = Date.now();
    let failed = 0;
    let previewPage: Page | undefined;

    const context = await browser.newContext();
    const studioPage = await context.newPage();

    try {
      await navigateToCanvas(studioPage);
      await waitForStudioReady(studioPage);
      await addWidgetToCanvas(studioPage, config.widget, config.componentPanelId, config.defaultName);

      if (testCasesFile.variables?.length) {
        await createAllVariables(studioPage, testCasesFile.variables);
      }

      let actualWidgetName = config.defaultName;
      const url = studioPage.url();
      const match = url.match(new RegExp(`f=(${config.prefix}\\d+)`));
      if (match) {
        actualWidgetName = match[1];
      } else {
        const header = await studioPage.locator('.activewidget-info .widget-info').first()
          .textContent({ timeout: 5000 }).catch(() => '');
        const headerMatch = header?.match(new RegExp(`(${config.prefix}\\d+)`));
        if (headerMatch) actualWidgetName = headerMatch[1];
      }
      console.log(`Actual widget name: ${actualWidgetName}`);

      for (const tc of testCases) {
        await test.step(`${tc.id}: ${tc.testCase}`, async () => {
          console.log(`\n--- ${tc.id}: ${tc.testCase} ---`);
          const caseStart = Date.now();
          const result: TestResult = {
            id: tc.id,
            testCase: tc.testCase,
            section: tc.section,
            canvasResult: 'skip',
            previewResult: 'skip',
            durationMs: 0,
          };

          await dismissBlockingStudioDialogs(studioPage);

          try {
            await reselectWidget(studioPage, actualWidgetName);
            await applyTestCase(studioPage, config, tc);
            await studioPage.waitForTimeout(500);

            await assertCanvas(studioPage, tc.canvasAssert, actualWidgetName);
            result.canvasResult = 'pass';
            console.log(`  [Canvas] ${tc.id} PASSED`);
          } catch (err: any) {
            result.canvasResult = 'fail';
            result.canvasError = err.message;
            failed++;
            console.error(`  [Canvas] ${tc.id} FAILED: ${err.message}`);
          }

          try {
            await saveProject(studioPage);

            let rnFrame: Frame;
            if (previewPage && !previewPage.isClosed()) {
              await previewPage.bringToFront();
              try {
                rnFrame = await reloadPreviewFrame(previewPage);
              } catch {
                await previewPage.close().catch(() => {});
                previewPage = undefined;
                previewPage = await openPreview(studioPage);
                rnFrame = await waitForPreviewBuild(previewPage);
              }
            } else {
              previewPage = await openPreview(studioPage);
              rnFrame = await waitForPreviewBuild(previewPage);
            }

            try {
              await assertPreview(rnFrame, tc.previewAssert, actualWidgetName);
              result.previewResult = 'pass';
              console.log(`  [Preview] ${tc.id} PASSED`);
            } catch (err: any) {
              result.previewResult = 'fail';
              result.previewError = err.message;
              failed++;
              console.error(`  [Preview] ${tc.id} FAILED: ${err.message}`);
            } finally {
              if (previewPage && !previewPage.isClosed()) {
                await returnToStudio(studioPage, previewPage, { keepPreviewOpen: true });
              }
            }
          } catch (err: any) {
            if (result.previewResult === 'skip') {
              result.previewResult = 'fail';
              result.previewError = err.message;
              failed++;
              console.error(`  [Preview] ${tc.id} FAILED (open/build): ${err.message}`);
            }
          }

          result.durationMs = Date.now() - caseStart;
          results.push(result);

          if (tc.cleanup) {
            try {
              await dismissBlockingStudioDialogs(studioPage);
              await reselectWidget(studioPage, actualWidgetName);
              await applyCleanup(studioPage, config, tc);
            } catch (err: any) {
              console.error(`  [Cleanup] ${tc.id} FAILED: ${err.message}`);
            }
          }
        });
      }

      const totalDuration = Date.now() - startTime;
      generateReport(WIDGET_NAME, results, totalDuration);

      const passed = results.filter(r => r.canvasResult === 'pass' && r.previewResult === 'pass').length;
      console.log(`\n========================================`);
      console.log(`  ${WIDGET_NAME}: ${passed}/${testCases.length} fully passed, ${failed} assertion failures`);
      console.log(`  Duration: ${Math.round(totalDuration / 1000)}s`);
      console.log(`========================================\n`);

      if (failed > 0) {
        const failedCases = results
          .filter(r => r.canvasResult === 'fail' || r.previewResult === 'fail')
          .map(r => {
            const parts: string[] = [];
            if (r.canvasResult === 'fail') parts.push(`Canvas: ${r.canvasError}`);
            if (r.previewResult === 'fail') parts.push(`Preview: ${r.previewError}`);
            return `  ${r.id}: ${parts.join(' | ')}`;
          });
        throw new Error(`${failed} assertion(s) failed:\n${failedCases.join('\n')}`);
      }
    } finally {
      if (previewPage && !previewPage.isClosed()) {
        await previewPage.close().catch(() => {});
      }
      await context.close().catch(() => {});
    }
  });
});
