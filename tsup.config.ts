import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: {
    main: 'src/main/main.ts',
    markdown: 'src/main/markdown.ts',
    storage: 'src/main/storage.ts',
    sync: 'src/main/sync.ts',
    preload: 'src/preload/preload.ts'
  },
  // 主进程保持仅转译，不打包依赖，避免把 electron npm 包打进产物。
  bundle: false,
  external: ['electron'],
  format: ['cjs'],
  platform: 'node',
  target: 'es2022',
  outDir: 'dist-electron',
  sourcemap: !!options.watch,
  minify: false,
  clean: !options.watch,
  splitting: false
}));