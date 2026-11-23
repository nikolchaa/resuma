import { useEffect, useState } from "react";
import { getSection } from "@/lib/store";
import { SettingsType } from "@/contexts/OnboardingContext";
import { isAiDisabled } from "@/lib/resolveProvider";

/**
 * Whether AI actions should be offered. `null` while the setting is loading,
 * so callers can avoid flashing AI buttons that are about to disappear.
 */
export function useAiEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSection<SettingsType["llm"]>("llm")
      .then((llm) => {
        if (!cancelled) setEnabled(!isAiDisabled(llm?.provider));
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
