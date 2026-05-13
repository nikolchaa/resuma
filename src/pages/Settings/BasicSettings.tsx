import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { applyContentSizeClass } from "@/lib/ui";
import { useEffect, useState } from "react";
import { SettingsType } from "@/contexts/OnboardingContext";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import modelList from "@/data/models.json";
import { updateSection } from "@/lib/store";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppLanguage } from "@/lib/i18n";

type Props = {
  settings: SettingsType["app"];
  draftSettings: SettingsType;
  setDraftSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
};

export const BasicSettings = ({
  settings,
  draftSettings,
  setDraftSettings,
  setSettings,
}: Props) => {
  const { theme, paperSize, language, contentSize } = settings;
  const { setTheme } = useTheme();
  const { t, setLanguage } = useLanguage();

  const [runOnce, setRunOnce] = useState(false);

  useEffect(() => {
    if (!runOnce) {
      // Fix the flashing issue upon opening settings
      setRunOnce(true);
      return;
    }
    setTheme(theme);
    applyContentSizeClass(contentSize);
  }, [theme, contentSize, setTheme]);

  const handleChange = async (
    key: keyof SettingsType["app"],
    value: string,
  ) => {
    // 1) Update local React state
    setDraftSettings((prev) => ({
      ...prev,
      app: { ...prev.app, [key]: value },
    }));
    setSettings((prev) => ({
      ...prev,
      app: { ...prev.app, [key]: value },
    }));

    // 2) Apply to the running UI immediately
    if (key === "theme") setTheme(value as "light" | "dark" | "system");
    if (key === "contentSize") applyContentSizeClass(value as "md" | "lg");
    if (key === "language") setLanguage(value as AppLanguage);

    // 3) Persist to settings.dat
    try {
      await updateSection("app", { ...draftSettings.app, [key]: value });
    } catch (err) {
      showError(
        "Failed to save settings",
        (err as Error).message || "An unexpected error occurred",
      );
    }
  };

  const handleExport = async () => {
    try {
      const filePath = await save({
        filters: [{ name: "Resuma Settings", extensions: ["resuma"] }],
        defaultPath: "settings.resuma",
      });

      if (!filePath) {
        showWarning(t("toast.exportCanceled"));
        return;
      }

      const { llm, ...rest } = draftSettings;
      const exportData = {
        ...rest,
        llm: {
          ...llm,
          model: "",
          runtime: "",
        },
      };
      const content = JSON.stringify(exportData, null, 2);
      await writeTextFile(filePath, content);

      showSuccess(t("settings.app.exportSuccess"), `Saved at: ${filePath}`);
    } catch (error) {
      showError(
        "Export failed",
        (error as Error).message || "An unexpected error occurred.",
      );
    }
  };

  const handleImport = async () => {
    try {
      const selected = await open({
        filters: [{ name: "Resuma Settings", extensions: ["resuma"] }],
        multiple: false,
      });

      if (!selected) {
        showWarning(t("settings.app.importCanceled"));
        return;
      }

      if (typeof selected === "string") {
        const content = await readTextFile(selected);
        const parsed = JSON.parse(content);

        setDraftSettings((prev) => {
          const currentModelId = prev.llm.model;
          const modelMeta = modelList.find((m) => m.name === currentModelId);
          const maxGpuLayers = modelMeta?.layers || prev.llm.settings.gpuLayers;

          const parsedSettings = {
            ...parsed,
            llm: {
              ...parsed.llm,
              model: currentModelId,
              runtime: prev.llm.runtime,
              settings: {
                ...parsed.llm.settings,
                gpuLayers: Math.min(
                  parsed.llm.settings.gpuLayers,
                  maxGpuLayers,
                ),
              },
            },
          };

          return { ...prev, ...parsedSettings };
        });

        showSuccess(
          t("settings.app.importSuccess"),
          `Imported from: ${selected}`,
        );
      }
    } catch (error) {
      showError(
        "Import failed",
        (error as Error).message || "An unexpected error occurred.",
      );
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Theme */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("settings.theme")}</Label>
        <Select value={theme} onValueChange={(v) => handleChange("theme", v)}>
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder={t("settings.theme.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='light'>{t("settings.theme.light")}</SelectItem>
            <SelectItem value='dark'>{t("settings.theme.dark")}</SelectItem>
            <SelectItem value='system'>{t("settings.theme.system")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Paper Size */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("settings.paper")}</Label>
        <Select
          value={paperSize}
          onValueChange={(v) => handleChange("paperSize", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder={t("settings.paper.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='A4'>A4</SelectItem>
            <SelectItem value='US'>{t("settings.paper.us")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Language */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("settings.language")}</Label>
        <Select
          value={language}
          onValueChange={(v) => handleChange("language", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder={t("settings.language.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='en'>{t("common.language.english")}</SelectItem>
            <SelectItem value='rs'>{t("common.language.serbian")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content Size */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("settings.contentSize")}</Label>
        <Select
          value={contentSize}
          onValueChange={(v) => handleChange("contentSize", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder={t("settings.contentSize.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='md'>
              {t("settings.contentSize.normal")}
            </SelectItem>
            <SelectItem value='lg'>
              {t("settings.contentSize.large")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <span className='text-sm text-muted-foreground'>
        {t("settings.app.importExportDescription")}
      </span>

      {/* Import/Export Buttons */}
      <div className='flex gap-4'>
        <Button variant='outline' onClick={handleImport}>
          {t("settings.app.import")}
        </Button>
        <Button variant='default' onClick={handleExport}>
          {t("settings.app.export")}
        </Button>
      </div>

      <span className='text-sm text-muted-foreground'>
        {t("settings.app.opensource")}{" "}
        <a
          href='https://github.com/nikolchaa/resuma'
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary underline'
        >
          GitHub
        </a>
        .
      </span>
    </div>
  );
};
