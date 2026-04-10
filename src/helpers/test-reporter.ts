import fs from 'fs';
import path from 'path';
import type { TestReport, TestResult } from '../types';

/**
 * Generate a structured JSON test report and write it to disk.
 */
export function generateReport(
  widget: string,
  results: TestResult[],
  durationMs: number,
): TestReport {
  const report: TestReport = {
    widget,
    timestamp: new Date().toISOString(),
    totalCases: results.length,
    passed: results.filter(r => r.canvasResult === 'pass' && r.previewResult === 'pass').length,
    failed: results.filter(r => r.canvasResult === 'fail' || r.previewResult === 'fail').length,
    skipped: results.filter(r => r.canvasResult === 'skip' || r.previewResult === 'skip').length,
    durationMs,
    results,
  };

  const reportsDir = path.join(process.cwd(), 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const jsonPath = path.join(reportsDir, `${widget.toLowerCase()}-report.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Report written: ${jsonPath}`);

  const htmlPath = path.join(reportsDir, `${widget.toLowerCase()}-report.html`);
  fs.writeFileSync(htmlPath, generateHtml(report));
  console.log(`HTML report written: ${htmlPath}`);

  return report;
}

function generateHtml(report: TestReport): string {
  const rows = report.results.map(r => {
    const canvasClass = r.canvasResult === 'pass' ? 'pass' : r.canvasResult === 'fail' ? 'fail' : 'skip';
    const previewClass = r.previewResult === 'pass' ? 'pass' : r.previewResult === 'fail' ? 'fail' : 'skip';
    const error = r.canvasError || r.previewError || '';
    return `<tr>
      <td>${r.id}</td>
      <td>${r.section}</td>
      <td>${r.testCase}</td>
      <td class="${canvasClass}">${r.canvasResult}</td>
      <td class="${previewClass}">${r.previewResult}</td>
      <td>${r.durationMs}ms</td>
      <td class="error">${error}</td>
    </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${report.widget} Property Test Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; background: #f8f9fa; }
  h1 { color: #1a1a2e; }
  .summary { display: flex; gap: 1.5rem; margin: 1rem 0 2rem; }
  .summary .card { padding: 1rem 1.5rem; border-radius: 8px; color: #fff; font-size: 1.2rem; }
  .summary .total { background: #3498db; }
  .summary .passed { background: #27ae60; }
  .summary .failed { background: #e74c3c; }
  .summary .skipped { background: #95a5a6; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  th { background: #1a1a2e; color: #fff; padding: 0.75rem; text-align: left; }
  td { padding: 0.6rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
  tr:hover { background: #f1f3f5; }
  .pass { color: #27ae60; font-weight: 600; }
  .fail { color: #e74c3c; font-weight: 600; }
  .skip { color: #95a5a6; }
  .error { color: #e74c3c; font-size: 0.8rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; }
</style>
</head>
<body>
  <h1>${report.widget} Property Test Report</h1>
  <p>${report.timestamp} | Duration: ${(report.durationMs / 1000).toFixed(1)}s</p>
  <div class="summary">
    <div class="card total">Total: ${report.totalCases}</div>
    <div class="card passed">Passed: ${report.passed}</div>
    <div class="card failed">Failed: ${report.failed}</div>
    <div class="card skipped">Skipped: ${report.skipped}</div>
  </div>
  <table>
    <thead><tr><th>ID</th><th>Section</th><th>Test Case</th><th>Canvas</th><th>Preview</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}
