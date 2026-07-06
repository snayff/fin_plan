import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import pkg from "../../package.json";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@finplan/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Conservative vendor split: isolate the heavy chart stack (recharts +
        // its bundled d3 submodules, plus our own d3-shape usage) and the React
        // runtime into their own long-lived chunks. Keeping these separate from
        // unrelated app/vendor code improves cache stability — a change to app
        // code no longer invalidates the (large, rarely-changing) chart bundle.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts", "d3-shape"],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: "0.0.0.0", // Listen on all interfaces for Docker
    watch: {
      // Polling required: inotify events do not propagate from Windows host
      // through Docker Desktop's filesystem layer into the Linux container.
      usePolling: true,
      interval: 300,
    },
    hmr: {
      host: "localhost",
      clientPort: 3000,
    },
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: (process.env.BACKEND_URL || "ws://localhost:3001").replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
});
