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
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { applyContentSizeClass } from "@/lib/ui";
import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const Basic = () => {
  const navigate = useNavigate();
  const { setTheme: setThemeContext } = useTheme();
  const { apply, state, update } = useOnboarding();
  const { t, setLanguage } = useLanguage();

  const { theme, paperSize, language, contentSize } = state.app;

  useEffect(() => {
    setThemeContext(theme);
    applyContentSizeClass(contentSize);
  }, [theme, contentSize, setThemeContext]);

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>
          {t("onboarding.basic.title")}
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("onboarding.basic.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {/* Theme Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>{t("settings.theme")}</Label>
          <Select
            value={theme}
            onValueChange={(v) => {
              update("app", { theme: v as "light" | "dark" | "system" });
              setThemeContext(v as "light" | "dark" | "system");
            }}
          >
            <SelectTrigger className='w-2/3'>
              <SelectValue placeholder={t("settings.theme.select")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='light'>{t("settings.theme.light")}</SelectItem>
              <SelectItem value='dark'>{t("settings.theme.dark")}</SelectItem>
              <SelectItem value='system'>
                {t("settings.theme.system")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Paper Format Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>{t("settings.paper")}</Label>
          <Select
            value={paperSize}
            onValueChange={(v) =>
              update("app", { paperSize: v as "A4" | "US" })
            }
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

        {/* Language Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>{t("settings.language")}</Label>
          <Select
            value={language}
            onValueChange={(v) => {
              update("app", { language: v as "en" | "rs" });
              setLanguage(v as "en" | "rs");
            }}
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

        {/* Content Size Row */}
        <div className='flex items-center justify-between'>
          <Label className='w-1/3'>{t("settings.contentSize")}</Label>
          <Select
            value={contentSize}
            onValueChange={(v) => {
              applyContentSizeClass(v as "md" | "lg");
              update("app", { contentSize: v as "md" | "lg" });
            }}
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

        {/* Continue */}
        <div className='flex justify-end mt-4'>
          <Button
            onClick={() =>
              apply("app").then(() => navigate("/onboarding/step2"))
            }
            className='cursor-pointer'
          >
            {t("common.continue")} <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Basic;
