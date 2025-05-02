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
import { MinusCircle, PlusCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "@/contexts/OnboardingContext";
import DateRangeDropdown from "@/components/ui/daterange";
import { Textarea } from "@/components/ui/textarea";

const Experience = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();

  const entries = state.experience;

  const sync = (next: typeof entries) => {
    update("experience", next);
  };

  const handleEntryChange = (
    index: number,
    field: keyof Omit<(typeof entries)[number], "date" | "notes">,
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

  const handleNoteChange = (
    expIndex: number,
    noteIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    if (!updated[expIndex].notes) updated[expIndex].notes = [];
    updated[expIndex].notes[noteIndex] = value;
    sync(updated);
  };

  const addNote = (index: number) => {
    const updated = [...entries];
    if (!updated[index].notes) updated[index].notes = [];
    updated[index].notes.push("");
    sync(updated);
  };

  const removeNote = (expIndex: number, noteIndex: number) => {
    const updated = [...entries];
    updated[expIndex].notes?.splice(noteIndex, 1);
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...entries,
      {
        jobTitle: "",
        company: "",
        location: "",
        description: "",
        date: { from: "", to: "" },
        notes: [],
      },
    ]);
  };

  const removeEntry = (index: number) => {
    const updated = [...entries];
    updated.splice(index, 1);
    sync(updated);
  };

  const validateEntries = () =>
    entries.every(
      (e) =>
        e.jobTitle.trim() &&
        e.company.trim() &&
        e.location.trim() &&
        e.description.trim() &&
        e.date.from.trim()
    );

  return (
    <Card className='w-full max-w-lg mx-auto my-16'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>Experience</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Add your work history with key roles and accomplishments.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div key={index} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2'>
              <Label>
                Job Title<span className='text-destructive'>*</span>
              </Label>
              <Input
                placeholder='Frontend Developer'
                value={entry.jobTitle}
                onChange={(e) =>
                  handleEntryChange(index, "jobTitle", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>
                Company<span className='text-destructive'>*</span>
              </Label>
              <Input
                placeholder='Google'
                value={entry.company}
                onChange={(e) =>
                  handleEntryChange(index, "company", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>
                Location<span className='text-destructive'>*</span>
              </Label>
              <Input
                placeholder='Mountain View, CA'
                value={entry.location}
                onChange={(e) =>
                  handleEntryChange(index, "location", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>
                Description<span className='text-destructive'>*</span>
              </Label>
              <Textarea
                placeholder='Worked on major UI redesign for the Ads dashboard...'
                value={entry.description}
                onChange={(e) =>
                  handleEntryChange(index, "description", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <DateRangeDropdown
                mandatory
                value={entry.date}
                onChange={(value) => handleDateChange(index, value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>
                Notes<span className='text-muted-foreground'>(optional)</span>
              </Label>
              {entry.notes?.map((note, noteIndex) => (
                <div key={noteIndex} className='flex gap-2'>
                  <Input
                    value={note}
                    onChange={(e) =>
                      handleNoteChange(index, noteIndex, e.target.value)
                    }
                    placeholder={`Note ${noteIndex + 1}`}
                  />
                  <Button
                    variant='ghost'
                    className='text-destructive'
                    onClick={() => removeNote(index, noteIndex)}
                  >
                    <MinusCircle className='h-4 w-4' />
                  </Button>
                </div>
              ))}
              <Button
                variant='ghost'
                className='text-primary w-fit'
                onClick={() => addNote(index)}
              >
                <PlusCircle className='h-4 w-4 mr-1' />
                Add Note
              </Button>
            </div>

            {entries.length > 1 && (
              <Button
                variant='ghost'
                className='text-destructive'
                onClick={() => removeEntry(index)}
              >
                <MinusCircle className='h-4 w-4' />
                Remove Experience
              </Button>
            )}
          </div>
        ))}

        <div className='flex items-center gap-2'>
          <Button variant='ghost' onClick={addEntry} className='text-primary'>
            <PlusCircle className='h-4 w-4 mr-1' /> Add Experience
          </Button>
        </div>

        <div className='flex justify-end mt-4'>
          <Button
            disabled={!validateEntries()}
            onClick={() => {
              apply("experience").then(() => navigate("/onboarding/step6"));
            }}
          >
            Continue <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Experience;
