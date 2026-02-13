import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["es", "cjs"],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  outDir: "dist",
  target: "es2020",
  treeshake: true,
  outExtensions: ({ format }) => ({
    js: format === "es" ? ".js" : ".cjs",
  }),
});
