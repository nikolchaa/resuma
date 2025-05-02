import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  MinusCircle,
  PlusCircle,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useOnboarding } from "@/contexts/OnboardingContext";

const Skills = () => {
  const navigate = useNavigate();
  const { state, update, apply } = useOnboarding();
  const entries = state.skills;

  const sync = (next: typeof entries) => update("skills", next);

  const handleCategoryChange = (index: number, value: string) => {
    const updated = [...entries];
    updated[index].category = value;
    sync(updated);
  };

  const handleItemChange = (
    catIndex: number,
    itemIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    updated[catIndex].items[itemIndex] = value;
    sync(updated);
  };

  const addCategory = () => {
    sync([...entries, { category: "", items: [""] }]);
  };

  const removeCategory = (index: number) => {
    const updated = [...entries];
    updated.splice(index, 1);
    sync(updated);
  };

  const addItem = (catIndex: number) => {
    const updated = [...entries];
    updated[catIndex].items.push("");
    sync(updated);
  };

  const removeItem = (catIndex: number, itemIndex: number) => {
    const updated = [...entries];
    updated[catIndex].items.splice(itemIndex, 1);
    sync(updated);
  };

  const moveCategory = (index: number, direction: "up" | "down") => {
    const updated = [...entries];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= updated.length) return;
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    sync(updated);
  };

  const moveItem = (
    catIndex: number,
    itemIndex: number,
    direction: "up" | "down"
  ) => {
    const updated = [...entries];
    const items = updated[catIndex].items;
    const newIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[itemIndex], items[newIndex]] = [items[newIndex], items[itemIndex]];
    sync(updated);
  };

  return (
    <Card className='w-full max-w-lg mx-auto my-16'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>
          Skills{" "}
          <span className='text-muted-foreground text-xl'>(optional)</span>
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Add your professional and technical skills grouped by category.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {entries.map((group, catIndex) => (
          <div key={catIndex} className='flex flex-col gap-4 border-b pb-4'>
            <div className='flex flex-col gap-2 w-full'>
              <Label>Category</Label>
              <Input
                placeholder='Programming'
                value={group.category}
                onChange={(e) => handleCategoryChange(catIndex, e.target.value)}
              />
            </div>

            <div className='flex flex-col gap-2'>
              <Label>Skills</Label>
              {group.items.map((item, itemIndex) => (
                <div key={itemIndex} className='flex gap-2 items-center'>
                  <Input
                    value={item}
                    onChange={(e) =>
                      handleItemChange(catIndex, itemIndex, e.target.value)
                    }
                    placeholder={`Skill ${itemIndex + 1}`}
                  />
                  <Button
                    variant='ghost'
                    onClick={() => moveItem(catIndex, itemIndex, "up")}
                  >
                    <ArrowUp className='w-4 h-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    onClick={() => moveItem(catIndex, itemIndex, "down")}
                  >
                    <ArrowDown className='w-4 h-4' />
                  </Button>
                  <Button
                    variant='ghost'
                    className='text-destructive'
                    onClick={() => removeItem(catIndex, itemIndex)}
                  >
                    <MinusCircle className='w-4 h-4' />
                  </Button>
                </div>
              ))}
              <Button
                variant='ghost'
                className='text-primary w-fit'
                onClick={() => addItem(catIndex)}
              >
                <PlusCircle className='w-4 h-4 mr-1' /> Add Skill
              </Button>
            </div>
            <div className='flex justify-between'>
              <Button
                variant='ghost'
                className='text-destructive w-fit'
                onClick={() => removeCategory(catIndex)}
              >
                <MinusCircle className='w-4 h-4 mr-1' /> Remove Category
              </Button>
              <div className='flex gap-2'>
                <Button
                  variant='ghost'
                  disabled={catIndex === 0}
                  onClick={() => moveCategory(catIndex, "up")}
                >
                  <ArrowUp className='w-4 h-4 mr-1' /> Move Up
                </Button>
                <Button
                  variant='ghost'
                  disabled={catIndex === entries.length - 1}
                  onClick={() => moveCategory(catIndex, "down")}
                >
                  <ArrowDown className='w-4 h-4 mr-1' /> Move Down
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className='flex items-center gap-2'>
          <Button
            variant='ghost'
            onClick={addCategory}
            className='text-primary'
          >
            <PlusCircle className='h-4 w-4 mr-1' /> Add Category
          </Button>
        </div>

        <div className='flex justify-end mt-4'>
          <Button
            onClick={() => {
              apply("skills").then(() => navigate("/onboarding/step8"));
            }}
          >
            Continue <ArrowRight className='h-4 ml-1' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Skills;
