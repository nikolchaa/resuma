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
    value: string
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

    // 3) Persist to settings.dat
    try {
      await updateSection("app", { ...draftSettings.app, [key]: value });
    } catch (err) {
      showError(
        "Failed to save settings",
        (err as Error).message || "An unexpected error occurred"
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
        showWarning("Export canceled");
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

      showSuccess("Settings exported successfully", `Saved at: ${filePath}`);
    } catch (error) {
      showError(
        "Export failed",
        (error as Error).message || "An unexpected error occurred."
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
        showWarning("Import canceled");
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
                  maxGpuLayers
                ),
              },
            },
          };

          return { ...prev, ...parsedSettings };
        });

        showSuccess(
          "Settings imported successfully",
          `Imported from: ${selected}`
        );
      }
    } catch (error) {
      showError(
        "Import failed",
        (error as Error).message || "An unexpected error occurred."
      );
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Theme */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Theme</Label>
        <Select value={theme} onValueChange={(v) => handleChange("theme", v)}>
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder='Select theme' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='light'>Light</SelectItem>
            <SelectItem value='dark'>Dark</SelectItem>
            <SelectItem value='system'>System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Paper Size */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Paper Format</Label>
        <Select
          value={paperSize}
          onValueChange={(v) => handleChange("paperSize", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder='Select paper size' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='A4'>A4</SelectItem>
            <SelectItem value='US'>US Letter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Language */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Language</Label>
        <Select value={language} disabled>
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder='Select language' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='en'>English (EN)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content Size */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Content Size</Label>
        <Select
          value={contentSize}
          onValueChange={(v) => handleChange("contentSize", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue placeholder='Select content size' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='md'>Normal (100%)</SelectItem>
            <SelectItem value='lg'>Large (125%)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <span className='text-sm text-muted-foreground'>
        Import and export settings along with your data. This will not overwrite
        your current settings and data. It's a good idea to back up your
        settings and data before importing.
      </span>

      {/* Import/Export Buttons */}
      <div className='flex gap-4'>
        <Button variant='outline' onClick={handleImport}>
          Import Settings
        </Button>
        <Button variant='default' onClick={handleExport}>
          Export Settings
        </Button>
      </div>

      <span className='text-sm text-muted-foreground'>
        Resuma is open-source software. Check out the source code on{" "}
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
