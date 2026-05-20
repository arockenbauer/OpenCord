// vite.config.ts
import { defineConfig } from "file:///home/axel/Documents/OpenCord/node_modules/vite/dist/node/index.js";
import react from "file:///home/axel/Documents/OpenCord/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
import { execSync } from "child_process";
var __vite_injected_original_dirname = "/home/axel/Documents/OpenCord/packages/client";
try {
  const pid = execSync("lsof -t -i:5173 2>/dev/null", { encoding: "utf8" }).trim();
  if (pid) {
    console.log(`Killing process ${pid} on port 5173`);
    process.kill(Number(pid), "SIGKILL");
  }
} catch {
}
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/uploads": "http://localhost:3001",
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9heGVsL0RvY3VtZW50cy9PcGVuQ29yZC9wYWNrYWdlcy9jbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9ob21lL2F4ZWwvRG9jdW1lbnRzL09wZW5Db3JkL3BhY2thZ2VzL2NsaWVudC92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vaG9tZS9heGVsL0RvY3VtZW50cy9PcGVuQ29yZC9wYWNrYWdlcy9jbGllbnQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5cbi8vIEtpbGwgYW55IGV4aXN0aW5nIHByb2Nlc3Mgb24gcG9ydCA1MTczIGJlZm9yZSBzdGFydGluZ1xudHJ5IHtcbiAgY29uc3QgcGlkID0gZXhlY1N5bmMoJ2xzb2YgLXQgLWk6NTE3MyAyPi9kZXYvbnVsbCcsIHsgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG4gIGlmIChwaWQpIHtcbiAgICBjb25zb2xlLmxvZyhgS2lsbGluZyBwcm9jZXNzICR7cGlkfSBvbiBwb3J0IDUxNzNgKTtcbiAgICBwcm9jZXNzLmtpbGwoTnVtYmVyKHBpZCksICdTSUdLSUxMJyk7XG4gIH1cbn0gY2F0Y2gge31cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiAnaHR0cDovL2xvY2FsaG9zdDozMDAxJyxcbiAgICAgICcvdXBsb2Fkcyc6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnLFxuICAgICAgJy9zb2NrZXQuaW8nOiB7XG4gICAgICAgIHRhcmdldDogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMScsXG4gICAgICAgIHdzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXlULFNBQVMsb0JBQW9CO0FBQ3RWLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyxnQkFBZ0I7QUFIekIsSUFBTSxtQ0FBbUM7QUFNekMsSUFBSTtBQUNGLFFBQU0sTUFBTSxTQUFTLCtCQUErQixFQUFFLFVBQVUsT0FBTyxDQUFDLEVBQUUsS0FBSztBQUMvRSxNQUFJLEtBQUs7QUFDUCxZQUFRLElBQUksbUJBQW1CLEdBQUcsZUFBZTtBQUNqRCxZQUFRLEtBQUssT0FBTyxHQUFHLEdBQUcsU0FBUztBQUFBLEVBQ3JDO0FBQ0YsUUFBUTtBQUFDO0FBRVQsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFBQSxFQUNBLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxNQUNMLFFBQVE7QUFBQSxNQUNSLFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLElBQUk7QUFBQSxNQUNOO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
