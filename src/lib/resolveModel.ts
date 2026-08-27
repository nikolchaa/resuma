import { SystemInfo } from "@/contexts/SystemContext";
import { effectiveVramMb, selectBestGpu } from "@/lib/gpuSelection";

export type CompatibilityStatus = "gpu" | "cpu" | "unsupported";

export interface ModelEntry {
  name: string;
  label: string;
  download: string;
  quantization: string;
  size: string;
  parameters: string;
  layers: number;
  contextLength: number;
}

export interface ModelResult {
  model: ModelEntry;
  status: CompatibilityStatus;
}

export interface ModelTier {
  id: "light" | "balanced" | "heavy";
  model: ModelEntry;
}

/**
 * Curated starter models for onboarding: one per weight class. They are kept
 * as tier definitions instead of a flat model catalog — the full catalog now
 * lives on Hugging Face and is browsed live from the settings screen.
 */
export const RECOMMENDED_TIERS: ModelTier[] = [
  {
    id: "light",
    model: {
      name: "Qwen3-0.6B-Q8_0",
      label: "Qwen3 0.6B",
      download:
        "https://huggingface.co/lmstudio-community/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
      quantization: "Q8_0",
      size: "805 MB",
      parameters: "0.6B",
      layers: 28,
      contextLength: 32768,
    },
  },
  {
    id: "balanced",
    model: {
      name: "Qwen3-4B-Q6_K",
      label: "Qwen3 4B",
      download:
        "https://huggingface.co/lmstudio-community/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q6_K.gguf",
      quantization: "Q6_K",
      size: "3.31 GB",
      parameters: "4B",
      layers: 36,
      contextLength: 32768,
    },
  },
  {
    id: "heavy",
    model: {
      name: "Qwen3-14B-Q4_K_M",
      label: "Qwen3 14B",
      download:
        "https://huggingface.co/lmstudio-community/Qwen3-14B-GGUF/resolve/main/Qwen3-14B-Q4_K_M.gguf",
      quantization: "Q4_K_M",
      size: "9.00 GB",
      parameters: "14B",
      layers: 40,
      contextLength: 131072,
    },
  },
];

/** Parses "14B" style parameter labels; returns NaN for unknown formats. */
export function parseParameters(parameters: string): number {
  return parseFloat(parameters.replace("B", ""));
}

/** Hardware-fit heuristic for any model whose parameter count is known. */
export function estimateCompatibility(
  parameters: string,
  system: SystemInfo
): CompatibilityStatus {
  return evaluateFit({ parameters }, system);
}

/* ------------------------------------------------------------------ */
/* Memory-aware fit evaluation                                         */
/* ------------------------------------------------------------------ */

export interface FitInput {
  /** "14B"-style label, when one could be parsed from the name. */
  parameters?: string | null;
  /** Exact weight bytes (download size); the most reliable signal. */
  sizeBytes?: number | null;
}

/** GGUF load overhead over raw weights + KV-cache/context reservation. */
const WEIGHT_OVERHEAD = 1.15;
const CONTEXT_RESERVE_GB = 0.75;
/** Apple unified memory can wire ~75% for the GPU by default. */
const APPLE_WIRED_LIMIT = 0.75;

/** Download/weight bytes turned into the memory a runtime must hold. */
export function requiredMemoryGb(sizeBytes?: number | null): number | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  return Math.ceil((sizeBytes * WEIGHT_OVERHEAD) / 1024 ** 3 + CONTEXT_RESERVE_GB);
}

interface ParamBucket {
  matches: (paramsB: number) => boolean;
  /** VRAM needed to fully offload this class of model. */
  gpuFloorGb: number;
  /** System RAM that makes CPU inference tolerable (may scale with VRAM). */
  cpuRamGb: (vramGb: number) => number;
  /** Extra condition beyond RAM for a usable CPU verdict. */
  cpuGate?: (system: SystemInfo) => boolean;
}

// Ordered from largest down; first match wins.
const PARAM_BUCKETS: ParamBucket[] = [
  {
    matches: (p) => p > 27,
    gpuFloorGb: 20,
    cpuRamGb: (vramGb) => (vramGb >= 16 ? 32 : 64),
  },
  {
    matches: (p) => p >= 10,
    gpuFloorGb: 12,
    cpuRamGb: (vramGb) => (vramGb >= 8 ? 16 : 32),
  },
  { matches: (p) => p >= 6, gpuFloorGb: 8, cpuRamGb: () => 16 },
  { matches: (p) => p >= 3, gpuFloorGb: 6, cpuRamGb: () => 16 },
  {
    matches: (p) => p >= 1,
    gpuFloorGb: 4,
    // Small models only feel responsive on machines with enough threads.
    cpuRamGb: () => 8,
    cpuGate: (system) => (system.cpu.threads ?? 0) >= 16,
  },
  { matches: () => true, gpuFloorGb: 4, cpuRamGb: () => 1 },
];

