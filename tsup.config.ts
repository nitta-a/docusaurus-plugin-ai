import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    plugin: 'src/plugin.ts',
    'theme/AIPage': 'src/theme/AIPage.tsx',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  minify: false,
  esbuildOptions(options, context) {
    // The plugin uses __dirname at runtime in CJS. Replacing the unused ESM
    // branch avoids esbuild's empty-import-meta warning in the CJS bundle.
    if (context.format === 'cjs') {
      options.define = { ...options.define, 'import.meta.url': 'undefined' };
    }
  },
});
