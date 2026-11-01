// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Local server secrets stay in process.env, never in Vite's client `define` map.
// Deployed Workers read their runtime secrets inside the request handlers.
const serverEnvironment = loadEnv(
  process.env["NODE_ENV"] === "production" ? "production" : "development",
  process.cwd(),
  "",
);
for (const key of [
  "APP_SESSION_SECRET",
  "APP_PASSWORD_HASH",
  "GOOGLE_APPS_SCRIPT_SECRET",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SCRIPT_URL",
]) {
  if (!process.env[key] && serverEnvironment[key]) process.env[key] = serverEnvironment[key];
}

export default defineConfig({
  tanstackStart: {
    ssr: false,
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
