import { load } from "@loaders.gl/core";
import { OBJLoader } from "@loaders.gl/obj";

export async function loadModelRaw(device: GPUDevice, modelPath: string) {
  const mesh = await load(modelPath, OBJLoader);
  const vertexCount = mesh.attributes.POSITION.value.length / 3;

  const vertexData = new Float32Array(vertexCount * 6);
  for (let i = 0; i < vertexCount; i++) {
    const ri = vertexCount - 1 - i;
    const dst = ri * 6;
    vertexData[dst + 0] = mesh.attributes.POSITION.value[3 * i];
    vertexData[dst + 1] = mesh.attributes.POSITION.value[3 * i + 1];
    vertexData[dst + 2] = mesh.attributes.POSITION.value[3 * i + 2];
    vertexData[dst + 3] = mesh.attributes.NORMAL.value[3 * i];
    vertexData[dst + 4] = mesh.attributes.NORMAL.value[3 * i + 1];
    vertexData[dst + 5] = mesh.attributes.NORMAL.value[3 * i + 2];
  }

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  return { vertexBuffer, vertexCount };
}
