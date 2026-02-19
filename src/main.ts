import "./style.css";
import { code, reflection } from "./teapot.slang";
import { setupOrbitCameraRaw, CAMERA_BUFFER_SIZE } from "./orbit-camera.ts";
import { loadModelRaw } from "./load-model-raw.ts";

console.log("Compiled WGSL:\n", code);
console.log("Reflection: \n", reflection);

const canvas = document.querySelector("#webgpu-canvas") as HTMLCanvasElement;

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No WebGPU adapter");
const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu") as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const maxTextureSize = device.limits.maxTextureDimension2D;

function getDrawableSize() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.min(
    maxTextureSize,
    Math.max(1, Math.floor(canvas.clientWidth * dpr)),
  );
  const height = Math.min(
    maxTextureSize,
    Math.max(1, Math.floor(canvas.clientHeight * dpr)),
  );
  return { width, height };
}

function configureContext() {
  context.configure({
    device,
    format: presentationFormat,
    alphaMode: "premultiplied",
  });
}

configureContext();

function resizeCanvas() {
  const { width, height } = getDrawableSize();
  const changed = canvas.width !== width || canvas.height !== height;
  if (changed) {
    canvas.width = width;
    canvas.height = height;
  }
  return changed;
}
resizeCanvas();

const model = await loadModelRaw(device, "/models/teapot.obj");

const shaderModule = device.createShaderModule({ code });

const cameraBuffer = device.createBuffer({
  size: CAMERA_BUFFER_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const CONTROLS_BYTE_SIZE = 64;
const controlsData = new Float32Array(CONTROLS_BYTE_SIZE / 4);
const controlsBuffer = device.createBuffer({
  size: CONTROLS_BYTE_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const { cleanup: cleanupCamera } = setupOrbitCameraRaw(
  canvas,
  {
    initPos: [-10, 4, -8, 1],
    target: [0, 1, 0, 1],
    minZoom: 8,
    maxZoom: 40,
  },
  (cameraData) => {
    device.queue.writeBuffer(
      cameraBuffer,
      0,
      cameraData.buffer,
      cameraData.byteOffset,
      cameraData.byteLength,
    );
  },
);

function flushControls() {
  controlsData[0] = 1;
  controlsData[1] = 0.7;
  controlsData[2] = 0;

  controlsData[4] = 0;
  controlsData[5] = 7;
  controlsData[6] = -7;

  controlsData[8] = 0.6;
  controlsData[9] = 0.6;
  controlsData[10] = 0.6;
  controlsData[11] = 0.5;

  controlsData[12] = 8;

  device.queue.writeBuffer(controlsBuffer, 0, controlsData);
}
flushControls();

const renderPipeline = device.createRenderPipeline({
  layout: "auto",
  vertex: {
    module: shaderModule,
    entryPoint: "vertexMain",
    buffers: [
      {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, format: "float32x3" as const, offset: 0 },
          { shaderLocation: 1, format: "float32x3" as const, offset: 12 },
        ],
      },
    ],
  },
  fragment: {
    module: shaderModule,
    entryPoint: "fragmentMain",
    targets: [{ format: presentationFormat }],
  },
  depthStencil: {
    format: "depth24plus",
    depthWriteEnabled: true,
    depthCompare: "less",
  },
  primitive: { topology: "triangle-list" },
});

const bindGroup = device.createBindGroup({
  layout: renderPipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: cameraBuffer } },
    { binding: 1, resource: { buffer: controlsBuffer } },
  ],
});

function createDepthTexture() {
  return device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

let depthTexture = createDepthTexture();

const bgColor = { r: 28 / 255, g: 28 / 255, b: 28 / 255, a: 1.0 };
let frameId: number;

function syncSurfaceSize() {
  if (!resizeCanvas()) return;
  configureContext();
  depthTexture.destroy();
  depthTexture = createDepthTexture();
}

function frame() {
  syncSurfaceSize();
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: bgColor,
        loadOp: "clear" as const,
        storeOp: "store" as const,
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.0,
      depthLoadOp: "clear" as const,
      depthStoreOp: "store" as const,
    },
  });

  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, bindGroup);
  pass.setVertexBuffer(0, model.vertexBuffer);
  pass.draw(model.vertexCount);
  pass.end();

  device.queue.submit([encoder.finish()]);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

const resizeObserver = new ResizeObserver(() => {
  syncSurfaceSize();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  cameraBuffer.destroy();
  controlsBuffer.destroy();
  model.vertexBuffer.destroy();
  depthTexture.destroy();
}
