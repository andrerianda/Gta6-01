// A module worker that paints catalogue surfaces off the main thread, so that no frame waits for
// a texture: the surface library (../surfaceMaterials.js, option `worker`) posts
// { id, name, options } and receives { id, maps } with the pixel buffers transferred, not copied.
// The recipes are plain typed-array code with no three.js and no canvas, so they run here as is.

import { createSurfaceJob } from './surfaceCatalog.js';

/**
 * Paints one surface for a request and lists the buffers to transfer with the answer.
 * @param {{id: number, name: string, options: Object}} request `options.size` is the resolution
 *   already resolved on the main thread (the worker's own detail scale stays 1).
 * @returns {{message: {id: number, maps?: import('./surfacePainter.js').SurfaceMaps, error?: string}, transfer: ArrayBuffer[]}}
 */
export function paintSurfaceRequest(request) {
  try {
    const job = createSurfaceJob(request.name, request.options);
    job.step(Infinity);
    const maps = job.maps;
    const transfer = [maps.color.buffer, maps.normal.buffer, maps.orm.buffer];
    if (maps.emissive) transfer.push(maps.emissive.buffer);
    if (maps.height) transfer.push(maps.height.buffer);
    return { message: { id: request.id, maps }, transfer };
  } catch (error) {
    return { message: { id: request.id, error: String(error?.message ?? error) }, transfer: [] };
  }
}

// Only a worker global listens (the module can also be imported by tests).
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (event) => {
    const { message, transfer } = paintSurfaceRequest(event.data);
    self.postMessage(message, transfer);
  };
}
