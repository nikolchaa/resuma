import { ModelResult } from "@/lib/resolveModel";

export type LLMSettings = {
  ctxSize: number;
  gpuLayers: number;
  flashAttn: boolean;
  mlock: boolean;
  noMmap: boolean;
};

export function getAdaptiveSettings({
  ramGb,
  gpuVramMb,
  model,
}: {
  ramGb: number | null;
  gpuVramMb: number | null;
  model: ModelResult | null;
}): LLMSettings {
  const isGPU = model?.status === "gpu";
  const modelEntry = model?.model;

  const effectiveMemory = isGPU
    ? gpuVramMb != null
      ? Math.ceil(gpuVramMb / 1024) // MB → GB
      : null
    : ramGb != null
    ? Math.ceil(ramGb)
    : null;

  const mlock = effectiveMemory != null && effectiveMemory >= (isGPU ? 8 : 16);
  const noMmap = effectiveMemory != null && effectiveMemory <= 4;
  const ctxSize = effectiveMemory != null && effectiveMemory >= 16 ? 8192 : 4096;

  let gpuLayers = 0;
  if (isGPU && modelEntry?.layers) {
    gpuLayers = modelEntry.layers;
  }

  return {
    ctxSize,
    gpuLayers,
    flashAttn: false,
    mlock,
    noMmap,
  };
}