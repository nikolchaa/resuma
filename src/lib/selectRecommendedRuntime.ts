import { CompatibilityStatus } from "./resolveRuntime"; // adjust path if needed

export interface RuntimeEntry {
  name: string;
  label: string;
  download: string;
  /** llama.cpp build tag; installs from another build read as out of date. */
  version?: string;
  /**
   * More archives extracted into the same folder, e.g. the CUDA build's
   * cudart/cuBLAS DLLs, which llama.cpp publishes as a separate zip.
   */
  extraDownloads?: string[];
  /** Files that must exist for the install to be usable. */
  requiredFiles?: string[];
  platform: string;
  /** CPU architecture the build runs on: "x64" or "arm64". */
  arch?: string;
  backend: string;
  compatibleGpus: {
    model: string;
    status: CompatibilityStatus;
  }[];
}

interface RuntimeResult {
  runtime: RuntimeEntry;
  status: CompatibilityStatus;
}

// OpenCL is only offered for Snapdragon (Adreno) GPUs, where llama.cpp's
// OpenCL backend is tuned and its Vulkan backend is not.
const RUNTIME_PRIORITY: Record<string, number> = {
  cuda: 1,
  hip: 2,
  opencl: 3,
  vulkan: 4,
  cpu: 5,
};

/**
 * Picks the best available runtime from a list of compatibility-checked runtimes.
 */
export function selectRecommendedRuntime(
  runtimes: RuntimeResult[]
): RuntimeEntry | null {
  const confirmed = runtimes.filter((r) => r.status === "confirmed");

  if (confirmed.length === 0) return null;

  confirmed.sort((a, b) => {
    const aPriority = RUNTIME_PRIORITY[a.runtime.backend] ?? 999;
    const bPriority = RUNTIME_PRIORITY[b.runtime.backend] ?? 999;
    return aPriority - bPriority;
  });

  return confirmed[0].runtime;
}
