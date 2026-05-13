import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MinusCircle, PlusCircle, ArrowRight } from "lucide-react";
import { SettingsType, useOnboarding } from "@/contexts/OnboardingContext";
import DateRangeDropdown from "@/components/ui/daterange";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";

type ProjectEntry = SettingsType["projects"][number];

const Projects = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { state, update, apply } = useOnboarding();
  const entries = state.projects;

  const sync = (next: ProjectEntry[]) => {
    update("projects", next);
  };

  const handleChange = (
    index: number,
    field: keyof Omit<ProjectEntry, "technologies" | "date">,
    value: string
  ) => {
    const updated = [...entries];
    updated[index][field] = value;
    sync(updated);
  };

  const handleDateChange = (index: number, value: { from: string }) => {
    const updated = [...entries];
    updated[index].date = { from: value.from };
    sync(updated);
  };

  const handleTechChange = (
    projectIndex: number,
    techIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    if (!updated[projectIndex].technologies)
      updated[projectIndex].technologies = [];
    updated[projectIndex].technologies[techIndex] = value;
    sync(updated);
  };

  const addTech = (index: number) => {
    const updated = [...entries];
    if (!updated[index].technologies) updated[index].technologies = [];
    updated[index].technologies.push("");
    sync(updated);
  };

  const removeTech = (projectIndex: number, techIndex: number) => {
    const updated = [...entries];
    updated[projectIndex].technologies?.splice(techIndex, 1);
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...entries,
      {
        name: "",
        link: "",
        description: "",
        date: { from: "" },
        technologies: [],
      },
    ]);
  };

  const removeEntry = (index: number) => {
    const updated = [...entries];
    updated.splice(index, 1);
    sync(updated);
  };

  return (
    <Card className='w-full max-w-lg mx-auto my-16'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>
          {t("onboarding.projects.title")}{" "}
          <span className='text-muted-foreground text-xl'>{t("common.optional")}</span>
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("onboarding.projects.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div key={index} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.projectName")}</Label>
              <Input
                placeholder={t("placeholder.projectName")}
                value={entry.name}
                onChange={(e) => handleChange(index, "name", e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.projectLink")}</Label>
              <Input
                placeholder={t("placeholder.projectLink")}
                value={entry.link}
                onChange={(e) => handleChange(index, "link", e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.description")}</Label>
              <Textarea
                placeholder={t("placeholder.projectDescription")}
                value={entry.description}
                onChange={(e) =>
                  handleChange(index, "description", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <DateRangeDropdown
                single
                value={{ from: entry.date.from }}
                onChange={(v) => handleDateChange(index, v)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.technologies")}</Label>
              {entry.technologies?.map((tech, techIndex) => (
                <div key={techIndex} className='flex gap-2'>
                  <Input
                    value={tech}
                    onChange={(e) =>
                      handleTechChange(index, techIndex, e.target.value)
                    }
                    placeholder={`${t("placeholder.technologyPrefix")} ${techIndex + 1}`}
                  />
                  <Button
                    variant='ghost'
                    className='text-destructive'
                    onClick={() => removeTech(index, techIndex)}
                  >
                    <MinusCircle className='h-4 w-4' />
                  </Button>
                </div>
              ))}
              <Button
                variant='ghost'
                className='text-primary w-fit'
                onClick={() => addTech(index)}
              >
                <PlusCircle className='h-4 w-4 mr-1' />
                {t("action.addTechnology")}
              </Button>
            </div>
            <Button
              variant='ghost'
              className='text-destructive'
              onClick={() => removeEntry(index)}
            >
              <MinusCircle className='h-4 w-4' />
               {t("action.removeProject")}
            </Button>
          </div>
        ))}
        <div className='flex items-center gap-2'>
          <Button variant='ghost' onClick={addEntry} className='text-primary'>
            <PlusCircle className='h-4 w-4 mr-1' /> {t("action.addProject")}
          </Button>
        </div>
        <div className='flex justify-end mt-4'>
          <Button
            onClick={() =>
              apply("projects").then(() => navigate("/onboarding/step7"))
            }
          >
            {t("common.continue")} <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Projects;
