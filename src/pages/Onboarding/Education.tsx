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
import { SettingsType, useOnboarding } from "@/contexts/OnboardingContext";
import { MinusCircle, PlusCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DateRangeDropdown from "@/components/ui/daterange";
import { useLanguage } from "@/contexts/LanguageContext";

type EducationEntry = SettingsType["education"][number];

const Education = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { state, update, apply } = useOnboarding();

  const entries = state.education;

  const sync = (next: EducationEntry[]) => {
    update("education", next);
  };

  const handleEntryChange = (
    index: number,
    field: keyof Omit<EducationEntry, "date" | "courses">,
    value: string
  ) => {
    const updated = [...entries];
    updated[index][field] = value;
    sync(updated);
  };

  const handleDateChange = (
    index: number,
    value: { from: string; to?: string }
  ) => {
    const updated = [...entries];
    updated[index].date = value;
    sync(updated);
  };

  const handleCourseChange = (
    entryIndex: number,
    courseIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    updated[entryIndex].courses![courseIndex] = value;
    sync(updated);
  };

  const addCourse = (entryIndex: number) => {
    const updated = [...entries];
    updated[entryIndex].courses = [...(updated[entryIndex].courses || []), ""];
    sync(updated);
  };

  const removeCourse = (entryIndex: number, courseIndex: number) => {
    const updated = [...entries];
    updated[entryIndex].courses!.splice(courseIndex, 1);
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...entries,
      {
        school: "",
        degree: "",
        location: "",
        gpa: "",
        date: { from: "", to: "" },
        courses: [],
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
          {t("onboarding.education.title")}{" "}
          <span className='text-muted-foreground text-xl'>{t("common.optional")}</span>
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("onboarding.education.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div key={index} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.schoolName")}</Label>
              <Input
                placeholder={t("placeholder.school")}
                value={entry.school}
                onChange={(e) =>
                  handleEntryChange(index, "school", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.degree")}</Label>
              <Input
                placeholder={t("placeholder.degree")}
                value={entry.degree}
                onChange={(e) =>
                  handleEntryChange(index, "degree", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>{t("field.location")}</Label>
              <Input
                placeholder={t("placeholder.location")}
                value={entry.location}
                onChange={(e) =>
                  handleEntryChange(index, "location", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>
                {t("field.gpa")}
                <span className='text-muted-foreground'>{t("common.optional")}</span>
              </Label>
              <Input
                placeholder={t("placeholder.gpa")}
                value={entry.gpa}
                onChange={(e) =>
                  handleEntryChange(index, "gpa", e.target.value)
                }
              />
            </div>

            <div className='flex flex-col gap-2'>
              <DateRangeDropdown
                mandatory
                value={{
                  from: entry.date?.from,
                  to: entry.date?.to,
                }}
                onChange={(value) => handleDateChange(index, value)}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label>
                {t("field.relevantCoursework")}
                <span className='text-muted-foreground'>{t("common.optional")}</span>
              </Label>
              {(entry.courses || []).map((course, i) => (
                <div key={i} className='flex gap-2'>
                  <Input
                    value={course}
                    onChange={(e) =>
                      handleCourseChange(index, i, e.target.value)
                    }
                    placeholder={t("placeholder.course")}
                  />
                  <Button
                    variant='ghost'
                    type='button'
                    className='text-destructive px-2'
                    onClick={() => removeCourse(index, i)}
                  >
                    <MinusCircle className='w-4 h-4' />
                  </Button>
                </div>
              ))}
              <Button
                variant='ghost'
                onClick={() => addCourse(index)}
                className='text-primary self-start px-0'
              >
                <PlusCircle className='w-4 h-4 mr-1' />
                 {t("action.addCourse")}
              </Button>
            </div>

            <Button
              variant={"ghost"}
              className='text-destructive'
              onClick={() => removeEntry(index)}
            >
              <MinusCircle className='h-4 w-4' /> {t("action.removeSchool")}
            </Button>
          </div>
        ))}

        <div className='flex items-center gap-2'>
          <Button variant='ghost' onClick={addEntry} className='text-primary'>
            <PlusCircle className='h-4 w-4 mr-1' /> {t("action.addSchool")}
          </Button>
        </div>

        <div className='flex justify-end mt-4'>
          <Button
            onClick={() =>
              apply("education").then(() => navigate("/onboarding/step5"))
            }
          >
            {t("common.continue")} <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Education;
