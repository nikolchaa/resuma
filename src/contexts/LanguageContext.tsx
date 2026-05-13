import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSection } from "@/lib/store";
import { AppLanguage, normalizeLanguage, t as translate } from "@/lib/i18n";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  t: (key: string, fallback?: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const load = async () => {
      const app = await getSection<{ language?: string }>("app");
      setLanguage(normalizeLanguage(app?.language));
    };
    load();
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: string, fallback?: string) => translate(language, key, fallback),
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return ctx;
};
