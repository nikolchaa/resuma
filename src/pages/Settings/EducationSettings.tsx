import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle } from "lucide-react";
import DateRangeDropdown from "@/components/ui/daterange";
import { SettingsType } from "@/contexts/OnboardingContext";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  settings: SettingsType["education"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => void;
};

export const EducationSettings = ({ settings, updateSettings }: Props) => {
  const { t } = useLanguage();
  const education = settings ?? [];

  const sync = (next: SettingsType["education"]) => {
    updateSettings("education", next);
  };

  const handleEntryChange = (
    index: number,
    field: keyof Omit<SettingsType["education"][number], "date" | "courses">,
    value: string
  ) => {
    const updated = [...education];
    updated[index] = { ...updated[index], [field]: value };
    sync(updated);
  };

  const handleDateChange = (
    index: number,
    value: { from: string; to?: string }
  ) => {
    const updated = [...education];
    updated[index] = { ...updated[index], date: value };
    sync(updated);
  };

  const handleCourseChange = (
    index: number,
    courseIndex: number,
    value: string
  ) => {
    const updated = [...education];
    const courses = [...(updated[index].courses || [])];
    courses[courseIndex] = value;
    updated[index] = { ...updated[index], courses };
    sync(updated);
  };

  const addCourse = (index: number) => {
    const updated = [...education];
    const courses = [...(updated[index].courses || []), ""];
    updated[index] = { ...updated[index], courses };
    sync(updated);
  };

  const removeCourse = (index: number, courseIndex: number) => {
    const updated = [...education];
    const courses = [...(updated[index].courses || [])];
    courses.splice(courseIndex, 1);
    updated[index] = { ...updated[index], courses };
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...education,
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
    const updated = [...education];
    updated.splice(index, 1);
    sync(updated);
  };

  return (
    <div className='flex flex-col gap-6'>
      {education.map((entry, idx) => (
        <div key={idx} className='flex flex-col gap-4 border-b pb-4'>
          {/* School */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>{t("field.schoolName")}</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.school}
              onChange={(e) => handleEntryChange(idx, "school", e.target.value)}
              placeholder={t("placeholder.school")}
            />
          </div>

          {/* Degree */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>{t("field.degree")}</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.degree}
              onChange={(e) => handleEntryChange(idx, "degree", e.target.value)}
              placeholder={t("placeholder.degree")}
            />
          </div>

          {/* Location */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>{t("field.location")}</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.location}
              onChange={(e) =>
                handleEntryChange(idx, "location", e.target.value)
              }
              placeholder={t("placeholder.location")}
            />
          </div>

          {/* GPA */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>{t("field.gpa")}</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.gpa}
              onChange={(e) => handleEntryChange(idx, "gpa", e.target.value)}
              placeholder={t("placeholder.gpa")}
            />
          </div>

          {/* Date */}
          <DateRangeDropdown
            value={entry.date}
            onChange={(v) => handleDateChange(idx, v)}
          />

          {/* Courses */}
          <div className='flex flex-col gap-2'>
            <Label>{t("field.relevantCoursework")}</Label>
            {(entry.courses || []).map((c, ci) => (
              <div key={ci} className='flex items-center gap-2'>
                <Input
                  className='w-full'
                  value={c}
                  onChange={(e) => handleCourseChange(idx, ci, e.target.value)}
                  placeholder={t("placeholder.course")}
                />
                <Button
                  variant='ghost'
                  className='text-destructive'
                  onClick={() => removeCourse(idx, ci)}
                >
                  <MinusCircle className='h-4 w-4' />
                </Button>
              </div>
            ))}
            <Button
              variant='ghost'
              className='text-primary w-fit'
              onClick={() => addCourse(idx)}
            >
              <PlusCircle className='h-4 w-4 mr-1' />
              {t("action.addCourse")}
            </Button>
          </div>

          {/* Remove School */}
          <Button
            variant='ghost'
            className='text-destructive self-start'
            onClick={() => removeEntry(idx)}
          >
              <MinusCircle className='h-4 w-4 mr-1' /> {t("action.removeSchool")}
          </Button>
        </div>
      ))}

      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addEntry}
      >
        <PlusCircle className='h-4 w-4 mr-1' /> {t("action.addEducation")}
      </Button>
    </div>
  );
};
