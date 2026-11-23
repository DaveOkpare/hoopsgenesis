import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  server: {
    port: 3001,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    varlockVitePlugin({ ssrInjectMode: "resolved-env" }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
  // Deployments run the standalone build artifact, so bundle every server
  // dependency at build time. In dev this must stay off: inlining CommonJS
  // packages such as react into Vite's module runner fails with
  // "module is not defined".
  ssr: {
    noExternal: command === "build" ? true : undefined,
  },
}));
