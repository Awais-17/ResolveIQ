import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../../"),
  server: { port: 5174, strictPort: false },
  build: { outDir: "dist", sourcemap: false },
});
