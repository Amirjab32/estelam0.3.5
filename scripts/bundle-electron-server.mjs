import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve(process.cwd(), 'electron-dist');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

await build({
  entryPoints: [path.resolve(process.cwd(), 'server.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: path.join(outDir, 'local-server.mjs'),
  external: ['vite', 'electron', 'playwright', 'playwright-core', '/usr/local/share/*'],
  plugins: [
    {
      name: 'exclude-external-playwright',
      setup(pluginBuild) {
        pluginBuild.onResolve({ filter: /playwright/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
  banner: {
    js: `import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);`,
  },
});

console.log('Bundled electron-dist/local-server.mjs cleanly');
