import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MinusCircle, PlusCircle, ArrowRight } from "lucide-react";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { Textarea } from "@/components/ui/textarea";

const Awards = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();
  const entries = state.awards;

  const sync = (next: typeof entries) => {
    update("awards", next);
  };

  const handleChange = (
    index: number,
    field: keyof (typeof entries)[number],
    value: string
  ) => {
    const updated = [...entries];
    updated[index][field] = value;
    sync(updated);
  };

  const addEntry = () => {
    sync([
      ...entries,
      {
        title: "",
        organization: "",
        location: "",
        date: "",
        description: "",
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
          Awards{" "}
          <span className='text-muted-foreground text-xl'>(optional)</span>
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          List any notable awards or recognitions you’ve received.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {entries.map((entry, index) => (
          <div key={index} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2'>
              <Label>Title</Label>
              <Input
                placeholder='First Prize – Galaxy Cup'
                value={entry.title}
                onChange={(e) => handleChange(index, "title", e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Organization</Label>
              <Input
                placeholder='National Science Council'
                value={entry.organization}
                onChange={(e) =>
                  handleChange(index, "organization", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Location</Label>
              <Input
                placeholder='Belgrade, Serbia'
                value={entry.location}
                onChange={(e) =>
                  handleChange(index, "location", e.target.value)
                }
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Date</Label>
              <Input
                placeholder='Mar 2024'
                value={entry.date}
                onChange={(e) => handleChange(index, "date", e.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label>Description</Label>
              <Textarea
                placeholder='Awarded for best solution at the national AI competition...'
                value={entry.description}
                onChange={(e) =>
                  handleChange(index, "description", e.target.value)
                }
              />
            </div>
            {entries.length > 1 && (
              <Button
                variant='ghost'
                className='text-destructive'
                onClick={() => removeEntry(index)}
              >
                <MinusCircle className='h-4 w-4 mr-1' />
                Remove Award
              </Button>
            )}
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
              apply("awards").then(() => navigate("/onboarding/finish"))
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
