import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts', 'src/react.tsx'],
  outdir: 'build/src',
  outExtension: { '.js': '.cjs' },
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  bundle: true,
  sourcemap: false,
  external: ['react'],
});
