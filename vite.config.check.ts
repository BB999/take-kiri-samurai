// ヘッドレス動作検証用（mkcert/iwsdkDevなし・HTTP・localhost専用）
import { defineConfig } from "vite";

export default defineConfig({
  server: { host: "127.0.0.1", port: 8082, open: false },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: "./",
});
