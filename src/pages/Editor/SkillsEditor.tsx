import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MinusCircle, PlusCircle, ArrowUp, ArrowDown } from "lucide-react";
import { ResumeData } from "@/lib/resumesStore";

type Props = {
  settings?: ResumeData["content"]["skills"];
  updateDraft: <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => void;
};

export const SkillsEditor = ({ settings, updateDraft }: Props) => {
  const entries = settings ?? [];

  const sync = (next: ResumeData["content"]["skills"]) => {
    updateDraft("skills", next);
  };

  const handleCategoryChange = (catIndex: number, value: string) => {
    const updated = [...entries];
    updated[catIndex] = { ...updated[catIndex], category: value };
    sync(updated);
  };

  const handleItemChange = (
    catIndex: number,
    itemIndex: number,
    value: string
  ) => {
    const updated = [...entries];
    const items = [...(updated[catIndex].items || [])];
    items[itemIndex] = value;
    updated[catIndex] = { ...updated[catIndex], items };
    sync(updated);
  };

  const addCategory = () => {
    sync([...entries, { category: "", items: [""] }]);
  };

  const removeCategory = (catIndex: number) => {
    const updated = [...entries];
    updated.splice(catIndex, 1);
    sync(updated);
  };

  const addItem = (catIndex: number) => {
    const updated = [...entries];
    const items = [...(updated[catIndex].items || []), ""];
    updated[catIndex] = { ...updated[catIndex], items };
    sync(updated);
  };

  const removeItem = (catIndex: number, itemIndex: number) => {
    const updated = [...entries];
    const items = [...(updated[catIndex].items || [])];
    items.splice(itemIndex, 1);
    updated[catIndex] = { ...updated[catIndex], items };
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
    const items = [...(updated[catIndex].items || [])];
    const newIndex = direction === "up" ? itemIndex - 1 : itemIndex + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[itemIndex], items[newIndex]] = [items[newIndex], items[itemIndex]];
    updated[catIndex] = { ...updated[catIndex], items };
    sync(updated);
  };

  return (
    <div className='flex flex-col gap-6'>
      {entries.map((group, catIndex) => (
        <div key={catIndex} className='flex flex-col gap-4 border-b pb-4'>
          {/* Category */}
          <div className='flex flex-col gap-2'>
            <Label>Category</Label>
            <Input
              placeholder='Programming'
              value={group.category}
              onChange={(e) => handleCategoryChange(catIndex, e.target.value)}
            />
          </div>

          {/* Skill Items */}
          <div className='flex flex-col gap-2'>
            <Label>Skills</Label>
            {(group.items ?? []).map((item, itemIndex) => (
              <div key={itemIndex} className='flex gap-2 items-center'>
                <Input
                  placeholder={`Skill ${itemIndex + 1}`}
                  value={item}
                  onChange={(e) =>
                    handleItemChange(catIndex, itemIndex, e.target.value)
                  }
                  className='flex-1'
                />
                <Button
                  variant='ghost'
                  disabled={itemIndex === 0}
                  onClick={() => moveItem(catIndex, itemIndex, "up")}
                >
                  <ArrowUp className='w-4 h-4' />
                </Button>
                <Button
                  variant='ghost'
                  disabled={itemIndex === (group.items?.length ?? 0) - 1}
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
              <PlusCircle className='w-4 h-4 mr-1' />
              Add Skill
            </Button>
          </div>

          {/* Category Actions */}
          <div className='flex justify-between items-center'>
            <Button
              variant='ghost'
              className='text-destructive'
              onClick={() => removeCategory(catIndex)}
            >
              <MinusCircle className='w-4 h-4 mr-1' />
              Remove Category
            </Button>
            <div className='flex gap-2'>
              <Button
                variant='ghost'
                disabled={catIndex === 0}
                onClick={() => moveCategory(catIndex, "up")}
              >
                <ArrowUp className='w-4 h-4 mr-1' />
              </Button>
              <Button
                variant='ghost'
                disabled={catIndex === entries.length - 1}
                onClick={() => moveCategory(catIndex, "down")}
              >
                <ArrowDown className='w-4 h-4 mr-1' />
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Add Category */}
      <Button
        variant='ghost'
        className='text-primary self-start'
        onClick={addCategory}
      >
        <PlusCircle className='w-4 h-4 mr-1' />
        Add Category
      </Button>
    </div>
  );
};
