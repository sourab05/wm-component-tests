#!/usr/bin/env tsx
/**
 * Generate test-cases/{widget}-test-cases.json from widget-configs/{widget}.config.json
 * (implements the generate-test-cases skill as an executable script).
 *
 * Usage: npx tsx scripts/generate-test-cases.ts [WidgetName]
 *    or: WIDGET_NAME=Button npx tsx scripts/generate-test-cases.ts
 */

import fs from 'fs';
import path from 'path';
import type { AssertDefinition, InputType, TestCase, VariableDefinition, WidgetConfig } from '../src/types';

const widgetArg = (process.argv[2] || process.env.WIDGET_NAME || 'Button').trim();
const fileKey = widgetArg.toLowerCase();
const configPath = path.join(process.cwd(), 'widget-configs', `${fileKey}.config.json`);
const outPath = path.join(process.cwd(), 'test-cases', `${fileKey}-test-cases.json`);

if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}`);
  console.error('Run discover first: npx tsx scripts/discover-widget-selectors.ts ...');
  process.exit(1);
}

const config: WidgetConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const rootXp = config.canvasXPaths.root || `//button[@name='{widgetName}']`;
const captionXp = config.canvasXPaths.caption || `${rootXp}//span[contains(@class,'btn-caption')]`;
const previewCap = config.previewXPaths.caption || '';
const previewRoot = config.previewXPaths.root || '';

let tcNum = 0;
function nextId(): string {
  tcNum += 1;
  return `TC${String(tcNum).padStart(2, '0')}`;
}

function pv(strategy: AssertDefinition['strategy'], xpath: string, rest: Partial<AssertDefinition> = {}): AssertDefinition {
  return { strategy, xpath, ...rest } as AssertDefinition;
}

const DEFAULT_CAPTION = 'Button';

function add(tc: Omit<TestCase, 'id'> & { id?: string }): void {
  testCases.push({ ...tc, id: tc.id ?? nextId() });
}

const testCases: TestCase[] = [];
const variablesMap = new Map<string, VariableDefinition>();

function ensureVariable(name: string, type: VariableDefinition['type'], defaultValue: string): string {
  if (!variablesMap.has(name)) {
    variablesMap.set(name, { name, type, defaultValue, studioCategory: 'Model' });
  }
  return `Variables.${name}.dataSet.dataValue`;
}

