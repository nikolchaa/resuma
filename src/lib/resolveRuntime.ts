import { SystemInfo } from "@/contexts/SystemContext";
import runtimes from "@/data/runtimes.json";
import {
  classifyGpu,
  orderedUsableGpus,
} from "@/lib/gpuSelection";

export type CompatibilityStatus = "confirmed" | "unknown" | "unsupported";

interface CompatibleGpu {
  model: string;
  status: CompatibilityStatus;
}

interface RuntimeEntry {
  name: string;
  label: string;
  download: string;
  platform: string;
  backend: string;
  compatibleGpus: CompatibleGpu[];
}

function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .replace("authenticamd", "amd")
    .replace("advanced micro devices", "amd")
    .replace(/[^a-z0-9]/gi, "");
}

function normalizePlatform(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("windows")) return "windows";
  if (
    lower.includes("linux") ||
    lower.includes("fedora") ||
    lower.includes("arch") ||
    lower.includes("debian") ||
    lower.includes("ubuntu")
  ) {
    return "linux";
  }
  if (lower.includes("mac") || lower.includes("darwin")) return "macos";
  return "unknown";
}

/**
 * Adapters a runtime decision may be scored against, in priority order
 * (discrete > integrated > unknown-with-vulkan). Software drivers such as the
 * Microsoft Basic Display/Render Driver are excluded entirely - their API
 * probes all read false and they can never accelerate inference.
 */
function candidateGpus(system: SystemInfo) {
  const pool = system.gpus.length ? system.gpus : [system.gpu];
  return orderedUsableGpus(pool, system.ram.sizeMb).filter(
    (gpu) => classifyGpu(gpu) !== "cpu"
  );
}

export function getRuntimes(system: SystemInfo): {
  runtime: RuntimeEntry;
  status: CompatibilityStatus;
}[] {
  const platform = normalizePlatform(system.os.name);
  const candidates = candidateGpus(system);
  const typedRuntimes = runtimes as RuntimeEntry[];

  /**
   * Name/vendor matching against a runtime's curated list. Walks every usable
   * adapter best-first; null means no adapter matched anything, which for a
   * known machine is a definitive "unsupported" rather than an open question.
   */
  const nameBasedStatus = (rt: RuntimeEntry): CompatibilityStatus => {
    for (const gpu of candidates) {
      const model = normalizeModel(gpu.model);
      const vendor = normalizeModel(gpu.manufacturer);

      const match = rt.compatibleGpus.find((entry) => {
        const normalizedEntry = normalizeModel(entry.model);
        return (
          normalizedEntry === model ||
          normalizedEntry.includes(model) ||
          model.includes(normalizedEntry)
        );
      });
      if (match) return match.status;

      const fallbackMatch = rt.compatibleGpus.find((entry) => {
        const fallback = normalizeModel(entry.model);
        return (
          (fallback === "anynvidia" && vendor.includes("nvidia")) ||
          (fallback === "anyamd" && vendor.includes("amd")) ||
          (fallback === "anyintel" && vendor.includes("intel"))
        );
      });
      if (fallbackMatch) return fallbackMatch.status;
    }

    // Every usable adapter was checked against every entry (including the
    // "Any <vendor>" wildcards): none qualify.
    return "unsupported";
  };

  return typedRuntimes.map((rt) => {
    let status: CompatibilityStatus = "unsupported";

    // ❌ Incompatible platform
    if (rt.platform !== platform) {
      status = "unsupported";
    }

    // ✅ CPU is always confirmed if platform matches
    else if (rt.backend === "cpu") {
      status = "confirmed";
    }

    // ✅ Plugin-detected CUDA on any usable adapter. The probe runs through
    // nvidia-smi and only reports true for hardware with a working driver, so
    // it is trusted on its own - no static model-name list needed.
    else if (rt.backend === "cuda") {
      status = candidates.some((gpu) => gpu.supportsCuda)
        ? "confirmed"
        : "unsupported";
    }

    // ✅ Vulkan probe on any usable adapter (iGPU included - it can offload too)
    else if (rt.backend === "vulkan") {
      status = candidates.some((gpu) => gpu.supportsVulkan)
        ? "confirmed"
        : "unsupported";
    }

    // ✅ HIP: the ROCm SDK probe is authoritative. It only reports true when
    // the installed stack recognizes the adapter as a supported Radeon, which
    // ages better than a static model list; NVIDIA/iGPU adapters probe false.
    else if (rt.backend === "hip") {
      status = candidates.some((gpu) => gpu.supportsHip)
        ? "confirmed"
        : "unsupported";
    }

    // ✅ Metal: Apple silicon only; false everywhere else by definition.
    else if (rt.backend === "metal") {
      status = candidates.some((gpu) => gpu.supportsMetal)
        ? "confirmed"
        : "unsupported";
    }

    // Other/custom backends — per-adapter model/vendor match against the list
    else {
      status = nameBasedStatus(rt);
    }

    return { runtime: rt, status };
  });
}
