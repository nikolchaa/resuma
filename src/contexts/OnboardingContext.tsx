// onboarding/OnboardingContext.tsx
import { createContext, useContext, useEffect, useState } from "react";
import { getSection, updateSection } from "@/lib/store";

export type OnboardingState = {
  app: {
    theme: "light" | "dark" | "system";
    paperSize: "A4" | "US Letter";
    language: "en";
    contentSize: "md" | "lg";
  };
  llm: {
    model: string;
    runtime: string;
    settings: {
      threads: number;
      ctxSize: number;
      predict: number;
      gpuLayers: number;
      flashAttn: boolean;
      mlock: boolean;
      noMmap: boolean;
    };
  };
  personal: {
    fullName: string;
    email: string;
    location: string;
    headline: string;
  };
  // add other steps (education, experience, etc.) here as needed
};

const defaultState: OnboardingState = {
  app: {
    theme: "system",
    paperSize: "A4",
    language: "en",
    contentSize: "md",
  },
  llm: {
    model: "",
    runtime: "",
    settings: {
      threads: 0,
      ctxSize: 0,
      predict: 0,
      gpuLayers: 0,
      flashAttn: false,
      mlock: false,
      noMmap: false,
    },
  },
  personal: {
    fullName: "",
    email: "",
    location: "",
    headline: "",
  },
};

const OnboardingContext = createContext<{
  state: OnboardingState;
  update: <K extends keyof OnboardingState>(
    section: K,
    data: Partial<OnboardingState[K]>
  ) => void;
  apply: <K extends keyof OnboardingState>(section: K) => Promise<void>;
} | null>(null);

export const OnboardingProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<OnboardingState>(defaultState);

  useEffect(() => {
    // Load all onboarding sections in parallel
    const load = async () => {
      const app = await getSection<OnboardingState["app"]>("app");
      const llm = await getSection<OnboardingState["llm"]>("llm");
      const personal = await getSection<OnboardingState["personal"]>(
        "personal"
      );

      setState((prev) => ({
        ...prev,
        app: { ...prev.app, ...app },
        llm: { ...prev.llm, ...llm },
        personal: { ...prev.personal, ...personal },
      }));
    };

    load();
  }, []);

  const update = <K extends keyof OnboardingState>(
    section: K,
    data: Partial<OnboardingState[K]>
  ) => {
    setState((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...data,
      },
    }));
  };

  const apply = async <K extends keyof OnboardingState>(section: K) => {
    await updateSection(section, state[section]);
  };

  return (
    <OnboardingContext.Provider value={{ state, update, apply }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context)
    throw new Error("useOnboarding must be used inside OnboardingProvider");
  return context;
};
