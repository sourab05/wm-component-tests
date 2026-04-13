import 'dotenv/config';

const GOOGLE_AUTH_DOMAINS = ['stage-platform.wavemaker.ai'];

function detectGoogleAuth(baseUrl: string): boolean {
  if (process.env.AUTH_METHOD === 'google') return true;
  if (process.env.AUTH_METHOD === 'wavemaker') return false;
  if (process.env.AUTH_METHOD === 'platformdb') return false;
  try {
    const hostname = new URL(baseUrl).hostname;
    return GOOGLE_AUTH_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function detectPlatformDB(baseUrl: string): boolean {
  if (process.env.AUTH_METHOD === 'platformdb') return true;
  if (process.env.AUTH_METHOD === 'google' || process.env.AUTH_METHOD === 'wavemaker') return false;
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname.endsWith('wavemaker.ai');
  } catch {
    return false;
  }
}

export const ENV = {
  studioBaseUrl: process.env.STUDIO_BASE_URL || '',
  projectId: process.env.PROJECT_ID || '',
  studioProjectId: process.env.STUDIO_PROJECT_ID || process.env.PROJECT_ID || '',
  studioUsername: process.env.STUDIO_USERNAME || '',
  studioPassword: process.env.STUDIO_PASSWORD || '',
  googleEmail: process.env.GOOGLE_EMAIL || process.env.STUDIO_USERNAME || '',
  googlePassword: process.env.GOOGLE_PASSWORD || '',
  googleTotpSecret: process.env.GOOGLE_TOTP_SECRET || '',
  get studioCookie(): string | undefined {
    return process.env.STUDIO_COOKIE;
  },
  studioOrigin: process.env.STUDIO_ORIGIN,
  studioReferer: process.env.STUDIO_REFERER,
  canvasPath: process.env.CANVAS_PATH || 's/page/Main?project-id=${PROJECT_ID}',
  studioLoginPath: process.env.STUDIO_LOGIN_PATH || '/login/authenticate',
  applicationName: process.env.APPLICATION_NAME || 'FORM',
  /** If set, navigate here before opening APPLICATION_NAME (use when STUDIO_BASE_URL redirects into a project). */
  studioAppsUrl: process.env.STUDIO_APPS_URL || '',
  /** Set to 1 to skip the apps dashboard and open the Main page URL directly (old behavior). */
  skipApplicationOpen: process.env.SKIP_APPLICATION_OPEN === '1' || process.env.SKIP_APPLICATION_OPEN === 'true',
  widgetName: process.env.WIDGET_NAME || 'Button',

  get isGoogleAuth(): boolean {
    return detectGoogleAuth(this.studioBaseUrl);
  },
  get isPlatformDB(): boolean {
    return detectPlatformDB(this.studioBaseUrl);
  },
  get authMethod(): 'platformdb' | 'google' | 'wavemaker' {
    if (this.isPlatformDB) return 'platformdb';
    if (this.isGoogleAuth) return 'google';
    return 'wavemaker';
  },

  validate(): void {
    const method = this.authMethod;
    const required: string[] = ['studioBaseUrl', 'projectId'];

    if (method === 'google') {
      required.push('googleEmail', 'googlePassword');
    } else {
      required.push('studioUsername', 'studioPassword');
    }

    const missing = required.filter(key => !(ENV as any)[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables:\n` +
        missing.map(m => `   - ${m}`).join('\n') +
        `\nPlease check your .env file.`
      );
    }

    const labels = { platformdb: 'Platform DB REST', google: 'Google OAuth', wavemaker: 'WaveMaker form' };
    console.log(`Environment validation passed (auth: ${labels[method]})`);
  },
};
