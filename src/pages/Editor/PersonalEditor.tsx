import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ResumeData } from "@/lib/resumesStore";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  settings: ResumeData["content"]["personal"] | undefined;
  updateDraft: <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => void;
};

export const PersonalEditor: React.FC<Props> = ({ settings, updateDraft }) => {
  const { t } = useLanguage();
  if (!settings)
    return (
      <div className='text-muted-foreground'>{t("editor.personal.noData")}</div>
    );

  const updateField = <K extends keyof ResumeData["content"]["personal"]>(
    key: K,
    value: ResumeData["content"]["personal"][K]
  ) => {
    updateDraft("personal", { [key]: value });
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Full Name */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.fullName")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.fullName}
          onChange={(e) => updateField("fullName", e.target.value)}
          placeholder={t("placeholder.fullName")}
        />
      </div>

      {/* Email */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.email")}</Label>
        <Input
          className='w-2/3 text-right'
          type='email'
          value={settings.email ?? ""}
          onChange={(e) => updateField("email", e.target.value)}
          placeholder={t("placeholder.email")}
        />
      </div>

      {/* Location */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.location")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.location ?? ""}
          onChange={(e) => updateField("location", e.target.value)}
          placeholder={t("placeholder.location")}
        />
      </div>

      {/* Phone */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.phone")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.phone ?? ""}
          onChange={(e) => updateField("phone", e.target.value)}
          placeholder={t("placeholder.phone")}
        />
      </div>

      {/* LinkedIn */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.linkedin")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.linkedin ?? ""}
          onChange={(e) => updateField("linkedin", e.target.value)}
          placeholder={t("placeholder.linkedin")}
        />
      </div>

      {/* GitHub */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.github")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.github ?? ""}
          onChange={(e) => updateField("github", e.target.value)}
          placeholder={t("placeholder.github")}
        />
      </div>

      {/* Website */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.website")}</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.website ?? ""}
          onChange={(e) => updateField("website", e.target.value)}
          placeholder={t("placeholder.website")}
        />
      </div>
    </div>
  );
};
