import { defineConfig } from "vite";
import slang from "vite-slang";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/ts-webgpu-slang-teapot/" : "/",
  plugins: [
    slang({
      filter: /\.slang(?:\?.*)?$/,
    }),
  ],
}));