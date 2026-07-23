import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "standalone"),
  publicDir: path.resolve(__dirname, "public"),
  base: "/kleins-duke-map/",
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "standalone-dist"),
    emptyOutDir: true,
  },
});
