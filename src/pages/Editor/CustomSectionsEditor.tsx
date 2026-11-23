import { MinusCircle, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DateRangeDropdown from "@/components/ui/daterange";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CustomEntry, CustomSection, ResumeData, SectionKey } from "@/lib/resumesStore";
import { emptyCustomEntry as emptyEntry, newCustomSection } from "@/lib/customSections";

type Props = {
  draft: ResumeData | null;
  setDraft: React.Dispatch<React.SetStateAction<ResumeData | null>>;
};

export const CustomSectionsEditor = ({ draft, setDraft }: Props) => {
  const { t } = useLanguage();
  if (!draft) return null;
  const sections = draft.content.custom ?? [];
  const hidden = new Set(draft.content.layout?.hidden ?? []);

  const unhide = (key: SectionKey) =>
    setDraft((d) =>
      d?.content.layout
        ? {
            ...d,
            content: {
              ...d.content,
              layout: { ...d.content.layout, hidden: (d.content.layout.hidden ?? []).filter((k) => k !== key) },
            },
          }
        : d
    );

  const setSections = (fn: (c: CustomSection[]) => CustomSection[]) =>
    setDraft((d) => (d ? { ...d, content: { ...d.content, custom: fn(d.content.custom ?? []) } } : d));

  const updateSection = (id: string, fn: (s: CustomSection) => CustomSection) =>
    setSections((list) => list.map((s) => (s.id === id ? fn(s) : s)));

  const updateEntry = (id: string, idx: number, fn: (e: CustomEntry) => CustomEntry) =>
    updateSection(id, (s) => ({ ...s, entries: s.entries.map((e, i) => (i === idx ? fn(e) : e)) }));

  const removeSection = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const key = `custom:${id}` as SectionKey;
      const layout = d.content.layout;
      return {
        ...d,
        content: {
          ...d.content,
          custom: (d.content.custom ?? []).filter((s) => s.id !== id),
          ...(layout && {
            layout: {
              ...layout,
              order: (layout.order ?? []).filter((k) => k !== key),
              hidden: (layout.hidden ?? []).filter((k) => k !== key),
            },
          }),
        },
      };
    });

  const addSection = () =>
    setSections((list) => [...list, newCustomSection(list, t("design.custom.newTitle"))]);

  return (
    <div className='flex flex-col gap-6'>
      {sections.length === 0 && (
        <p className='text-sm text-muted-foreground'>{t("design.custom.empty")}</p>
      )}

      {sections.map((section) => (
        <div key={section.id} className='flex flex-col gap-4 rounded-md border p-3'>
          {hidden.has(`custom:${section.id}`) && (
            <div className='flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
              <span>{t("design.sections.hiddenNote")}</span>
              <Button size='sm' variant='outline' onClick={() => unhide(`custom:${section.id}`)}>
                {t("design.sections.show")}
              </Button>
            </div>
          )}
          <div className='flex items-center gap-2'>
            <Label className='w-1/3'>{t("design.custom.sectionTitle")}</Label>
            <Input
              className='flex-1 text-right font-semibold'
              placeholder={t("design.custom.untitled")}
              value={section.title}
              onChange={(e) => updateSection(section.id, (s) => ({ ...s, title: e.target.value }))}
            />
            <Button
              size='icon'
              variant='ghost'
              className='text-destructive'
              onClick={() => removeSection(section.id)}
              aria-label={t("design.custom.remove")}
              title={t("design.custom.remove")}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </div>

          {section.entries.map((entry, idx) => (
            <div key={idx} className='flex flex-col gap-4 border-t pt-4'>
              <div className='flex items-center justify-between'>
                <Label className='w-1/3'>{t("field.title")}</Label>
                <Input
                  className='w-2/3 text-right'
                  placeholder={t("design.placeholder.title")}
                  value={entry.title}
                  onChange={(e) => updateEntry(section.id, idx, (x) => ({ ...x, title: e.target.value }))}
                />
              </div>
              <div className='flex items-center justify-between'>
                <Label className='w-1/3'>{t("design.entry.subtitle")}</Label>
                <Input
                  className='w-2/3 text-right'
                  placeholder={t("design.placeholder.subtitle")}
                  value={entry.subtitle}
                  onChange={(e) => updateEntry(section.id, idx, (x) => ({ ...x, subtitle: e.target.value }))}
                />
              </div>
              <div className='flex items-center justify-between'>
                <Label className='w-1/3'>{t("field.location")}</Label>
                <Input
                  className='w-2/3 text-right'
                  placeholder={t("placeholder.location")}
                  value={entry.location}
                  onChange={(e) => updateEntry(section.id, idx, (x) => ({ ...x, location: e.target.value }))}
                />
              </div>
              <div className='flex flex-col gap-2'>
                <Label>
                  {t("field.description")}{" "}
                  <span className='text-muted-foreground'>{t("common.optional")}</span>
                </Label>
                <Textarea
                  value={entry.description}
                  onChange={(e) => updateEntry(section.id, idx, (x) => ({ ...x, description: e.target.value }))}
                />
              </div>
              <DateRangeDropdown
                value={entry.date}
                onChange={(date) => updateEntry(section.id, idx, (x) => ({ ...x, date }))}
              />
              <div className='flex flex-col gap-2'>
                <Label>
                  {t("design.entry.items")}{" "}
                  <span className='text-muted-foreground'>{t("common.optional")}</span>
                </Label>
                {entry.items.map((item, iidx) => (
                  <div key={iidx} className='flex items-center gap-2'>
                    <Input
                      className='flex-1'
                      value={item}
                      onChange={(e) =>
                        updateEntry(section.id, idx, (x) => ({
                          ...x,
                          items: x.items.map((v, j) => (j === iidx ? e.target.value : v)),
                        }))
                      }
                    />
                    <Button
                      variant='ghost'
                      className='text-destructive'
                      aria-label={t("common.remove")}
                      onClick={() =>
                        updateEntry(section.id, idx, (x) => ({ ...x, items: x.items.filter((_, j) => j !== iidx) }))
                      }
                    >
                      <MinusCircle className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
                <Button
                  variant='ghost'
                  className='text-primary w-fit'
                  onClick={() => updateEntry(section.id, idx, (x) => ({ ...x, items: [...x.items, ""] }))}
                >
                  <PlusCircle className='h-4 w-4 mr-1' /> {t("design.entry.addItem")}
                </Button>
              </div>
              <Button
                variant='ghost'
                className='text-destructive self-start w-full'
                onClick={() =>
                  updateSection(section.id, (s) => ({ ...s, entries: s.entries.filter((_, i) => i !== idx) }))
                }
              >
                <MinusCircle className='h-4 w-4 mr-1' /> {t("design.entry.remove")}
              </Button>
            </div>
          ))}

          <Button
            variant='ghost'
            className='text-primary self-start'
            onClick={() => updateSection(section.id, (s) => ({ ...s, entries: [...s.entries, emptyEntry()] }))}
          >
            <PlusCircle className='h-4 w-4 mr-1' /> {t("design.entry.add")}
          </Button>
        </div>
      ))}

      <Button variant='ghost' className='text-primary self-start' onClick={addSection}>
        <PlusCircle className='h-4 w-4 mr-1' /> {t("design.custom.add")}
      </Button>
    </div>
  );
};
