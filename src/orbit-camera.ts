import * as m from "wgpu-matrix";

export interface CameraOptions {
  initPos: [number, number, number, number];
  target?: [number, number, number, number];
  minZoom?: number;
  maxZoom?: number;
  invertCamera?: boolean;
}

/**
 * Camera uniform layout (288 bytes / 72 floats):
 *   position:            floats  0-3   (vec4f,   16 bytes)
 *   targetPos:           floats  4-7   (vec4f,   16 bytes)
 *   view:                floats  8-23  (mat4x4f, 64 bytes)
 *   projection:          floats 24-39  (mat4x4f, 64 bytes)
 *   viewInverse:         floats 40-55  (mat4x4f, 64 bytes)
 *   projectionInverse:   floats 56-71  (mat4x4f, 64 bytes)
 */
export const CAMERA_BUFFER_SIZE = 288;

export type CameraCallback = (data: Float32Array) => void;

const defaults: Required<Omit<CameraOptions, "initPos">> = {
  target: [0, 0, 0, 1],
  minZoom: 1,
  maxZoom: 100,
  invertCamera: false,
};

export function setupOrbitCameraRaw(
  canvas: HTMLCanvasElement,
  partialOptions: CameraOptions,
  callback: CameraCallback,
) {
  const options = { ...defaults, ...partialOptions } as Required<CameraOptions>;

  const state = {
    target: new Float32Array(options.target),
    radius: 0,
    pitch: 0,
    yaw: 0,
  };

  const tmpView = new Float32Array(16);
  const tmpProj = new Float32Array(16);
  const tmpViewInv = new Float32Array(16);
  const tmpProjInv = new Float32Array(16);
  const tmpTranspose = new Float32Array(16);
  const cameraData = new Float32Array(CAMERA_BUFFER_SIZE / 4);

  function transposeAndWrite(dst: Float32Array, offset: number, src: Float32Array) {
    m.mat4.transpose(src, tmpTranspose);
    dst.set(tmpTranspose, offset);
  }

  function writeCameraToBuffer(
    pos: ArrayLike<number>,
    tgt: ArrayLike<number>,
    view: Float32Array,
    proj: Float32Array,
    viewInv: Float32Array,
    projInv: Float32Array,
  ) {
    cameraData[0] = pos[0];
    cameraData[1] = pos[1];
    cameraData[2] = pos[2];
    cameraData[3] = pos[3] ?? 1;

    cameraData[4] = tgt[0];
    cameraData[5] = tgt[1];
    cameraData[6] = tgt[2];
    cameraData[7] = tgt[3] ?? 1;

    transposeAndWrite(cameraData, 8, view);
    transposeAndWrite(cameraData, 24, proj);
    transposeAndWrite(cameraData, 40, viewInv);
    transposeAndWrite(cameraData, 56, projInv);

    callback(cameraData);
  }

  function computeView(pos: ArrayLike<number>, tgt: ArrayLike<number>) {
    m.mat4.lookAt(pos, tgt, [0, 1, 0], tmpView);
  }

  function computeProj(aspect: number) {
    m.mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, tmpProj);
  }

  function computeInverses() {
    m.mat4.invert(tmpView, tmpViewInv);
    m.mat4.invert(tmpProj, tmpProjInv);
  }

  function calculatePos(): [number, number, number, number] {
    const x = state.radius * Math.sin(state.yaw) * Math.cos(state.pitch);
    const y = state.radius * Math.sin(state.pitch);
    const z = state.radius * Math.cos(state.yaw) * Math.cos(state.pitch);
    return [
      state.target[0] + x,
      state.target[1] + y,
      state.target[2] + z,
      1,
    ];
  }

  function clamp(v: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, v));
  }

  function targetCamera(
    newPos: [number, number, number, number],
    newTarget: [number, number, number, number],
  ) {
    const dx = newPos[0] - newTarget[0];
    const dy = newPos[1] - newTarget[1];
    const dz = newPos[2] - newTarget[2];
    state.radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
    state.yaw = Math.atan2(dx, dz);
    state.pitch = Math.asin(dy / state.radius);
    state.target.set(newTarget);

    computeView(newPos, newTarget);
    computeProj(canvas.clientWidth / canvas.clientHeight);
    computeInverses();
    writeCameraToBuffer(newPos, newTarget, tmpView, tmpProj, tmpViewInv, tmpProjInv);
  }

  targetCamera(options.initPos, options.target);

  function rotateCamera(dx: number, dy: number) {
    const sens = 0.005;
    const inv = options.invertCamera ? -1 : 1;
    state.yaw += -dx * sens * inv;
    state.pitch += dy * sens * inv;
    state.pitch = clamp(state.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    const pos = calculatePos();
    computeView(pos, state.target);
    m.mat4.invert(tmpView, tmpViewInv);
    writeCameraToBuffer(pos, state.target, tmpView, tmpProj, tmpViewInv, tmpProjInv);
  }

  function zoomCamera(delta: number) {
    state.radius = clamp(state.radius + delta * 0.05, options.minZoom, options.maxZoom);
    const pos = calculatePos();
    computeView(pos, state.target);
    m.mat4.invert(tmpView, tmpViewInv);
    writeCameraToBuffer(pos, state.target, tmpView, tmpProj, tmpViewInv, tmpProjInv);
  }

  const resizeObserver = new ResizeObserver(() => {
    computeProj(canvas.clientWidth / canvas.clientHeight);
    m.mat4.invert(tmpProj, tmpProjInv);
    const pos = calculatePos();
    writeCameraToBuffer(pos, state.target, tmpView, tmpProj, tmpViewInv, tmpProjInv);
  });
  resizeObserver.observe(canvas);

  let isDragging = false;
  let prevX = 0;
  let prevY = 0;
  let lastPinchDist = 0;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomCamera(e.deltaY);
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    prevX = e.clientX;
    prevY = e.clientY;
  };
  canvas.addEventListener("mousedown", onMouseDown);

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      isDragging = true;
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  };
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });

  const onMouseUp = () => {
    isDragging = false;
  };
  window.addEventListener("mouseup", onMouseUp);

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging = true;
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
    } else {
      isDragging = false;
    }
  };
  window.addEventListener("touchend", onTouchEnd);

  const onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    if (isDragging) rotateCamera(dx, dy);
  };
  window.addEventListener("mousemove", onMouseMove);

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - prevX;
      const dy = e.touches[0].clientY - prevY;
      prevX = e.touches[0].clientX;
      prevY = e.touches[0].clientY;
      rotateCamera(dx, dy);
    }
  };
  window.addEventListener("touchmove", onTouchMove, { passive: false });

  const onCanvasTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const pinchDist = Math.sqrt(dx * dx + dy * dy);
      zoomCamera((lastPinchDist - pinchDist) * 0.5);
      lastPinchDist = pinchDist;
    }
  };
  canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });

  function cleanup() {
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    resizeObserver.unobserve(canvas);
  }

  return { cleanup, targetCamera };
}
