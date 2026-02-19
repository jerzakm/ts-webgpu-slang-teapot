# Tiny TypeScript + WebGPU + Slang Example

This project is a tiny example of how you can use the Slang shader language in a TypeScript WebGPU app.

It uses:

- TypeScript + Vite for the app/runtime
- WebGPU for rendering
- `vite-slang` to import `.slang` files and compile them to WGSL at build/dev time



## Run

```bash
pnpm install
pnpm dev
```

Then open the local Vite URL in a WebGPU-capable browser.


Huge credit for Cody for https://github.com/CodyJasonBennett/vite-slang
Teapot scene adapted from: https://docs.swmansion.com/TypeGPU/examples/#example=rendering--phong-reflection
