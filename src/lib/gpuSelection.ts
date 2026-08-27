/**
 * Adapter prioritisation for hardware-fit decisions.
 *
 * The hardware scanner reports every display adapter along with a coarse
 * classification (`kind`). Consumers previously looked at `gpus[0]`, which on
 * hybrid setups is often the *Microsoft Basic Display Driver* or the integrated
 * GPU, dragging every compatibility verdict down to CPU-only.
 *
 * Priority used everywhere below:
 *
 *     discrete dGPU  >  integrated iGPU  >  unusable (software driver / VM)
 */

export type GpuHardwareKind =
  | "discrete"
  | "integrated"
  | "virtual"
  | "cpu"
  | "unknown";

/** Structural subset of a scanned adapter; contexts satisfy this shape. */
export interface GpuLike {
  manufacturer: string;
  model: string;
  /** Memory reserved exclusively for this adapter. */
  vramMb: number;
  /** System memory the adapter may borrow (relevant for iGPUs). */
  sharedMemoryMb: number;
  kind: GpuHardwareKind;
  supportsVulkan?: boolean;
}

/** Windows WARP-style drivers and llvmpipe are renderers, not accelerators. */
const SOFTWARE_DEVICE_RE =
  /basic (?:display|render) driver|microsoft basic|llvmpipe|\bwarp\b/i;

/**
 * Resolves an adapter's class. Trusts the scanner's `kind` where definitive,
 * then falls back to well-known product-name families, because the scanner can
 * report `"unknown"` on machines whose PCI database lookup failed.
 */
export function classifyGpu(gpu: GpuLike): GpuHardwareKind {
  const declared = gpu.kind?.toLowerCase();

  if (declared === "discrete" || declared === "integrated") return declared;

  const lower = `${gpu.manufacturer} ${gpu.model}`
    .toLowerCase()
    .replace(/\(tm\)|\(r\)|inc\.?/g, "");

  // Never usable for inference - renders on the CPU through a stub driver.
  if (declared === "cpu" || SOFTWARE_DEVICE_RE.test(lower)) return "cpu";
  if (declared === "virtual") return "virtual";

  if (
    /\bnvidia\b|geforce|quadro|tesla|\brtx\b|\bgtx\b/.test(lower)
  ) {
    return "discrete";
  }

  // Intel Arc / AMD RX-family are always add-in boards.
  if (/\barc\b|\bradeon\s*(rx|pro|wx|vii)\b|\binstinct\b/.test(lower)) {
    return "discrete";
  }

  // Remaining Intel parts named "... Graphics" (Iris/UHD/HD) are soldered.
  if (/\bintel\b/.test(lower) && /(iris|uhd|hd graphics|graphics)/.test(lower)) {
    return "integrated";
  }

  // AMD chips without the RX branding are APUs: "Radeon(TM) Graphics", "Radeon 680M".
  if (/\bradeon\b|\bvega\b/.test(lower)) return "integrated";

  return "unknown";
}

/** Selection rank; null means the adapter must never drive offload estimates. */
function usableRank(
  gpu: GpuLike,
  kind: GpuHardwareKind
): number | null {
  switch (kind) {
    case "discrete":
      return 0;
    case "integrated":
      return 1;
    case "unknown":
      // Unrecognised but Vulkan-capable silicon may still offload.
      return gpu.supportsVulkan ? 2 : null;
    default:
      return null;
  }
}

/**
 * VRAM an offloader may realistically use.
 *
 * Discrete adapters report their own memory. Integrated GPUs often report tiny
 * carve-outs (or zero), while their real budget is borrowed system RAM - capped
 * at half of total memory so estimates stay honest about sharing bandwidth
 * with the OS.
 */
export function effectiveVramMb(gpu: GpuLike, totalRamMb: number): number {
  const kind = classifyGpu(gpu);
  const dedicated = Math.max(0, gpu.vramMb || 0);

  if (kind === "discrete") return dedicated;

  if (kind === "integrated" || kind === "unknown") {
    const halfRam = Math.floor(totalRamMb / 2);
    const quarterRam = Math.floor(totalRamMb / 4);
    const borrowable = Math.min(Math.max(0, gpu.sharedMemoryMb || 0), quarterRam);
    return Math.min(halfRam, Math.max(dedicated, borrowable));
  }

  return 0;
}

/**
 * Picks the adapter a decision should be made against: lowest
 * discrete > integrated > unknown-with-vulkan rank wins; ties resolve to the
 * largest effective VRAM. Software drivers never qualify.
 */
export function selectBestGpu<T extends GpuLike>(
  gpus: T[],
  totalRamMb: number
): T | null {
  let best: { gpu: T; rank: number; vram: number } | null = null;

  for (const gpu of gpus) {
    const kind = classifyGpu(gpu);
    const rank = usableRank(gpu, kind);
    if (rank === null) continue;

    const vram = effectiveVramMb(gpu, totalRamMb);

    if (
      !best ||
      rank < best.rank ||
      (rank === best.rank && vram > best.vram)
    ) {
      best = { gpu, rank, vram };
    }
  }

  return best?.gpu ?? null;
}

/** True when at least one usable accelerator exists on the machine. */
export function hasUsableGpu<T extends GpuLike>(
  gpus: T[],
  totalRamMb: number
): boolean {
  return selectBestGpu(gpus, totalRamMb) !== null;
}

/** All adapters worth evaluating, priority order (best first). */
export function orderedUsableGpus<T extends GpuLike>(
  gpus: T[],
  totalRamMb: number
): T[] {
  return gpus
    .map((gpu) => ({
      gpu,
      rank: usableRank(gpu, classifyGpu(gpu)),
      vram: effectiveVramMb(gpu, totalRamMb),
    }))
    .filter((entry) => entry.rank !== null)
    .sort((a, b) => a.rank! - b.rank! || b.vram - a.vram)
    .map((entry) => entry.gpu);
}

interface RamBearing {
  ram: { sizeMb: number };
  gpus?: GpuLike[];
  gpu?: GpuLike | null;
}

/**
 * Human-readable name of the adapter decisions are made against, or null when
 * only software drivers / nothing were detected. Keeps spec displays from
 * proudly announcing "Microsoft Basic Display Driver".
 */
export function describePrimaryGpu(system: RamBearing): string | null {
  const totalRamMb = system.ram.sizeMb;
  const pool = system.gpus?.length
    ? system.gpus
    : system.gpu
    ? [system.gpu]
    : [];

  const usable = pool.filter((g) => !(classifyGpu(g) === "cpu"));
  const reference = usable[0];
  if (!reference) return null;

  const best = selectBestGpu(usable, totalRamMb) ?? reference;
  const vramGb = Math.round(effectiveVramMb(best, totalRamMb) / 1024);

  return vramGb > 0 ? `${best.model} (${vramGb} GB)` : best.model;
}
