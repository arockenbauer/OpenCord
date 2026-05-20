import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

// Kill any existing process on port 5173 before starting
try {
  const pid = execSync('lsof -t -i:5173 2>/dev/null', { encoding: 'utf8' }).trim();
  if (pid) {
    console.log(`Killing process ${pid} on port 5173`);
    process.kill(Number(pid), 'SIGKILL');
  }
} catch {}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
});
