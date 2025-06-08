import { ModelResult, ModelEntry } from "@/lib/resolveModel";

export type ModelSelection = {
  model: ModelEntry;
  status: "gpu" | "cpu";
} | null;

export function selectRecommendedModel(models: ModelResult[]): ModelSelection {
  const fallback06b = models.find(
    (m) =>
      m.model.parameters === "0.6B" &&
      (m.status === "gpu" || m.status === "cpu")
  );

  return fallback06b
    ? {
        model: fallback06b.model,
        status: fallback06b.status as "gpu" | "cpu",
      }
    : null;
}
