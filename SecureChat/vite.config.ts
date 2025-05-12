// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Create the correct absolute path to your SSL files
const sslDir = path.resolve(__dirname, '../ssl');

export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync(path.join(sslDir, 'key.pem')),
      cert: fs.readFileSync(path.join(sslDir, 'cert.pem')),
    },
  },
});