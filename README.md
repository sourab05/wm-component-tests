# wm-component-tests

Data-driven Playwright framework for testing WaveMaker Studio widget/component properties across canvas and preview modes.

## How It Works

Each widget goes through a three-phase pipeline:

1. **Discover** — Auto-inspect the Studio DOM to generate a `widget-config.json` with property panel selectors, canvas XPaths, and preview selectors.
2. **Generate** — Produce a `*-test-cases.json` file with test cases covering every property (valid, edge, empty, and binding scenarios).
3. **Execute** — Playwright runs each test case: sets the property in Studio's property panel, asserts on the canvas, saves, opens preview, and asserts there too.

```
widget-configs/          ← selector configs per widget
test-cases/              ← generated test case JSON per widget
src/tests/               ← Playwright spec (data-driven)
src/helpers/             ← Studio auth, canvas/preview asserters, property setter
scripts/                 ← pipeline runner
skills/                  ← Cursor AI skills for discover / generate / analyze
```

## Prerequisites

- Node.js >= 18
- A WaveMaker Studio account with access to a project

## Setup

```bash
git clone https://github.com/sourab05/wm-component-tests.git
cd wm-component-tests
npm install
npx playwright install chromium
cp .env.example .env
```

Edit `.env` with your Studio credentials, project ID, and base URL.

## Usage

### Run tests for a specific widget

```bash
WIDGET_NAME=Button npx playwright test
```

### Run in headed mode (watch the browser)

```bash
WIDGET_NAME=Button npm run test:headed
```

### Full pipeline (config check → test cases check → run → report)

```bash
npx tsx scripts/run-widget-pipeline.ts Button
```

### View HTML report

```bash
npx playwright show-report
```

## Adding a New Widget

1. **Discover selectors** — Use the `discover-widget-selectors` skill in Cursor to auto-generate `widget-configs/<widget>.config.json`.
2. **Generate test cases** — Use the `generate-test-cases` skill to produce `test-cases/<widget>-test-cases.json`. Review and adjust as needed.
3. **Run** — `WIDGET_NAME=<Widget> npx playwright test`
4. **Analyze failures** — Use the `analyze-failures` skill to triage results from `logs/test-results.json`.

## Project Structure

```
src/
├── helpers/
│   ├── studio-auth.ts       # Login/session management
│   ├── studio-app.ts        # Canvas navigation, save, Studio readiness
│   ├── widget-manager.ts    # Drag widget onto canvas, reselect
│   ├── property-setter.ts   # Set properties via text/toggle/dropdown/binding
│   ├── canvas-asserter.ts   # Assert property effects on canvas DOM
│   ├── preview-manager.ts   # Open/close preview, wait for build
│   ├── preview-asserter.ts  # Assert property effects in preview iframe
│   ├── test-reporter.ts     # Generate JSON + HTML reports
│   └── env.ts               # Environment variable loader
├── tests/
│   ├── global-setup.ts      # Authenticate once, save storage state
│   └── widget-properties.spec.ts  # Data-driven spec (canvas + preview)
└── types.ts                 # TypeScript interfaces for configs, test cases, results
```

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Required | Description |
|---|---|---|
| `STUDIO_BASE_URL` | Yes | Studio instance URL |
| `PROJECT_ID` | Yes | WaveMaker project ID |
| `STUDIO_USERNAME` | Yes | Login email |
| `STUDIO_PASSWORD` | Yes | Login password |
| `WIDGET_NAME` | At runtime | Widget to test (e.g. `Button`) |

## CI Notes

- `retries: 2` in CI mode (`CI=true`)
- Runs headless in CI
- Traces, screenshots, and video captured on failure
- JSON results written to `logs/test-results.json`
