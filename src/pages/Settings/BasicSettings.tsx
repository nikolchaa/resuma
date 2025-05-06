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
import { useEffect } from "react";
import { SettingsType } from "@/contexts/OnboardingContext";
import { updateSection } from "@/lib/store";

type Props = {
  settings: SettingsType["app"];
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  setDraftSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
};

export const BasicSettings = ({
  settings,
  setSettings,
  setDraftSettings,
}: Props) => {
  const { theme, paperSize, language, contentSize } = settings;
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme(theme);
    applyContentSizeClass(contentSize);
  }, [theme, contentSize, setTheme]);

  return (
    <div className='flex flex-col gap-4'>
      {/* Theme */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Theme</Label>
        <Select
          value={theme}
          onValueChange={(v) => {
            setTheme(v as "light" | "dark" | "system");
            setDraftSettings((prev) => ({
              ...prev,
              app: { ...prev.app, theme: v as "light" | "dark" | "system" },
            }));
            setSettings((prev) => ({
              ...prev,
              app: { ...prev.app, theme: v as "light" | "dark" | "system" },
            }));
            updateSection("app", {
              theme: v as "light" | "dark" | "system",
              paperSize,
              contentSize,
              language,
            });
          }}
        >
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
          onValueChange={(v) => {
            setDraftSettings((prev) => ({
              ...prev,
              app: { ...prev.app, paperSize: v as "A4" | "US Letter" },
            }));
            setSettings((prev) => ({
              ...prev,
              app: { ...prev.app, paperSize: v as "A4" | "US Letter" },
            }));
            updateSection("app", {
              theme,
              paperSize: v as "A4" | "US Letter",
              contentSize,
              language,
            });
          }}
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
          onValueChange={(v) => {
            applyContentSizeClass(v as "md" | "lg");
            setDraftSettings((prev) => ({
              ...prev,
              app: { ...prev.app, contentSize: v as "md" | "lg" },
            }));
            setSettings((prev) => ({
              ...prev,
              app: { ...prev.app, contentSize: v as "md" | "lg" },
            }));
            updateSection("app", {
              theme,
              paperSize,
              contentSize: v as "md" | "lg",
              language,
            });
          }}
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
    </div>
  );
};
