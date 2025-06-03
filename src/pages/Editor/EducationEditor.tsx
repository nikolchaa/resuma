import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle } from "lucide-react";
import DateRangeDropdown from "@/components/ui/daterange";
import { ResumeData } from "@/lib/resumesStore";

type Props = {
  settings?: ResumeData["content"]["education"];
  updateDraft: <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => void;
};

export const EducationEditor = ({ settings, updateDraft }: Props) => {
  const education = settings ?? [];

  const sync = (next: ResumeData["content"]["education"]) => {
    updateDraft("education", next);
  };

  const handleEntryChange = (
    idx: number,
    field: keyof Omit<
      ResumeData["content"]["education"][number],
      "date" | "courses"
    >,
    value: string
  ) => {
    const updated = [...education];
    updated[idx] = { ...updated[idx], [field]: value };
    sync(updated);
  };

  const handleDateChange = (
    idx: number,
    value: { from: string; to?: string }
  ) => {
    const updated = [...education];
    updated[idx] = { ...updated[idx], date: value };
    sync(updated);
  };

  const handleCourseChange = (idx: number, cidx: number, value: string) => {
    const updated = [...education];
    const courses = [...(updated[idx].courses ?? [])];
    courses[cidx] = value;
    updated[idx] = { ...updated[idx], courses };
    sync(updated);
  };

  const addCourse = (idx: number) => {
    const updated = [...education];
    const courses = [...(updated[idx].courses ?? []), ""];
    updated[idx] = { ...updated[idx], courses };
    sync(updated);
  };

  const removeCourse = (idx: number, cidx: number) => {
    const updated = [...education];
    const courses = [...(updated[idx].courses ?? [])];
    courses.splice(cidx, 1);
    updated[idx] = { ...updated[idx], courses };
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

  const removeEntry = (idx: number) => {
    const updated = [...education];
    updated.splice(idx, 1);
    sync(updated);
  };

  return (
    <div className='flex flex-col gap-6'>
      {education.map((entry, idx) => (
        <div key={idx} className='flex flex-col gap-4 border-b pb-4'>
          {/* School */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>School</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.school}
              onChange={(e) => handleEntryChange(idx, "school", e.target.value)}
              placeholder='Harvard University'
            />
          </div>

          {/* Degree */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Degree</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.degree}
              onChange={(e) => handleEntryChange(idx, "degree", e.target.value)}
              placeholder='B.Sc. Computer Science'
            />
          </div>

          {/* Location */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Location</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.location}
              onChange={(e) =>
                handleEntryChange(idx, "location", e.target.value)
              }
              placeholder='City, Country'
            />
          </div>

          {/* GPA */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>GPA</Label>
            <Input
              className='w-2/3 text-right'
              value={entry.gpa}
              onChange={(e) => handleEntryChange(idx, "gpa", e.target.value)}
              placeholder='3.9'
            />
          </div>

          {/* Date */}
          <DateRangeDropdown
            value={entry.date}
            onChange={(v) => handleDateChange(idx, v)}
          />

          {/* Courses */}
          <div className='flex flex-col gap-2'>
            <Label>Relevant Coursework</Label>
            {(entry.courses ?? []).map((c, ci) => (
              <div key={ci} className='flex items-center gap-2'>
                <Input
                  className='w-full'
                  value={c}
                  onChange={(e) => handleCourseChange(idx, ci, e.target.value)}
                  placeholder='Data Structures'
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
              Add Course
            </Button>
          </div>

          {/* Remove Entry */}
          <Button
            variant='ghost'
            className='text-destructive'
            onClick={() => removeEntry(idx)}
          >
            <MinusCircle className='h-4 w-4 mr-1' /> Remove Education
          </Button>
        </div>
      ))}

      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addEntry}
      >
        <PlusCircle className='h-4 w-4 mr-1' /> Add Education
      </Button>
    </div>
  );
};
