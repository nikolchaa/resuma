import { ModelResult, ModelEntry } from "@/lib/resolveModel";

function parseParams(paramStr: string): number {
  const match = paramStr.toLowerCase().match(/([\d.]+)b/);
  return match ? parseFloat(match[1]) : 0;
}

export type ModelSelection = {
  model: ModelEntry;
  status: "gpu" | "cpu";
} | null;

export function selectRecommendedModel(
  models: ModelResult[]
): { model: ModelEntry; status: "gpu" | "cpu" } | null {
  const gpuCompatible = models
    .filter((m) => m.status === "gpu")
    .sort(
      (a, b) =>
        parseParams(b.model.parameters) - parseParams(a.model.parameters)
    );

  if (gpuCompatible.length > 0) {
    return {
      model: gpuCompatible[0].model,
      status: "gpu",
    };
  }

  const cpuCompatible = models.filter((m) => m.status === "cpu");
  const prefers17b = cpuCompatible.find((m) => m.model.parameters === "1.7B");
  const fallback06b = cpuCompatible.find((m) => m.model.parameters === "0.6B");

  if (prefers17b) {
    return { model: prefers17b.model, status: "cpu" };
  }

  if (fallback06b) {
    return { model: fallback06b.model, status: "cpu" };
  }

  return null;
}
