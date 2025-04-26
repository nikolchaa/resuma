import { SystemInfo } from "@/contexts/SystemContext";
import runtimes from "@/data/runtimes.json";

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
  if (lower.includes("linux")) return "linux";
  if (lower.includes("mac") || lower.includes("darwin")) return "macos";
  return "unknown";
}

export function getRuntimes(system: SystemInfo): {
  runtime: RuntimeEntry;
  status: CompatibilityStatus;
}[] {
  const model = normalizeModel(system.gpu.model);
  const vendor = normalizeModel(system.gpu.manufacturer);
  const platform = normalizePlatform(system.os.name);
  const typedRuntimes = runtimes as RuntimeEntry[];

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

    // ✅ Use plugin-detected support for CUDA/Vulkan
    else if (rt.backend === "cuda") {
      status = system.gpu.supportsCuda ? "confirmed" : "unsupported";
    } else if (rt.backend === "vulkan") {
      status = system.gpu.supportsVulkan ? "confirmed" : "unsupported";
    }

    // ✅ HIP or other backends — check model/vendor match
    else {
      const match = rt.compatibleGpus.find((gpu) => {
        const normalizedGpu = normalizeModel(gpu.model);
        return (
          normalizedGpu === model ||
          normalizedGpu.includes(model) ||
          model.includes(normalizedGpu)
        );
      });

      if (match) {
        status = match.status;
      } else {
        const fallbackMatch = rt.compatibleGpus.find((gpu) => {
          const fallback = normalizeModel(gpu.model);
          return (
            (fallback === "anynvidia" && vendor.includes("nvidia")) ||
            (fallback === "anyamd" && vendor.includes("amd")) ||
            (fallback === "anyintel" && vendor.includes("intel"))
          );
        });

        if (fallbackMatch) {
          status = fallbackMatch.status;
        }
      }
    }

    return { runtime: rt, status };
  });
}
