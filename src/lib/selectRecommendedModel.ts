import { TierResult } from "@/lib/resolveModel";

export type TierSelection = TierResult | null;

const GPU_PREFERENCE = ["heavy", "balanced", "light"] as const;
const CPU_PREFERENCE = ["light", "balanced", "heavy"] as const;

/**
 * Picks the strongest tier that can still offload to the GPU. Without a
 * usable GPU the lightest runnable model wins — CPU-only inference feels
 * best on small models.
 */
export function selectRecommendedTier(tiers: TierResult[]): TierSelection {
  const findTier = (
    order: readonly string[],
    status: "gpu" | "cpu"
  ): TierSelection => {
    for (const id of order) {
      const tier = tiers.find((entry) => entry.id === id);
      if (tier && tier.status === status) return tier;
    }
    return null;
  };

  return (
    findTier(GPU_PREFERENCE, "gpu") ??
    findTier(CPU_PREFERENCE, "cpu") ??
    null
  );
}
