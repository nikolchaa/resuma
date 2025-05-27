import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SettingsType } from "@/contexts/OnboardingContext";

type Props = {
  settings: SettingsType["personal"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]>
  ) => void;
};

export const PersonalSettings = ({ settings, updateSettings }: Props) => {
  const updateField = <K extends keyof SettingsType["personal"]>(
    key: K,
    value: SettingsType["personal"][K]
  ) => {
    updateSettings("personal", { [key]: value });
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Full Name */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Full Name</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.fullName}
          onChange={(e) => updateField("fullName", e.target.value)}
          placeholder='John Doe'
        />
      </div>

      {/* Email */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Email</Label>
        <Input
          className='w-2/3 text-right'
          type='email'
          value={settings.email}
          onChange={(e) => updateField("email", e.target.value)}
          placeholder='email@example.com'
        />
      </div>

      {/* Location */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Location</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.location}
          onChange={(e) => updateField("location", e.target.value)}
          placeholder='City, Country'
        />
      </div>

      {/* Phone */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Phone</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.phone || ""}
          onChange={(e) => updateField("phone", e.target.value)}
          placeholder='+1 (123) 456-7890'
        />
      </div>

      {/* LinkedIn */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>LinkedIn</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.linkedin || ""}
          onChange={(e) => updateField("linkedin", e.target.value)}
          placeholder='https://linkedin.com/in/username'
        />
      </div>

      {/* GitHub */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>GitHub</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.github || ""}
          onChange={(e) => updateField("github", e.target.value)}
          placeholder='https://github.com/username'
        />
      </div>

      {/* Website */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Website</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.website || ""}
          onChange={(e) => updateField("website", e.target.value)}
          placeholder='https://yourwebsite.com'
        />
      </div>
    </div>
  );
};
