import {
  useContext,
  useEffect,
  useState,
  createContext,
  ReactNode,
} from "react";
import {
  getCpuInfo,
  getGpuInfo,
  getMemoryInfo,
  getOsInfo,
} from "tauri-plugin-hwinfo";
import { GpuHardwareKind, selectBestGpu } from "@/lib/gpuSelection";

// Minimal summaries of the plugin's rich per-device data. getCpuInfo returns
// one entry per socket; getGpuInfo returns every display adapter, so the
// context exposes the full list plus the single "primary" adapter hardware
// decisions should be made against (discrete > integrated > software driver).
type CpuSummary = {
  manufacturer: string;
  model: string;
  maxFrequency: number;
  threads: number;
};

type GpuSummary = {
  manufacturer: string;
  model: string;
  /** Memory reserved exclusively for this adapter. */
  vramMb: number;
  /** System memory the adapter may borrow (iGPU shared budget). */
  sharedMemoryMb: number;
  kind: GpuHardwareKind;
  supportsCuda: boolean;
  supportsVulkan: boolean;
  /** Live probe: is this adapter visible to the installed HIP/ROCm stack? */
  supportsHip: boolean;
  supportsMetal: boolean;
};

type RamSummary = { sizeMb: number };

type OsSummary = { name: string; version: string };

// Type combining all system info
type SystemInfo = {
  cpu: CpuSummary;
  gpus: GpuSummary[];
  /** Primary adapter: best discrete/iGPU, chosen by gpuSelection rules. */
  gpu: GpuSummary;
  ram: RamSummary;
  os: OsSummary;
};

const placeholderGpu: GpuSummary = {
  manufacturer: "Detecting...",
  model: "Detecting...",
  vramMb: 0,
  sharedMemoryMb: 0,
  kind: "unknown",
  supportsCuda: false,
  supportsVulkan: false,
  supportsHip: false,
  supportsMetal: false,
};

const defaultSystemInfo: SystemInfo = {
  cpu: {
    manufacturer: "Detecting...",
    model: "Detecting...",
    maxFrequency: 0,
    threads: 0,
  },
  gpus: [],
  gpu: placeholderGpu,
  ram: { sizeMb: 0 },
  os: { name: "Detecting...", version: "Detecting..." },
};

const SystemContext = createContext<SystemInfo | null>(null);

export function SystemProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<SystemInfo>(defaultSystemInfo);

  useEffect(() => {
    async function fetchSystem() {
      const [cpus, gpus, ram, os] = await Promise.all([
        getCpuInfo(),
        getGpuInfo({ detail: "capabilities" }),
        getMemoryInfo(),
        getOsInfo(),
      ]);
      const cpu = cpus[0];

      const summaries: GpuSummary[] = (gpus ?? []).map((gpu) => ({
        manufacturer: gpu.manufacturer ?? "Unknown",
        model: gpu.model ?? "Unknown",
        vramMb: gpu.vramMb ?? 0,
        sharedMemoryMb: gpu.sharedMemoryMb ?? 0,
        kind: gpu.kind ?? "unknown",
        supportsCuda: gpu.api?.cuda ?? false,
        supportsVulkan: gpu.api?.vulkan ?? false,
        supportsHip: gpu.api?.hip ?? false,
        supportsMetal: gpu.api?.metal ?? false,
      }));

      // The primary is the adapter offloading decisions are scored against.
      // Machines with only a software driver keep it visible for display but
      // its kind ("cpu") keeps every GPU-compat estimate grounded at zero.
      const primary =
        selectBestGpu(summaries, ram.totalMb) ?? summaries[0] ?? placeholderGpu;

      setInfo({
        cpu: {
          manufacturer: cpu?.manufacturer ?? "Unknown",
          model: cpu?.model ?? "Unknown",
          maxFrequency: cpu?.maxFrequency ?? 0,
          threads: cpu?.threads ?? 0,
        },
        gpus: summaries,
        gpu: primary,
        ram: { sizeMb: ram.totalMb },
        os: { name: os.name, version: os.version },
      });
    }

    fetchSystem();
  }, []);

  return (
    <SystemContext.Provider value={info}>{children}</SystemContext.Provider>
  );
}

export function useSystem() {
  const context = useContext(SystemContext);
  if (!context) throw new Error("useSystem must be used within SystemProvider");
  return context;
}

export type { SystemInfo };
