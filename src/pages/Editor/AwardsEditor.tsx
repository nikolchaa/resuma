import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MinusCircle,
  PlusCircle,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import DateRangeDropdown from "@/components/ui/daterange";
import { ResumeData } from "@/lib/resumesStore";
import { showWarning } from "@/lib/toastUtils";
import { runTextEnhancement } from "@/lib/llmUtils";

type Props = {
  settings?: ResumeData["content"]["awards"];
  updateDraft: <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => void;
  jobDesc?: string;
  setOpenLoader: (open: boolean) => void;
  setCurrentSection: (section: string | undefined) => void;
};

export const AwardsEditor = ({
  settings,
  updateDraft,
  jobDesc = "",
  setOpenLoader,
  setCurrentSection,
}: Props) => {
  const entries = settings ?? [];

  const sync = (next: ResumeData["content"]["awards"]) => {
    updateDraft("awards", next);
  };

  const handleAIEnhance = async (idx: number) => {
    const text = entries[idx].description ?? "";

    if (!text.trim() && !jobDesc?.trim()) {
      showWarning(
        "No content to enhance. Add a description or job description first."
      );
      return;
    }

    setOpenLoader(true);
    setCurrentSection(`Enhancing award field...`);

    try {
      const result = await runTextEnhancement(
        text.trim() || text,
        jobDesc.trim(),
        "award"
      );
      const updated = [...entries];
      updated[idx] = { ...updated[idx], description: result };
      sync(updated);
    } catch (err) {
      console.error("AI Enhancement Error:", err);
    } finally {
      setOpenLoader(false);
      setCurrentSection(undefined);
    }
  };

  const handleFieldChange = (
    index: number,
    field: keyof Omit<ResumeData["content"]["awards"][number], "date">,
    value: string
  ) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], [field]: value };
    sync(updated);
  };

  const handleDateChange = (index: number, value: { from: string }) => {
    const updated = [...entries];
    updated[index] = { ...updated[index], date: { from: value.from } };
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...entries,
      {
        title: "",
        organizer: "",
        location: "",
        date: { from: "" },
        description: "",
      },
    ]);
  };

  const removeEntry = (index: number) => {
    const updated = [...entries];
    updated.splice(index, 1);
    sync(updated);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...entries];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    sync(updated);
  };

  const moveDown = (index: number) => {
    if (index === entries.length - 1) return;
    const updated = [...entries];
    [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
    sync(updated);
  };

  return (
    <div className='flex flex-col gap-6'>
      {entries.map((entry, idx) => (
        <div key={idx} className='flex flex-col gap-4 border-b pb-4'>
          {/* Title */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Title</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='Best Open Source Contribution'
              value={entry.title}
              onChange={(e) => handleFieldChange(idx, "title", e.target.value)}
            />
          </div>

          {/* Organizer */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Organizer</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='GitHub Universe'
              value={entry.organizer}
              onChange={(e) =>
                handleFieldChange(idx, "organizer", e.target.value)
              }
            />
          </div>

          {/* Location */}
          <div className='flex items-center justify-between'>
            <Label className='w-1/3'>Location</Label>
            <Input
              className='w-2/3 text-right'
              placeholder='San Francisco, CA'
              value={entry.location}
              onChange={(e) =>
                handleFieldChange(idx, "location", e.target.value)
              }
            />
          </div>

          {/* Date */}
          <DateRangeDropdown
            single
            value={entry.date}
            onChange={(v) => handleDateChange(idx, v)}
          />

          {/* Description */}
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between'>
              <Label>Description</Label>
              <Button
                size='icon'
                variant='outline'
                onClick={() => handleAIEnhance(idx)}
              >
                <Sparkles className='h-4 w-4' />
              </Button>
            </div>
            <Textarea
              placeholder='Awarded for outstanding contribution to...'
              value={entry.description}
              onChange={(e) =>
                handleFieldChange(idx, "description", e.target.value)
              }
            />
          </div>

          {/* Actions: remove & reorder */}
          <div className='flex justify-between items-center'>
            <Button
              variant='ghost'
              className='text-destructive'
              onClick={() => removeEntry(idx)}
            >
              <MinusCircle className='h-4 w-4 mr-1' />
              Remove Award
            </Button>
            <div className='flex gap-2'>
              <Button
                variant='ghost'
                disabled={idx === 0}
                onClick={() => moveUp(idx)}
              >
                <ArrowUp className='h-4 w-4 mr-1' />
              </Button>
              <Button
                variant='ghost'
                disabled={idx === entries.length - 1}
                onClick={() => moveDown(idx)}
              >
                <ArrowDown className='h-4 w-4 mr-1' />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Add new award */}
      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addEntry}
      >
        <PlusCircle className='h-4 w-4 mr-1' />
        Add Award
      </Button>
    </div>
  );
};
