import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle } from "lucide-react";
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

  const updateSocial = (index: number, value: string) => {
    const socials = [...(settings.socials ?? [])];
    socials[index] = value;
    updateField("socials", socials);
  };

  const addSocial = () => {
    const socials = [...(settings.socials ?? []), ""];
    updateField("socials", socials);
  };

  const removeSocial = (index: number) => {
    const socials = [...(settings.socials ?? [])];
    socials.splice(index, 1);
    updateField("socials", socials);
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

      {/* Headline */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Headline</Label>
        <Input
          className='w-2/3 text-right'
          value={settings.headline}
          onChange={(e) => updateField("headline", e.target.value)}
          placeholder='Web Developer, Designer...'
        />
      </div>

      {/* Social Links */}
      <div className='flex flex-col gap-2'>
        <Label>
          Links <span className='text-muted-foreground'>(optional)</span>
        </Label>
        {(settings.socials ?? []).map((link, index) => (
          <div key={index} className='flex items-center gap-2'>
            <Input
              value={link}
              onChange={(e) => updateSocial(index, e.target.value)}
              placeholder='https://linkednin.com/in/someone'
              className='w-full'
            />
            <Button
              variant='ghost'
              className='text-destructive'
              onClick={() => removeSocial(index)}
            >
              <MinusCircle className='h-4 w-4' />
            </Button>
          </div>
        ))}
        <Button
          variant='ghost'
          className='text-primary w-fit'
          onClick={addSocial}
        >
          <PlusCircle className='h-4 w-4 mr-1' /> Add Link
        </Button>
      </div>
    </div>
  );
};
