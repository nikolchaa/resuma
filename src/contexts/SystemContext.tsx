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

// Minimal summaries of the plugin's rich per-device data. getCpuInfo/getGpuInfo
// return one entry per socket/adapter; we expose only the primary device.
type CpuSummary = {
  manufacturer: string;
  model: string;
  maxFrequency: number;
  threads: number;
};

type GpuSummary = {
  manufacturer: string;
  model: string;
  vramMb: number;
  supportsCuda: boolean;
  supportsVulkan: boolean;
};

type RamSummary = { sizeMb: number };

type OsSummary = { name: string; version: string };

// Type combining all system info
type SystemInfo = {
  cpu: CpuSummary;
  gpu: GpuSummary;
  ram: RamSummary;
  os: OsSummary;
};

const defaultSystemInfo: SystemInfo = {
  cpu: {
    manufacturer: "Detecting...",
    model: "Detecting...",
    maxFrequency: 0,
    threads: 0,
  },
  gpu: {
    manufacturer: "Detecting...",
    model: "Detecting...",
    vramMb: 0,
    supportsCuda: false,
    supportsVulkan: false,
  },
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
      const gpu = gpus[0];

      setInfo({
        cpu: {
          manufacturer: cpu?.manufacturer ?? "Unknown",
          model: cpu?.model ?? "Unknown",
          maxFrequency: cpu?.maxFrequency ?? 0,
          threads: cpu?.threads ?? 0,
        },
        gpu: {
          manufacturer: gpu?.manufacturer ?? "Unknown",
          model: gpu?.model ?? "Unknown",
          vramMb: gpu?.vramMb ?? 0,
          supportsCuda: gpu?.api.cuda ?? false,
          supportsVulkan: gpu?.api.vulkan ?? false,
        },
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
