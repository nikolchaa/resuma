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
  gpuManufacturer,
}: {
  ramGb: number | null;
  gpuVramMb: number | null;
  gpuManufacturer: string | null;
}): LLMSettings {
  const isAMD =
    gpuManufacturer?.toLowerCase().includes("amd") ||
    gpuManufacturer?.toLowerCase().includes("advanced micro devices");

  let gpuLayers = 0;
  if (gpuVramMb != null) {
    if (gpuVramMb >= 8192) {
      gpuLayers = isAMD ? 32 : 40;
    } else if (gpuVramMb >= 4096) {
      gpuLayers = 20;
    }
  }

  return {
    threads: -1,
    ctxSize: ramGb !== null && ramGb >= 16 ? 8192 : 4096,
    predict: -1,
    gpuLayers,
    flashAttn: false,
    mlock: ramGb !== null && ramGb >= 16,
    noMmap: ramGb !== null && ramGb <= 4,
  };
}
