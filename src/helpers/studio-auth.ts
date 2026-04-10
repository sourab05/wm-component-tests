import { Page, BrowserContext } from '@playwright/test';
import axios from 'axios';
import qs from 'qs';
import { ENV } from './env';

/**
 * Parse a Cookie header string and inject cookies into the browser context.
 */
export async function ensureAuthCookies(page: Page, targetUrl: string, cookieHeader?: string): Promise<void> {
  if (!cookieHeader) return;

  const url = new URL(targetUrl);
  const cookies = cookieHeader.split(';').map(pair => {
    const [name, ...rest] = pair.trim().split('=');
    return {
      name: name.trim(),
      value: rest.join('=').trim(),
      domain: url.hostname,
      path: '/',
    };
  }).filter(c => c.name && c.value);

  await page.context().addCookies(cookies);
}

/**
 * Wait for the page to reach a stable loaded state.
 */
export async function waitForPageLoad(page: Page, timeout = 30_000): Promise<void> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
  }
  await page.waitForTimeout(1000);
}

/**
 * Platform DB REST login — posts credentials via API and returns cookie header.
 */
async function platformDBLogin(baseUrl: string, username: string, password: string): Promise<string> {
  const loginUrl = `${baseUrl.replace(/\/$/, '')}${ENV.studioLoginPath}`;

  const response = await axios.post(loginUrl, qs.stringify({
    j_username: username,
    j_password: password,
  }), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-WM-AUTH-PROVIDER': 'Platform DB',
    },
    maxRedirects: 0,
    validateStatus: (status) => status < 400 || status === 302,
  });

  const setCookies = response.headers['set-cookie'] || [];
  const cookieParts: string[] = [];
  for (const sc of setCookies) {
    const name = sc.split('=')[0].trim();
    const value = sc.split(';')[0].split('=').slice(1).join('=').trim();
    if (name && value) cookieParts.push(`${name}=${value}`);
  }

  if (!cookieParts.length) {
    throw new Error('Platform DB login succeeded but no cookies returned.');
  }

  return cookieParts.join('; ');
}

/**
 * WaveMaker form-based login via browser UI.
 */
async function wavemakerUILogin(page: Page): Promise<string> {
  const baseUrl = ENV.studioBaseUrl.replace(/\/$/, '');
  const loginUrl = `${baseUrl}/login`;

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await page.fill('input[name="username"], input[name="j_username"]', ENV.studioUsername);
  await page.fill('input[name="password"], input[name="j_password"]', ENV.studioPassword);
  await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")');

  await waitForPageLoad(page);

  const cookies = await page.context().cookies();
  const parts: string[] = [];

  const authCookie = cookies.find(c => c.name === 'auth_cookie');
  if (authCookie) parts.push(`auth_cookie=${authCookie.value}`);
  const jsession = cookies.find(c => c.name === 'JSESSIONID');
  if (jsession) parts.push(`JSESSIONID=${jsession.value}`);

  if (!parts.length) {
    console.warn('UI login completed but no auth_cookie/JSESSIONID found.');
  }

  return parts.join('; ');
}

/**
 * Perform Studio login using the appropriate method.
 * Returns the cookie header string for reuse.
 */
export async function studioLogin(page: Page): Promise<string> {
  if (ENV.studioCookie) {
    console.log('Using pre-captured STUDIO_COOKIE...');
    await ensureAuthCookies(page, ENV.studioBaseUrl, ENV.studioCookie);
    return ENV.studioCookie;
  }

  if (ENV.isPlatformDB) {
    console.log('Performing Platform DB REST login...');
    const cookie = await platformDBLogin(ENV.studioBaseUrl, ENV.studioUsername, ENV.studioPassword);
    process.env.STUDIO_COOKIE = cookie;
    await ensureAuthCookies(page, ENV.studioBaseUrl, cookie);
    return cookie;
  }

  if (ENV.isGoogleAuth) {
    throw new Error(
      'Google OAuth login requires the googleAuth module from the Style-Workspace-Automation repo. ' +
      'Set STUDIO_COOKIE or AUTH_METHOD=wavemaker to bypass.'
    );
  }

  console.log('Performing WaveMaker UI login...');
  const cookie = await wavemakerUILogin(page);
  process.env.STUDIO_COOKIE = cookie;
  return cookie;
}
