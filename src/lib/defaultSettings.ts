import { ModelResult } from "@/lib/resolveModel";

export type LLMSettings = {
  threads: number;
  ctxSize: number;
  predict: number;
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
  const effectiveMemory = isGPU ? gpuVramMb : ramGb;

  // mlock thresholds
  const mlock = effectiveMemory != null && effectiveMemory >= (isGPU ? 8 : 16);
  // noMmap thresholds
  const noMmap = effectiveMemory != null && effectiveMemory <= (isGPU ? 4 : 4);

  let gpuLayers = 0;
  if (isGPU && model?.model?.layers) {
    gpuLayers = model.model.layers;
  }

  return {
    threads: -1,
    ctxSize: effectiveMemory !== null && effectiveMemory >= 16 ? 8192 : 4096,
    predict: -1,
    gpuLayers,
    flashAttn: false,
    mlock,
    noMmap,
  };
}
