import { Frame, expect } from '@playwright/test';
import type { AssertDefinition } from '../types';
import { resolveXPath } from './canvas-asserter';

/**
 * Execute a strategy-based assertion against the preview rn-bundle iframe DOM.
 * XPaths containing {widgetName} are resolved using the provided widgetName.
 */
export async function assertPreview(frame: Frame, assertion: AssertDefinition, widgetName?: string): Promise<void> {
  const xpath = widgetName ? resolveXPath(assertion.xpath, widgetName) : assertion.xpath;

  if (!xpath) {
    console.log('  [Preview] Skipping assertion — no xpath discovered for this element.');
    return;
  }

  const locator = frame.locator(`xpath=${xpath}`).first();

  switch (assertion.strategy) {
    case 'text-content': {
      const text = await locator.textContent({ timeout: 10_000 });
      expect(text?.trim()).toBe(String(assertion.expected));
      break;
    }

    case 'visibility': {
      if (assertion.expected === false) {
        await expect(locator).not.toBeVisible({ timeout: 5000 });
      } else {
        await expect(locator).toBeVisible({ timeout: 10_000 });
      }
      break;
    }

    case 'attribute': {
      if (!assertion.attribute) throw new Error('attribute name required for "attribute" strategy');
      const value = await locator.getAttribute(assertion.attribute, { timeout: 10_000 });
      expect(value).toBe(String(assertion.expected));
      break;
    }

    case 'css-property': {
      if (!assertion.cssProperty) throw new Error('cssProperty required for "css-property" strategy');
      await expect(locator).toBeVisible({ timeout: 10_000 });
      const computed = await locator.evaluate(
        (node, prop) => window.getComputedStyle(node).getPropertyValue(prop),
        assertion.cssProperty,
      );
      expect(computed.trim()).toBe(String(assertion.expected));
      break;
    }

    case 'class-contains': {
      const classes = await locator.getAttribute('class', { timeout: 10_000 });
      expect(classes).toContain(String(assertion.expected));
      break;
    }

    case 'not-exists': {
      const count = await frame.locator(`xpath=${xpath}`).count();
      expect(count).toBe(0);
      break;
    }

    default:
      throw new Error(`Unknown preview assertion strategy: ${assertion.strategy}`);
  }
}
