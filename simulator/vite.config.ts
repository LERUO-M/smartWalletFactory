import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Runs on :5173 so it never clashes with the backend on :3000.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
