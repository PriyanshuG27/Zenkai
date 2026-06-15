import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            open: true,
            gzip: true,
            filename: 'stats.html',
          }),
        ]
      : []),
  ],
  base: '/',
  esbuild: {
    supported: {
      'destructuring': true
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.js'],
    css: false,
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'src/__tests__/**',
        'src/__mocks__/**',
        'src/data/**',
        'src/components/**',
        'src/lib/firebaseConfig.js',
        'src/stores/useAuthStore.js',
      ],
      thresholds: {
        lines:      70,
        functions:  70,
        branches:   70,
        statements: 70,
      },
    },
  },
  build: {
    // Allow browsers to preload split JS chunks in parallel before they are needed.
    // This reduces the waterfall effect when navigating between routes.
    modulePreload: { polyfill: true },
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase-auth':      ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          'firebase-functions': ['firebase/functions'],
          'framer-motion':      ['framer-motion'],
          'recharts':           ['recharts'],
          // Isolate Poster Studio's heavy canvas lib from all other routes
          'konva':              ['konva', 'react-konva'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
