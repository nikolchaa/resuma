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

const Basic = () => {
  const navigate = useNavigate();
  const { setTheme: setThemeContext } = useTheme();
  const { apply, state, update } = useOnboarding();

  const { theme, paperSize, language, contentSize } = state.app;

  useEffect(() => {
    setThemeContext(theme);
    applyContentSizeClass(contentSize);
  }, [theme, contentSize, setThemeContext]);

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
            onValueChange={(v) => {
              update("app", { theme: v as "light" | "dark" | "system" });
              setThemeContext(v as "light" | "dark" | "system");
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
            onValueChange={(v) =>
              update("app", { paperSize: v as "A4" | "US Letter" })
            }
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
          <Select value={language} disabled>
            <SelectTrigger className='w-2/3'>
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
            onValueChange={(v) => {
              applyContentSizeClass(v as "md" | "lg");
              update("app", { contentSize: v as "md" | "lg" });
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
        <div className='flex justify-end mt-4'>
          <Button
            onClick={() =>
              apply("app").then(() => navigate("/onboarding/step2"))
            }
            className='cursor-pointer'
          >
            Continue <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Basic;
