import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5180,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    // Proxy API calls to the real backend (server/) so the browser can talk
    // to it same-origin (no CORS). Backend runs on :4000 by default.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the big third-party libraries into their own long-lived chunks so
        // an app-code deploy doesn't invalidate them in the browser cache, and so
        // the heavy, route-isolated ones (recharts, leaflet) only download on the
        // routes that import them.
        //
        // Deliberately NOT bucketed here: @radix-ui and lucide-react. A forced
        // "vendor-ui" chunk is loaded as soon as *any* of its modules is reachable
        // from the entry (App mounts Tooltip/Toast, the landing page uses one
        // lucide icon) — which would drag every dialog, select and icon used by
        // the lazy dashboard routes back into first paint. Rollup's automatic
        // shared-chunk splitting keeps those out of the entry instead.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          // Match the heavy leaf libraries first — "react-leaflet" must not fall
          // into the react bucket.
          if (/[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return "vendor-map";
          if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap|delaunator|robust-predicates)[\\/]/.test(id)) return "vendor-charts";
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@remix-run)[\\/]/.test(id)) return "vendor-react";
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return "vendor-query";
          // clsx / tailwind-merge / cva are tiny and used by literally every
          // surface. Pinning them to the always-loaded react chunk stops Rollup's
          // small-chunk merging from parking them inside vendor-charts — which
          // made the entry preload all of recharts just to get `clsx`.
          if (/[\\/]node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/.test(id)) return "vendor-react";
          return undefined;
        },
      },
    },
  },
}));
