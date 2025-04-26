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
  getOsInfo,
  getRamInfo,
  CpuInfo,
  GpuInfo,
  OsInfo,
  RamInfo,
} from "tauri-plugin-hwinfo";

// Type combining all system info
type SystemInfo = {
  cpu: CpuInfo;
  gpu: GpuInfo;
  ram: RamInfo;
  os: OsInfo;
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
      const [cpu, gpu, ram, os] = await Promise.all([
        getCpuInfo(),
        getGpuInfo(),
        getRamInfo(),
        getOsInfo(),
      ]);
      setInfo({ cpu, gpu, ram, os });
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
