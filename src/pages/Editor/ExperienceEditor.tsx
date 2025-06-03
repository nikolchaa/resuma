import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle, Sparkles } from "lucide-react";
import DateRangeDropdown from "@/components/ui/daterange";
import { Textarea } from "@/components/ui/textarea";
import { ResumeData } from "@/lib/resumesStore";
import { runTextEnhancement } from "@/lib/llmUtils";
import { showWarning } from "@/lib/toastUtils";

type Props = {
  settings?: ResumeData["content"]["experience"];
  updateDraft: <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => void;
  jobDesc?: string;
  setOpenLoader: (open: boolean) => void;
  setCurrentSection: (section: string | undefined) => void;
};

export const ExperienceEditor = ({
  settings,
  updateDraft,
  jobDesc = "",
  setOpenLoader,
  setCurrentSection,
}: Props) => {
  const entries = settings ?? [];

  const sync = (next: ResumeData["content"]["experience"]) => {
    updateDraft("experience", next);
  };

  const handleAIEnhance = async (
    idx: number,
    field: "description" | "notes",
    noteIdx?: number
  ) => {
    const text =
      field === "description"
        ? entries[idx].description
        : entries[idx].notes?.[noteIdx ?? 0] ?? "";

    if (!text.trim() && !jobDesc?.trim()) {
      showWarning(
        "No content to enhance. Add text or a job description first."
      );
      return;
    }

    setOpenLoader(true);
    setCurrentSection(`Enhancing experience field...`);

    try {
      const result = await runTextEnhancement(
        text.trim() || text,
        jobDesc.trim(),
        "experience"
      );

      const updated = [...entries];
      if (field === "description") {
        updated[idx] = { ...updated[idx], description: result };
      } else {
        const notes = [...(updated[idx].notes || [])];
        notes[noteIdx ?? 0] = result;
        updated[idx] = { ...updated[idx], notes };
      }
      sync(updated);
    } catch (err) {
      console.error("AI Enhancement Error:", err);
    } finally {
      setOpenLoader(false);
      setCurrentSection(undefined);
    }
  };

  const handleEntryChange = (
    idx: number,
    field: keyof Omit<
      ResumeData["content"]["experience"][number],
      "date" | "notes"
    >,
    value: string
  ) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: value };
    sync(updated);
  };

  const handleDateChange = (
    idx: number,
    value: { from: string; to?: string }
  ) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], date: value };
    sync(updated);
  };

  const handleNoteChange = (idx: number, noteIdx: number, value: string) => {
    const updated = [...entries];
    const notes = [...(updated[idx].notes || [])];
    notes[noteIdx] = value;
    updated[idx] = { ...updated[idx], notes };
    sync(updated);
  };

  const addNote = (idx: number) => {
    const updated = [...entries];
    const notes = [...(updated[idx].notes || []), ""];
    updated[idx] = { ...updated[idx], notes };
    sync(updated);
  };

  const removeNote = (idx: number, noteIdx: number) => {
    const updated = [...entries];
    const notes = [...(updated[idx].notes || [])];
    notes.splice(noteIdx, 1);
    updated[idx] = { ...updated[idx], notes };
    sync(updated);
  };

  const addEntry = () => {
    const newEntry: ResumeData["content"]["experience"][number] = {
      jobTitle: "",
      company: "",
      location: "",
      description: "",
      date: { from: "", to: "" },
      notes: [],
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
          {/* Job Title */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Job Title</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='Frontend Developer'
              value={entry.jobTitle}
              onChange={(e) =>
                handleEntryChange(idx, "jobTitle", e.target.value)
              }
            />
          </div>

          {/* Company */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Company</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='Google'
              value={entry.company}
              onChange={(e) =>
                handleEntryChange(idx, "company", e.target.value)
              }
            />
          </div>

          {/* Location */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Location</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='Mountain View, CA'
              value={entry.location}
              onChange={(e) =>
                handleEntryChange(idx, "location", e.target.value)
              }
            />
          </div>

          {/* Description */}
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between'>
              <Label>Description</Label>
              <Button
                size='icon'
                variant='outline'
                onClick={() => handleAIEnhance(idx, "description")}
              >
                <Sparkles className='h-4 w-4' />
              </Button>
            </div>
            <Textarea
              placeholder='Worked on major UI redesign...'
              value={entry.description}
              onChange={(e) =>
                handleEntryChange(idx, "description", e.target.value)
              }
            />
          </div>

          {/* Date */}
          <DateRangeDropdown
            value={entry.date}
            onChange={(value) => handleDateChange(idx, value)}
          />

          {/* Notes */}
          <div className='flex flex-col gap-2'>
            <Label>
              Notes<span className='text-muted-foreground'>(optional)</span>
            </Label>
            {(entry.notes || []).map((note, nidx) => (
              <div key={nidx} className='flex gap-2 items-center'>
                <Input
                  className='flex-1'
                  placeholder={`Note ${nidx + 1}`}
                  value={note}
                  onChange={(e) => handleNoteChange(idx, nidx, e.target.value)}
                />
                <Button
                  size='icon'
                  variant='outline'
                  onClick={() => handleAIEnhance(idx, "notes", nidx)}
                >
                  <Sparkles className='h-4 w-4' />
                </Button>
                <Button
                  variant='ghost'
                  className='text-destructive'
                  onClick={() => removeNote(idx, nidx)}
                >
                  <MinusCircle className='h-4 w-4' />
                </Button>
              </div>
            ))}
            <Button
              variant='ghost'
              className='text-primary w-fit'
              onClick={() => addNote(idx)}
            >
              <PlusCircle className='h-4 w-4 mr-1' />
              Add Note
            </Button>
          </div>

          {/* Remove Entry */}
          <Button
            variant='ghost'
            className='text-destructive self-start w-full'
            onClick={() => removeEntry(idx)}
          >
            <MinusCircle className='h-4 w-4 mr-1' />
            Remove Experience
          </Button>
        </div>
      ))}

      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addEntry}
      >
        <PlusCircle className='h-4 w-4 mr-1' /> Add Experience
      </Button>
    </div>
  );
};

export default ExperienceEditor;
