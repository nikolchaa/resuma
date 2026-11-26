import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/ThemeContext";
import { applyContentSizeClass } from "@/lib/ui";
import { useEffect, useState } from "react";
import { SettingsType } from "@/contexts/OnboardingContext";
import { updateSection } from "@/lib/store";
import { showError } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppLanguage, LANGUAGES } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { InfoTip } from "@/components/InfoTip";
import { setDiscordPresenceEnabled } from "@/lib/discord";

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
  const { theme, paperSize, language, contentSize, discordPresence, editorMode } =
    settings;
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
    value: string | boolean,
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
    if (key === "discordPresence") setDiscordPresenceEnabled(value === true);

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
            {LANGUAGES.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {t(l.labelKey)}
              </SelectItem>
            ))}
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

      {/* Default editor mode */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>
          {t("settings.editorMode")}{" "}
          <InfoTip text={t("settings.editorMode.description")} />
        </Label>
        <Select
          value={editorMode ?? "simple"}
          onValueChange={(v) => handleChange("editorMode", v)}
        >
          <SelectTrigger className='w-2/3'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='simple'>{t("editor.mode.simple")}</SelectItem>
            <SelectItem value='design'>{t("editor.mode.design")}</SelectItem>
            <SelectItem value='source'>{t("editor.mode.source")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Discord Rich Presence (opt-in) */}
      <div className='flex items-center justify-between gap-4'>
        <Label htmlFor='discord-presence'>
          {t("settings.discordPresence")}{" "}
          <InfoTip text={t("settings.discordPresence.description")} />
        </Label>
        <Switch
          id='discord-presence'
          checked={discordPresence ?? false}
          onCheckedChange={(v) => handleChange("discordPresence", v)}
        />
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
