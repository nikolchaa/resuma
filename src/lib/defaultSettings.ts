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
  const effectiveMemory = isGPU
    ? gpuVramMb != null
      ? Math.round(gpuVramMb / 1024)
      : null // Convert MB → GB
    : ramGb != null
    ? Math.round(ramGb)
    : null; // Convert 31.92GB → 32GB

  // mlock thresholds
  const mlock = effectiveMemory != null && effectiveMemory >= (isGPU ? 8 : 16);
  // noMmap thresholds
  const noMmap = effectiveMemory != null && effectiveMemory <= (isGPU ? 4 : 4);
  // ctxSize thresholds
  const ctxSize =
    effectiveMemory !== null && effectiveMemory >= 16 ? 8192 : 4096;

  let gpuLayers = 0;
  if (isGPU && model?.model?.layers) {
    gpuLayers = model.model.layers;
  }

  return {
    ctxSize,
    gpuLayers,
    flashAttn: false,
    mlock,
    noMmap,
  };
}