for (const [tab, props] of Object.entries(config.propertiesPanel)) {
  for (const [propName, meta] of Object.entries(props)) {
    const section = `${tab} > ${propName}`;
    const pl = propName.toLowerCase();
    const it = meta.interactionType as InputType;

    if (it === 'text') {
      if (pl === 'caption' || (pl.includes('caption') && tab === 'Properties')) {
        add({
          section,
          testCase: 'Set caption to valid text',
          input: 'Submit',
          inputType: 'text',
          canvasAssert: pv('text-content', captionXp, { expected: 'Submit' }),
          previewAssert: pv('text-content', previewCap, { expected: 'Submit' }),
          previewMode: 'batched',
          cleanup: { section, input: DEFAULT_CAPTION, inputType: 'text' },
        });
        add({
          section,
          testCase: 'Set caption to empty string',
          input: '',
          inputType: 'text',
          canvasAssert: pv('text-content', captionXp, { expected: '' }),
          previewAssert: pv('visibility', previewRoot, { expected: true }),
          previewMode: 'batched',
          cleanup: { section, input: DEFAULT_CAPTION, inputType: 'text' },
        });
        add({
          section,
          testCase: 'Set caption with special characters',
          input: 'Save & Exit "Now"',
          inputType: 'text',
          canvasAssert: pv('text-content', captionXp, { expected: 'Save & Exit "Now"' }),
          previewAssert: pv('text-content', previewCap, { expected: 'Save & Exit "Now"' }),
          previewMode: 'batched',
          cleanup: { section, input: DEFAULT_CAPTION, inputType: 'text' },
        });
        const captionBindExpr = ensureVariable('testCaption', 'string', 'BoundCaption');
        add({
          section,
          testCase: 'Bind caption to a variable',
          input: captionBindExpr,
          inputType: 'binding',
          canvasAssert: pv('text-content', captionXp, { expected: 'BoundCaption' }),
          previewAssert: pv('text-content', previewCap, { expected: 'BoundCaption' }),
          previewMode: 'individual',
          cleanup: { section, input: DEFAULT_CAPTION, inputType: 'text' },
        });
        continue;
      }

      if (pl === 'name' && tab === 'Properties') {
        add({
          section,
          testCase: 'Change widget name (restore after)',
          input: 'wm_gen_name_tmp',
          inputType: 'text',
          canvasAssert: pv('attribute', rootXp, { attribute: 'name', expected: 'wm_gen_name_tmp' }),
          previewAssert: pv('visibility', previewRoot, { expected: true }),
          previewMode: 'individual',
          cleanup: { section, input: config.defaultName, inputType: 'text' },
        });
        continue;
      }

      if (tab === 'Events' && pl.includes('tap')) {
        add({
          section,
          testCase: `Set ${propName} event handler`,
          input: 'button1Tap',
          inputType: 'text',
          canvasAssert: pv('visibility', rootXp, { expected: true }),
          previewAssert: pv('visibility', previewRoot, { expected: true }),
          previewMode: 'batched',
          cleanup: { section, input: '', inputType: 'text' },
        });
        continue;
      }

      add({
        section,
        testCase: `Set ${propName} to sample text`,
        input: 'wm-test',
        inputType: 'text',
        canvasAssert: pv('visibility', rootXp, { expected: true }),
        previewAssert: pv('visibility', previewRoot, { expected: true }),
        previewMode: 'batched',
        cleanup: { section, input: '', inputType: 'text' },
      });
      continue;
    }

    if (it === 'toggle') {
      const isMainShow = pl === 'show';
      const isDisabledProp = pl === 'disabled';

      if (isMainShow) {
        add({
          section,
          testCase: `Turn ${propName} off`,
          input: false,
          inputType: 'toggle',
          canvasAssert: pv('visibility', rootXp, { expected: false }),
          previewAssert: pv('visibility', previewRoot, { expected: false }),
          previewMode: 'individual',
          cleanup: { section, input: true, inputType: 'toggle' },
        });
        continue;
      }
      if (isDisabledProp) {
        add({
          section,
          testCase: `Set ${propName} on`,
          input: true,
          inputType: 'toggle',
          canvasAssert: pv('attribute', rootXp, { attribute: 'disabled', expected: '' }),
          previewAssert: pv('visibility', previewRoot, { expected: true }),
          previewMode: 'individual',
          cleanup: { section, input: false, inputType: 'toggle' },
        });
        continue;
      }

      add({
        section,
        testCase: `Toggle ${propName}`,
        input: true,
        inputType: 'toggle',
        canvasAssert: pv('visibility', rootXp, { expected: true }),
        previewAssert: pv('visibility', previewRoot, { expected: true }),
        previewMode: 'batched',
        cleanup: null,
      });
      continue;
    }

    if (it === 'dropdown') {
      add({
        section,
        testCase: `Set ${propName} dropdown`,
        input: 'None',
        inputType: 'dropdown',
        canvasAssert: pv('visibility', rootXp, { expected: true }),
        previewAssert: pv('visibility', previewRoot, { expected: true }),
        previewMode: 'batched',
        cleanup: null,
      });
      continue;
    }

    if (it === 'binding') {
      const varName = `test${propName.replace(/\s+/g, '')}`;
      const bindExpr = ensureVariable(varName, 'string', `Bound${propName}`);
      add({
        section,
        testCase: `Bind ${propName}`,
        input: bindExpr,
        inputType: 'binding',
        canvasAssert: pv('visibility', rootXp, { expected: true }),
        previewAssert: pv('visibility', previewRoot, { expected: true }),
        previewMode: 'individual',
        cleanup: null,
      });
      continue;
    }
  }
}

const variables = Array.from(variablesMap.values());
const out = {
  widget: config.widget,
  totalTestCases: testCases.length,
  ...(variables.length > 0 ? { variables } : {}),
  testCases,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf-8');

console.log(`\nWrote ${testCases.length} test cases → ${outPath}\n`);
