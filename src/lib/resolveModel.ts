import { SystemInfo } from "@/contexts/SystemContext";
import models from "@/data/models.json";

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

export function getModels(system: SystemInfo): ModelResult[] {
  const ramGb = Math.ceil(system.ram.sizeMb / 1024);
  const vramGb = Math.ceil(system.gpu.vramMb / 1024);
  const threads = system.cpu.threads ?? 0;
  const cpuName = system.cpu.model.toLowerCase();
  const isAppleSilicon =
    system.cpu.manufacturer === "Apple" && /m[1-3]/.test(cpuName);

  const appleTier = isAppleSilicon
    ? cpuName.includes("ultra") || cpuName.includes("max")
      ? "high"
      : cpuName.includes("pro")
      ? "medium"
      : "base"
    : null;

  return (models as ModelEntry[]).map((model) => {
    const paramNum = parseFloat(model.parameters.replace("B", ""));
    let status: CompatibilityStatus = "unsupported";

    if (isAppleSilicon) {
      if (appleTier === "high") {
        if (paramNum <= 32 && ramGb >= 64) status = "gpu";
        else if (paramNum <= 14 && ramGb >= 32) status = "gpu";
        else if (paramNum <= 7 && ramGb >= 16) status = "gpu";
        else if (paramNum <= 4 && ramGb >= 8) status = "gpu";
        else if (paramNum <= 1.7 && ramGb >= 8) status = "gpu";
        else if (paramNum <= 0.6) status = "cpu";
      } else if (appleTier === "medium") {
        if (paramNum <= 14 && ramGb >= 32) status = "gpu";
        else if (paramNum <= 7 && ramGb >= 16) status = "gpu";
        else if (paramNum <= 4 && ramGb >= 8) status = "gpu";
        else if (paramNum <= 1.7 && ramGb >= 8) status = "cpu";
        else if (paramNum <= 0.6) status = "cpu";
      } else {
        if (paramNum <= 4 && ramGb >= 8) status = "gpu";
        else if (paramNum <= 1.7 && ramGb >= 8) status = "cpu";
        else if (paramNum <= 0.6) status = "cpu";
      }

      return { model, status };
    }

    // Non-Apple platforms
    if (paramNum === 32) {
      const ramOk = vramGb >= 16 ? ramGb >= 32 : ramGb >= 64;
      if (vramGb >= 20) status = "gpu";
      else if (ramOk) status = "cpu";
    } else if (paramNum === 14) {
      const ramOk = vramGb >= 8 ? ramGb >= 16 : ramGb >= 32;
      if (vramGb >= 12) status = "gpu";
      else if (ramOk) status = "cpu";
    } else if (paramNum === 8) {
      if (vramGb >= 8) status = "gpu";
      else if (ramGb >= 16) status = "cpu";
    } else if (paramNum === 4) {
      if (vramGb >= 6) status = "gpu";
      else if (ramGb >= 16) status = "cpu";
    } else if (paramNum === 1.7) {
      if (vramGb >= 4) status = "gpu";
      else if (ramGb >= 8 && threads >= 16) status = "cpu";
    } else if (paramNum === 0.6) {
      status = vramGb >= 4 ? "gpu" : "cpu";
    }

    return { model, status };
  });
}