function findBucket(paramsB: number): ParamBucket {
  return PARAM_BUCKETS.find((bucket) => bucket.matches(paramsB)) ?? PARAM_BUCKETS[PARAM_BUCKETS.length - 1];
}

/**
 * Decides GPU / CPU / unsupported for arbitrary models.
 *
 * Two signals combine:
 *  - `sizeBytes` is exact and quant-specific - Q4_K_M vs Q8_0 of the same
 *    base model differ ~2x, so per-quant verdicts come from here whenever
 *    the file size is known;
 *  - parameter count drives the coarse bucket floors used when bytes are
 *    unknown (curated tiers, repo-level hints).
 */
export function evaluateFit(
  input: FitInput,
  system: SystemInfo
): CompatibilityStatus {
  const paramsRaw = input.parameters ? parseParameters(input.parameters) : NaN;
  const paramsB = Number.isFinite(paramsRaw) ? paramsRaw : null;

  const memGb = requiredMemoryGb(input.sizeBytes);
  if (paramsB === null && memGb === null) return "unsupported";

  const ramGb = Math.ceil(system.ram.sizeMb / 1024);
  const cpuName = `${system.cpu.manufacturer} ${system.cpu.model}`.toLowerCase();

  // Score against the best adapter, never against whichever adapter happened
  // to be enumerated first - hybrid machines may list a software driver or
  // the iGPU before the real card.
  const pool = system.gpus.length ? system.gpus : [system.gpu];
  const primaryGpu = selectBestGpu(pool, system.ram.sizeMb);
  const vramGb = primaryGpu
    ? Math.round(effectiveVramMb(primaryGpu, system.ram.sizeMb) / 1024)
    : 0;

  if (cpuName.includes("apple") && /m[1-5]/.test(cpuName)) {
    let status: CompatibilityStatus | null = null;

    if (paramsB !== null) {
      const appleTier = cpuName.includes("ultra") || cpuName.includes("max")
        ? "high"
        : cpuName.includes("pro")
        ? "medium"
        : "base";

      if (appleTier === "high") {
        if (ramGb >= 64 && paramsB <= 32) status = "gpu";
        else if (ramGb >= 32 && paramsB <= 14) status = "gpu";
        else if (ramGb >= 16 && paramsB <= 7) status = "gpu";
        else if (ramGb >= 8 && paramsB <= 4) status = "gpu";
        else if (ramGb >= 8 && paramsB <= 1.7) status = "gpu";
        else status = "unsupported";
      } else if (appleTier === "medium") {
        if (ramGb >= 32 && paramsB <= 14) status = "gpu";
        else if (ramGb >= 16 && paramsB <= 7) status = "gpu";
        else if (ramGb >= 8 && paramsB <= 4) status = "gpu";
        else status = "cpu";
      } else {
        if (ramGb >= 8 && paramsB <= 4) status = "gpu";
        else status = "cpu";
      }
    }

    if (memGb !== null) {
      const wiredLimitGb = Math.floor(ramGb * APPLE_WIRED_LIMIT);
      // A tier verdict above the wired limit downgrades; without parameters,
      // exact bytes decide on their own.
      if (status === "gpu" && memGb > wiredLimitGb) status = "cpu";
      else if (status === null) {
        status = ramGb >= Math.ceil(memGb * 1.25) ? "cpu" : "unsupported";
      }
    }

    return status ?? "cpu";
  }

  const bucket = paramsB !== null ? findBucket(paramsB) : null;

  // GPU fit prefers exact bytes (quant-specific) over bucket floors.
  const gpuRequirementGb =
    memGb !== null ? memGb : bucket ? bucket.gpuFloorGb : null;

  if (gpuRequirementGb !== null && vramGb >= gpuRequirementGb) {
    return "gpu";
  }

  // CPU fallback: whichever demand is larger wins out.
  const cpuFloorFromBucket = bucket ? bucket.cpuRamGb(vramGb) : Infinity;
  const cpuNeedGb =
    memGb !== null ? Math.max(memGb, cpuFloorFromBucket) : cpuFloorFromBucket;

  if (Number.isFinite(cpuNeedGb) && ramGb >= cpuNeedGb) {
    if (bucket?.cpuGate && !bucket.cpuGate(system)) {
      return memGb !== null && ramGb >= memGb ? "cpu" : "unsupported";
    }
    return "cpu";
  }

  // No bucket match but exact bytes exist - still runnable off-GPU.
  if (memGb !== null && ramGb >= memGb) return "cpu";

  return "unsupported";
}

export interface TierResult extends ModelTier {
  status: CompatibilityStatus;
}

export function getTierResults(system: SystemInfo): TierResult[] {
  return RECOMMENDED_TIERS.map((tier) => ({
    ...tier,
    status: estimateCompatibility(tier.model.parameters, system),
  }));
}
