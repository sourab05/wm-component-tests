#!/usr/bin/env tsx
/**
 * Widget Property Test Pipeline
 *
 * Usage: npx tsx scripts/run-widget-pipeline.ts Button
 *
 * Phases:
 *   1. Check widget config exists (discover-widget-selectors skill must have run)
 *   2. Check test cases exist (generate-test-cases skill must have run + human approved)
 *   3. Run Playwright canvas + preview tests
 *   4. Generate report
 *   5. (Future) Upload to S3, auto-analyze failures
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const widgetName = process.argv[2];

if (!widgetName) {
  console.error('Usage: npx tsx scripts/run-widget-pipeline.ts <WidgetName>');
  console.error('Example: npx tsx scripts/run-widget-pipeline.ts Button');
  process.exit(1);
}

const configPath = path.join(process.cwd(), 'widget-configs', `${widgetName.toLowerCase()}.config.json`);
const testCasesPath = path.join(process.cwd(), 'test-cases', `${widgetName.toLowerCase()}-test-cases.json`);

console.log(`\n${'='.repeat(60)}`);
console.log(`  Widget Property Test Pipeline: ${widgetName}`);
console.log(`${'='.repeat(60)}\n`);

// Phase 1: Check widget config
console.log('[Phase 1] Checking widget config...');
if (!fs.existsSync(configPath)) {
  console.error(`Widget config not found: ${configPath}`);
  console.error('');
  console.error('Run the discover-widget-selectors skill first:');
  console.error(`  Open Cursor, invoke the "discover-widget-selectors" skill with WIDGET_NAME=${widgetName}`);
  process.exit(1);
}
console.log(`  Found: ${configPath}`);

// Phase 2: Check test cases
console.log('\n[Phase 2] Checking test cases...');
if (!fs.existsSync(testCasesPath)) {
  console.error(`Test cases not found: ${testCasesPath}`);
  console.error('');
  console.error('Run the generate-test-cases skill first:');
  console.error(`  Open Cursor, invoke the "generate-test-cases" skill with WIDGET_NAME=${widgetName}`);
  console.error('  Then review and approve the generated test cases.');
  process.exit(1);
}

const tcData = JSON.parse(fs.readFileSync(testCasesPath, 'utf-8'));
console.log(`  Found: ${testCasesPath} (${tcData.totalTestCases} test cases)`);

// Phase 3: Run Playwright tests
console.log('\n[Phase 3] Running Playwright canvas + preview tests...');
try {
  execSync(`npx playwright test src/tests/widget-properties.spec.ts`, {
    stdio: 'inherit',
    env: { ...process.env, WIDGET_NAME: widgetName },
  });
  console.log('\n  All tests passed!');
} catch {
  console.error('\n  Some tests failed. Check the report for details.');
}

// Phase 4: Report
console.log('\n[Phase 4] Report generated.');
const reportPath = path.join(process.cwd(), 'reports', `${widgetName.toLowerCase()}-report.html`);
if (fs.existsSync(reportPath)) {
  console.log(`  HTML: ${reportPath}`);
  console.log(`  JSON: ${reportPath.replace('.html', '.json')}`);
}

// Phase 5: (Future) S3 upload + failure analysis
console.log('\n[Phase 5] S3 upload and failure analysis (not yet configured).');

console.log(`\n${'='.repeat(60)}`);
console.log('  Pipeline complete.');
console.log(`${'='.repeat(60)}\n`);
