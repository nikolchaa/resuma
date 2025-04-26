import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/contexts/ThemeContext";
import { getSection, updateSection } from "@/lib/store";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { applyContentSizeClass } from "@/lib/ui";

const Basic = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [paperSize, setPaperSize] = useState<"A4" | "US Letter">("A4");
  const [language, setLanguage] = useState<"en">("en"); // locked to EN for now
  const [contentSize, setContentSize] = useState<"md" | "lg">("md");

  const { setTheme: setThemeContext } = useTheme();

  useEffect(() => {
    getSection<{
      theme?: "light" | "dark" | "system";
      paperSize?: "A4" | "US Letter";
      language?: "en";
      contentSize?: "md" | "lg";
    }>("app").then((app) => {
      // Theme
      const storedTheme = app?.theme ?? "system";
      setTheme(storedTheme);
      setThemeContext(storedTheme);

      // Paper
      const storedPaperSize = app?.paperSize ?? "A4";
      setPaperSize(storedPaperSize);

      // Language
      setLanguage(app?.language ?? "en");

      // Content Size
      const storedSize = app?.contentSize ?? "md";
      setContentSize(storedSize);
      applyContentSizeClass(storedSize);
    });
  }, []);

  const handleNext = async () => {
    await updateSection("app", {
      theme,
      paperSize,
      language,
      contentSize,
    });

    navigate("/onboarding/step2");
  };

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>Basic Setup</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Set up your preferences for the app. You can change these later in the
          settings.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {/* Theme Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>Theme</Label>
          <Select
            value={theme}
            onValueChange={async (v: "light" | "dark" | "system") => {
              setTheme(v);
              setThemeContext(v);

              await updateSection("app", {
                theme: v,
                paperSize,
                language,
                contentSize,
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

        {/* Paper Format Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>Paper Format</Label>
          <Select
            value={paperSize}
            onValueChange={(v) => setPaperSize(v as any)}
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

        {/* Language Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>Language</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
            <SelectTrigger className='w-2/3' disabled>
              <SelectValue placeholder='Select language' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='en'>English (EN)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Content Size Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>Content Size</Label>
          <Select
            value={contentSize}
            onValueChange={async (v: "md" | "lg") => {
              setContentSize(v); // local state for select
              applyContentSizeClass(v); // applies HTML font class immediately

              await updateSection("app", {
                theme,
                paperSize,
                language,
                contentSize: v,
              });
            }}
          >
            <SelectTrigger className='w-2/3'>
              <SelectValue placeholder='Select size' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='md'>Normal (100%)</SelectItem>
              <SelectItem value='lg'>Large (125%)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Continue */}
        <div className='flex justify-end'>
          <Button onClick={handleNext} className='cursor-pointer'>
            Continue <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Basic;
