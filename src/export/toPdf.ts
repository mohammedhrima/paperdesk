import { spawn } from 'node:child_process';
import { access, constants, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Prints an HTML document to PDF using a Chromium-family browser.
 *
 * Printing through a real browser rather than a JavaScript PDF library means
 * the exported file is laid out by the same engine that renders the preview, so
 * the two cannot disagree. It also keeps the extension free of a bundled
 * Chromium: the browser the user already has is enough.
 */

/** Executables to look for, in the order they should be preferred. */
const CANDIDATES: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
    '/snap/bin/chromium',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ],
};

/** Environment variables that commonly point at a browser on CI and in containers. */
const ENV_HINTS = ['PAPERDESK_BROWSER', 'CHROME_PATH', 'CHROMIUM_PATH', 'BROWSER'];

export class BrowserNotFoundError extends Error {
  constructor() {
    super('No Chrome, Chromium, Edge or Brave installation was found.');
    this.name = 'BrowserNotFoundError';
  }
}

/**
 * Locates a usable browser. An explicitly configured path wins, then
 * environment hints, then the well-known install locations for the platform.
 */
export async function findBrowser(configuredPath: string): Promise<string | undefined> {
  const candidates = [
    configuredPath,
    ...ENV_HINTS.map((name) => process.env[name] ?? ''),
    ...(CANDIDATES[process.platform] ?? []),
  ];

  for (const candidate of candidates) {
    if (candidate && (await isExecutable(candidate))) return candidate;
  }
  return undefined;
}

export interface PrintOptions {
  /** Absolute path to the HTML file to print. */
  readonly htmlPath: string;
  /** Absolute path the PDF should be written to. */
  readonly outputPath: string;
  /** Browser executable, as resolved by {@link findBrowser}. */
  readonly browserPath: string;
}

/**
 * Renders `htmlPath` to `outputPath`.
 *
 * The browser runs against a throwaway profile directory. Without one, an
 * already-running Chrome would hand the command to its existing instance, which
 * quietly opens a tab instead of printing anything.
 */
export async function printToPdf(options: PrintOptions): Promise<void> {
  const profileDir = await mkdtemp(path.join(tmpdir(), 'paperdesk-profile-'));

  try {
    await run(options, profileDir, false);
  } catch (error) {
    // Sandboxing is unavailable in some containers; retry without it rather
    // than failing an export the user cannot otherwise fix.
    if (!isSandboxFailure(error)) throw error;
    await run(options, profileDir, true);
  } finally {
    await rm(profileDir, { recursive: true, force: true });
  }
}

function run(options: PrintOptions, profileDir: string, disableSandbox: boolean): Promise<void> {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-pdf-header-footer',
    // Lets webfonts and layout settle before the snapshot is taken.
    '--virtual-time-budget=5000',
    `--print-to-pdf=${options.outputPath}`,
    ...(disableSandbox ? ['--no-sandbox'] : []),
    pathToFileUrl(options.htmlPath),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(options.browserPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`The browser exited with code ${code}.\n${stderr.trim()}`));
    });
  });
}

function isSandboxFailure(error: unknown): boolean {
  return error instanceof Error && /sandbox|SUID|namespace/i.test(error.message);
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Builds a `file://` URL that survives spaces and non-ASCII path segments. */
function pathToFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${prefixed.split('/').map(encodeURIComponent).join('/')}`;
}
