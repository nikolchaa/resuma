import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useLanguage } from "@/contexts/LanguageContext";

const Personal = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { state, update, apply } = useOnboarding();

  const isValid =
    state.personal.fullName.trim() !== "" &&
    state.personal.email.trim() !== "" &&
    state.personal.location.trim() !== "";

  return (
    <Card className='w-full max-w-lg mx-auto'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>
          {t("onboarding.personal.title")}
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("onboarding.personal.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {/* Full Name */}
        <div className='flex flex-col gap-2'>
          <Label>
            {t("field.fullName")}<span className='text-destructive'>*</span>
          </Label>
          <Input
            value={state.personal.fullName}
            onChange={(e) => update("personal", { fullName: e.target.value })}
            placeholder={t("placeholder.fullName")}
          />
        </div>

        {/* Email */}
        <div className='flex flex-col gap-2'>
          <Label>
            {t("field.email")}<span className='text-destructive'>*</span>
          </Label>
          <Input
            type='email'
            value={state.personal.email}
            onChange={(e) => update("personal", { email: e.target.value })}
            placeholder={t("placeholder.email")}
          />
        </div>

        {/* Location */}
        <div className='flex flex-col gap-2'>
          <Label>
            {t("field.location")}<span className='text-destructive'>*</span>
          </Label>
          <Input
            value={state.personal.location}
            onChange={(e) => update("personal", { location: e.target.value })}
            placeholder={t("placeholder.location")}
          />
        </div>

        {/* Phone */}
        <div className='flex flex-col gap-2'>
          <Label>{t("field.phone")}</Label>
          <Input
            value={state.personal.phone || ""}
            onChange={(e) => update("personal", { phone: e.target.value })}
            placeholder={t("placeholder.phone")}
          />
        </div>

        {/* LinkedIn */}
        <div className='flex flex-col gap-2'>
          <Label>{t("field.linkedin")}</Label>
          <Input
            value={state.personal.linkedin || ""}
            onChange={(e) => update("personal", { linkedin: e.target.value })}
            placeholder={t("placeholder.linkedin")}
          />
        </div>

        {/* GitHub */}
        <div className='flex flex-col gap-2'>
          <Label>{t("field.github")}</Label>
          <Input
            value={state.personal.github || ""}
            onChange={(e) => update("personal", { github: e.target.value })}
            placeholder={t("placeholder.github")}
          />
        </div>

        {/* Website */}
        <div className='flex flex-col gap-2'>
          <Label>{t("field.website")}</Label>
          <Input
            value={state.personal.website || ""}
            onChange={(e) => update("personal", { website: e.target.value })}
            placeholder={t("placeholder.website")}
          />
        </div>

        {/* Continue */}
        <div className='flex justify-end mt-4'>
          <Button
            disabled={!isValid}
            onClick={() =>
              apply("personal").then(() => navigate("/onboarding/step4"))
            }
          >
            {t("common.continue")} <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Personal;
