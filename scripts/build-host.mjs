import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

const resolve = (...segments) => path.join(root, ...segments);

/**
 * Files the extension host reads from disk at runtime instead of bundling: the
 * export stylesheet, and the pdf.js character maps and fallback fonts, which
 * pdf.js fetches by URL when a document embeds neither.
 */
const assets = [
  ['src/export/theme.css', 'dist/theme.css'],
  ['node_modules/pdfjs-dist/cmaps', 'dist/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'dist/standard_fonts'],
];

async function copyAssets() {
  await mkdir(resolve('dist'), { recursive: true });
  await Promise.all(
    assets.map(([from, to]) => cp(resolve(from), resolve(to), { recursive: true })),
  );
}

/** Prints build results in the shape VS Code's `$esbuild-watch` matcher expects. */
const reporter = {
  name: 'reporter',
  setup(build) {
    build.onStart(() => console.log('[host] build started'));
    build.onEnd(async (result) => {
      for (const { text, location } of result.errors) {
        const where = location ? `${location.file}:${location.line}:${location.column}: ` : '';
        console.error(`✘ [ERROR] ${where}${text}`);
      }
      if (result.errors.length === 0) await copyAssets();
      console.log(`[host] build finished with ${result.errors.length} error(s)`);
    });
  },
};

const config = {
  entryPoints: [resolve('src/extension.ts')],
  outfile: resolve('dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Provided by the VS Code runtime, never bundled.
  external: ['vscode'],
  minify: production,
  sourcemap: production ? false : 'inline',
  logLevel: 'silent',
  plugins: [reporter],
};

if (watch) {
  const context = await esbuild.context(config);
  await context.watch();
  console.log('[host] watching for changes');
} else {
  await esbuild.build(config);
}
