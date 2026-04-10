import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { ENV } from '../helpers/env';
import { studioLogin } from '../helpers/studio-auth';

const AUTH_FILE = path.join(process.cwd(), '.test-cache', 'auth.json');

export default async function globalSetup(_config: FullConfig) {
  ENV.validate();

  const cacheDir = path.dirname(AUTH_FILE);
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const cookie = await studioLogin(page);
    console.log(`Login successful, cookie captured (${cookie.length} chars)`);

    await context.storageState({ path: AUTH_FILE });
    console.log(`Storage state saved to ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}
