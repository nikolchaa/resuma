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
import {
  MinusCircle,
  PlusCircle,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { SettingsType, useOnboarding } from "@/contexts/OnboardingContext";
import { Textarea } from "@/components/ui/textarea";
import DateRangeDropdown from "@/components/ui/daterange";

type AwardEntry = SettingsType["awards"][number];

const Awards = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();
  const entries = state.awards;

  const sync = (next: AwardEntry[]) => {
    update("awards", next);
  };

  const handleChange = (
    index: number,
    field: keyof Omit<AwardEntry, "date">,
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
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    sync(updated);
  };

  const moveDown = (index: number) => {
    if (index === entries.length - 1) return;
    const updated = [...entries];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    sync(updated);
  };

  return (
    <Card className='w-full max-w-lg mx-auto my-16'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>
          Awards{" "}
          <span className='text-muted-foreground text-xl'>(optional)</span>
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Add any notable awards or recognitions you've received.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div key={index} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2'>
              <Label>Title</Label>
              <Input
                placeholder='Best Open Source Contribution'
                value={entry.title}
                onChange={(e) => handleChange(index, "title", e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Organizer</Label>
              <Input
                placeholder='GitHub Universe'
                value={entry.organizer}
                onChange={(e) =>
                  handleChange(index, "organizer", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Location</Label>
              <Input
                placeholder='San Francisco, CA'
                value={entry.location}
                onChange={(e) =>
                  handleChange(index, "location", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <DateRangeDropdown
                single
                value={entry.date}
                onChange={(value) => handleDateChange(index, value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Description</Label>
              <Textarea
                placeholder='Awarded for outstanding contribution to...'
                value={entry.description}
                onChange={(e) =>
                  handleChange(index, "description", e.target.value)
                }
              />
            </div>
            <div className='flex justify-between w-full'>
              <Button
                variant='ghost'
                className='text-destructive'
                onClick={() => removeEntry(index)}
              >
                <MinusCircle className='h-4 w-4 mr-1' /> Remove Award
              </Button>
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  disabled={index === 0}
                  onClick={() => moveUp(index)}
                >
                  <ArrowUp className='h-4 w-4 mr-1' /> Move Up
                </Button>
                <Button
                  variant='ghost'
                  disabled={index === entries.length - 1}
                  onClick={() => moveDown(index)}
                >
                  <ArrowDown className='h-4 w-4 mr-1' /> Move Down
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className='flex items-center gap-2'>
          <Button variant='ghost' onClick={addEntry} className='text-primary'>
            <PlusCircle className='h-4 w-4 mr-1' /> Add Award
          </Button>
        </div>

        <div className='flex justify-end mt-4'>
          <Button
            onClick={() =>
              apply("awards").then(() => navigate("/onboarding/step9"))
            }
          >
            Continue <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Awards;
