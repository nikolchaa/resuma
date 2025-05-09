// AwardsSettings.tsx
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle, ArrowUp, ArrowDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import DateRangeDropdown from "@/components/ui/daterange";
import { SettingsType } from "@/contexts/OnboardingContext";

type Props = {
  settings: SettingsType["awards"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => void;
};

export const AwardsSettings = ({ settings, updateSettings }: Props) => {
  const entries = settings ?? [];

  const sync = (next: SettingsType["awards"]) => {
    updateSettings("awards", next);
  };

  const handleFieldChange = (
    index: number,
    field: keyof Omit<SettingsType["awards"][number], "date">,
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
            <Label>Description</Label>
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
                Move Up
              </Button>
              <Button
                variant='ghost'
                disabled={idx === entries.length - 1}
                onClick={() => moveDown(idx)}
              >
                <ArrowDown className='h-4 w-4 mr-1' />
                Move Down
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

export default AwardsSettings;
