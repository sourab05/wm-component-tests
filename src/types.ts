/**
 * Assertion strategy used by canvas and preview asserters.
 */
export type AssertStrategy =
  | 'text-content'
  | 'visibility'
  | 'attribute'
  | 'css-property'
  | 'class-contains'
  | 'not-exists';

/**
 * How the property-setter interacts with a Studio property field.
 */
export type InputType = 'text' | 'toggle' | 'dropdown' | 'binding' | 'combined';

/**
 * Whether preview is tested per-case or in a single batched session.
 */
export type PreviewMode = 'individual' | 'batched';

/**
 * A single assertion definition — used for both canvas and preview.
 */
export interface AssertDefinition {
  strategy: AssertStrategy;
  xpath: string;
  expected?: string | boolean | number;
  attribute?: string;
  cssProperty?: string;
}

/**
 * A single test case from {widget}-test-cases.json.
 */
export interface TestCase {
  id: string;
  section: string;
  testCase: string;
  input: string | boolean | number | Record<string, unknown>;
  inputType: InputType;
  canvasAssert: AssertDefinition;
  previewAssert: AssertDefinition;
  previewMode: PreviewMode;
  cleanup?: {
    section: string;
    input: string | boolean | number;
    inputType: InputType;
  } | null;
}

/**
 * Test cases file structure.
 */
export interface TestCasesFile {
  widget: string;
  totalTestCases: number;
  testCases: TestCase[];
}

/**
 * A property section entry in the widget config.
 */
export interface PropertySection {
  xpath: string;
  interactionType: InputType;
}

/**
 * Widget configuration from {widget}.config.json.
 */
export interface WidgetConfig {
  widget: string;
  tag: string;
  prefix: string;
  componentPanelId: string;
  defaultName: string;
  canvasXPaths: Record<string, string>;
  previewXPaths: Record<string, string>;
  propertiesPanel: Record<string, Record<string, PropertySection>>;
}

/**
 * Result of a single test case execution.
 */
export interface TestResult {
  id: string;
  testCase: string;
  section: string;
  canvasResult: 'pass' | 'fail' | 'skip';
  previewResult: 'pass' | 'fail' | 'skip';
  canvasError?: string;
  previewError?: string;
  durationMs: number;
}

/**
 * Full test report structure.
 */
export interface TestReport {
  widget: string;
  timestamp: string;
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: TestResult[];
}
