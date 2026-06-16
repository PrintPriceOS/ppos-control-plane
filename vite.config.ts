import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: React + core libraries
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // Vendor: Routing
          if (id.includes('node_modules/react-router')) {
            return 'vendor-router';
          }
          // Vendor: Icons
          if (id.includes('node_modules/@heroicons') || id.includes('node_modules/lucide')) {
            return 'vendor-icons';
          }
          // Vendor: Data/state
          if (id.includes('node_modules/axios') || id.includes('node_modules/swr') || id.includes('node_modules/zustand')) {
            return 'vendor-data';
          }

        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080',
      '/federation': 'http://localhost:8080',
    },
  },
});
