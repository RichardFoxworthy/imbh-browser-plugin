/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import tailwindcss from '@tailwindcss/vite';
import { buildSync } from 'esbuild';
import { writeFileSync } from 'fs';

// Plugin to build content script as a self-contained IIFE (no imports)
function contentScriptPlugin() {
  return {
    name: 'content-script-iife',
    writeBundle() {
      const result = buildSync({
        entryPoints: [resolve(__dirname, 'src/content/content-script.ts')],
        bundle: true,
        format: 'iife',
        outfile: resolve(__dirname, 'dist/content.js'),
        minify: true,
        target: 'chrome110',
        tsconfig: resolve(__dirname, 'tsconfig.json'),
      });
      if (result.errors.length > 0) {
        console.error('Content script build errors:', result.errors);
      }
    },
  };
}

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  plugins: [
    tailwindcss(),
    react(),
    viteStaticCopy({
      targets: [
        { src: 'public/manifest.json', dest: '.' },
        { src: 'public/icons/*', dest: 'icons' },
      ],
    }),
    contentScriptPlugin(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
