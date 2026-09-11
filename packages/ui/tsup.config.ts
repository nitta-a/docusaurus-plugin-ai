import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  minify: false,
  external: ['@ai-sdk/react', 'ai', 'react', 'react-dom'],
});
