import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle } from "lucide-react";
import DateRangeDropdown from "@/components/ui/daterange";
import { SettingsType } from "@/contexts/OnboardingContext";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  settings: SettingsType["projects"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => void;
};

export const ProjectsSettings = ({ settings, updateSettings }: Props) => {
  const { t } = useLanguage();
  const entries = settings ?? [];

  const sync = (next: SettingsType["projects"]) => {
    updateSettings("projects", next);
  };

  const handleChange = (
    idx: number,
    field: keyof Omit<
      SettingsType["projects"][number],
      "technologies" | "date"
    >,
    value: string
  ) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: value };
    sync(updated);
  };

  const handleDateChange = (idx: number, value: { from: string }) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], date: { from: value.from } };
    sync(updated);
  };

  const handleTechChange = (idx: number, techIdx: number, value: string) => {
    const updated = [...entries];
    const techs = [...(updated[idx].technologies || [])];
    techs[techIdx] = value;
    updated[idx] = { ...updated[idx], technologies: techs };
    sync(updated);
  };

  const addTech = (idx: number) => {
    const updated = [...entries];
    const techs = [...(updated[idx].technologies || []), ""];
    updated[idx] = { ...updated[idx], technologies: techs };
    sync(updated);
  };

  const removeTech = (idx: number, techIdx: number) => {
    const updated = [...entries];
    const techs = [...(updated[idx].technologies || [])];
    techs.splice(techIdx, 1);
    updated[idx] = { ...updated[idx], technologies: techs };
    sync(updated);
  };

  const addEntry = () => {
    const newEntry: SettingsType["projects"][number] = {
      name: "",
      link: "",
      description: "",
      date: { from: "" },
      technologies: [],
    };
    sync([...entries, newEntry]);
  };

  const removeEntry = (idx: number) => {
    const updated = [...entries];
    updated.splice(idx, 1);
    sync(updated);
  };

  return (
    <div className='flex flex-col gap-6'>
      {entries.map((entry, idx) => (
        <div key={idx} className='flex flex-col gap-4 border-b pb-4'>
          {/* Project Name */}
          <div className='flex flex-col gap-2'>
            <Label>{t("field.projectName")}</Label>
            <Input
              placeholder={t("placeholder.projectName")}
              value={entry.name}
              onChange={(e) => handleChange(idx, "name", e.target.value)}
            />
          </div>

          {/* Project Link */}
          <div className='flex flex-col gap-2'>
            <Label>{t("field.projectLink")}</Label>
            <Input
              placeholder={t("placeholder.projectLink")}
              value={entry.link}
              onChange={(e) => handleChange(idx, "link", e.target.value)}
            />
          </div>

          {/* Description */}
          <div className='flex flex-col gap-2'>
            <Label>{t("field.description")}</Label>
            <Textarea
              placeholder={t("placeholder.projectDescription")}
              value={entry.description}
              onChange={(e) => handleChange(idx, "description", e.target.value)}
            />
          </div>

          {/* Date */}
          <DateRangeDropdown
            single
            value={{ from: entry.date.from }}
            onChange={(v) => handleDateChange(idx, v)}
          />

          {/* Technologies */}
          <div className='flex flex-col gap-2'>
            <Label>{t("field.technologies")}</Label>
            {(entry.technologies || []).map((tech, tIdx) => (
              <div key={tIdx} className='flex gap-2'>
                <Input
                  value={tech}
                  placeholder={`${t("placeholder.technologyPrefix")} ${tIdx + 1}`}
                  onChange={(e) => handleTechChange(idx, tIdx, e.target.value)}
                />
                <Button
                  variant='ghost'
                  className='text-destructive'
                  onClick={() => removeTech(idx, tIdx)}
                >
                  <MinusCircle className='h-4 w-4' />
                </Button>
              </div>
            ))}
            <Button
              variant='ghost'
              className='text-primary w-fit'
              onClick={() => addTech(idx)}
            >
              <PlusCircle className='h-4 w-4 mr-1' />
              {t("action.addTechnology")}
            </Button>
          </div>

          {/* Remove Project */}
          <Button
            variant='ghost'
            className='text-destructive self-start w-full'
            onClick={() => removeEntry(idx)}
          >
            <MinusCircle className='h-4 w-4 mr-1' />
            {t("action.removeProject")}
          </Button>
        </div>
      ))}

      {/* Add Project */}
      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addEntry}
      >
        <PlusCircle className='h-4 w-4 mr-1' />
        {t("action.addProject")}
      </Button>
    </div>
  );
};

export default ProjectsSettings;
