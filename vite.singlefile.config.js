// Builds the whole app into one self-contained HTML file (dist-single/index.html)
// that runs straight from disk — handy for sharing or using without a server.
// Usage: npm run build:single
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-single',
  },
});
