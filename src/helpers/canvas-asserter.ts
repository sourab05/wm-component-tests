import { Page, expect } from '@playwright/test';
import type { AssertDefinition } from '../types';

/**
 * Resolve {widgetName} placeholders in an XPath string.
 */
export function resolveXPath(xpath: string, widgetName: string): string {
  return xpath.replace(/\{widgetName\}/g, widgetName);
}

/**
 * Execute a strategy-based assertion against the canvas DOM.
 * XPaths containing {widgetName} are resolved using the provided widgetName.
 */
export async function assertCanvas(page: Page, assertion: AssertDefinition, widgetName?: string): Promise<void> {
  const xpath = widgetName ? resolveXPath(assertion.xpath, widgetName) : assertion.xpath;
  const locator = page.locator(`xpath=${xpath}`).first();

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
      const el = locator;
      await expect(el).toBeVisible({ timeout: 10_000 });
      const computed = await el.evaluate(
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
      const count = await page.locator(`xpath=${xpath}`).count();
      expect(count).toBe(0);
      break;
    }

    default:
      throw new Error(`Unknown canvas assertion strategy: ${assertion.strategy}`);
  }
}
