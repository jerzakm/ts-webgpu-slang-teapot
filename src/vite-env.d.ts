/// <reference types="vite/client" />

declare module "*.slang" {
  const shaderCode: string;
  export default shaderCode;
  export const code: string;
  export const reflection: unknown;
}
