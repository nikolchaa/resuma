import { useMemo } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, PencilLine, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CustomSection, ResumeData, ResumeLayout, SectionKey } from "@/lib/resumesStore";
import { resolveTemplate } from "@/renderer";
import { resolveOptionValues, sectionOrder } from "@/renderer/engine/compile";
import { FONT_FAMILIES } from "@/renderer/template/schema";
import type { TemplateOption } from "@/renderer/template/template";
import { newCustomSection } from "@/lib/customSections";

type Props = {
  draft: ResumeData | null;
  setDraft: React.Dispatch<React.SetStateAction<ResumeData | null>>;
  onEditCustom: () => void;
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Expands #abc to #aabbcc for <input type="color">, which needs 6 digits. */
const sixDigit = (hex: string) =>
  hex.length === 4 ? "#" + hex.slice(1).split("").map((c) => c + c).join("") : hex;

export const DesignEditor = ({ draft, setDraft, onEditCustom }: Props) => {
  const { t } = useLanguage();
  const template = useMemo(
    () => resolveTemplate({ theme: draft?.theme, templateSource: draft?.templateSource }).template,
    [draft?.theme, draft?.templateSource]
  );

  if (!draft || !template) return null;

  const content = draft.content;
  const layout = content.layout ?? {};
  const custom = content.custom ?? [];
  const hidden = new Set(layout.hidden ?? []);
  // Every section in display order, including hidden ones.
  const keys = sectionOrder(template, content, true);
  const options = template.options.filter((o) => o.name !== "font");
  const values = resolveOptionValues(template, draft.font, draft.templateOptions);

  const setLayout = (fn: (l: ResumeLayout) => ResumeLayout) =>
    setDraft((d) => (d ? { ...d, content: { ...d.content, layout: fn(d.content.layout ?? {}) } } : d));

  const setCustom = (fn: (c: CustomSection[]) => CustomSection[]) =>
    setDraft((d) => (d ? { ...d, content: { ...d.content, custom: fn(d.content.custom ?? []) } } : d));

  const setOption = (name: string, value: string) =>
    setDraft((d) => (d ? { ...d, templateOptions: { ...d.templateOptions, [name]: value } } : d));

  const resetOptions = () =>
    setDraft((d) => {
      if (!d) return d;
      const { templateOptions: _drop, ...rest } = d;
      void _drop;
      return rest;
    });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= keys.length) return;
    const order = [...keys];
    [order[index], order[target]] = [order[target], order[index]];
    setLayout((l) => ({ ...l, order }));
  };

  const toggleHidden = (key: SectionKey) =>
    setLayout((l) => {
      const set = new Set(l.hidden ?? []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { ...l, hidden: [...set] };
    });

  const rename = (key: SectionKey, title: string) => {
    if (key.startsWith("custom:")) {
      const id = key.slice("custom:".length);
      setCustom((list) => list.map((s) => (s.id === id ? { ...s, title } : s)));
    } else {
      setLayout((l) => ({ ...l, titles: { ...l.titles, [key]: title } }));
    }
  };

  const removeCustom = (id: string) => {
    setCustom((list) => list.filter((s) => s.id !== id));
    const key = `custom:${id}` as SectionKey;
    setLayout((l) => ({
      ...l,
      order: (l.order ?? []).filter((k) => k !== key),
      hidden: (l.hidden ?? []).filter((k) => k !== key),
    }));
  };

  const addCustom = () => {
    setCustom((list) => [...list, newCustomSection(list, t("design.custom.newTitle"))]);
    onEditCustom();
  };

  const optionLabel = (o: TemplateOption) => t(`design.option.${o.name}`, o.label ?? o.name);

  const renderOption = (o: TemplateOption) => {
    const value = values[o.name];
    switch (o.type) {
      case "color":
        return (
          <div className='flex w-2/3 items-center gap-2'>
            <input
              type='color'
              aria-label={optionLabel(o)}
              className='h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1'
              value={sixDigit(value)}
              onChange={(e) => setOption(o.name, e.target.value)}
            />
            <Input
              className='flex-1 text-right font-mono'
              defaultValue={value}
              key={value}
              onBlur={(e) => HEX.test(e.target.value.trim()) && setOption(o.name, e.target.value.trim().toLowerCase())}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>
        );
      case "size":
        return (
          <Input
            type='number'
            className='w-2/3 text-right'
            value={value}
            min={1}
            max={100}
            onChange={(e) => /^\d+(\.\d+)?$/.test(e.target.value) && setOption(o.name, e.target.value)}
          />
        );
      case "font":
        return (
          <Select value={value} onValueChange={(v) => setOption(o.name, v)}>
            <SelectTrigger className='w-2/3 text-right'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(FONT_FAMILIES).map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "choice":
        return (
          <Select value={value} onValueChange={(v) => setOption(o.name, v)}>
            <SelectTrigger className='w-2/3 text-right'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(o.choices ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Look */}
      {options.length > 0 && (
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between'>
            <div className='flex flex-col gap-1'>
              <h3 className='font-semibold'>{t("design.look")}</h3>
              <p className='text-sm text-muted-foreground'>{t("design.look.description")}</p>
            </div>
            <Button variant='outline' size='sm' onClick={resetOptions} disabled={!draft.templateOptions}>
              {t("common.reset")}
            </Button>
          </div>
          {options.map((o) => (
            <div key={o.name} className='flex items-center justify-between'>
              <Label className='w-1/3'>{optionLabel(o)}</Label>
              {renderOption(o)}
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* Sections */}
      <div className='flex flex-col gap-3'>
        <div className='flex flex-col gap-1'>
          <h3 className='font-semibold'>{t("design.sections")}</h3>
          <p className='text-sm text-muted-foreground'>{t("design.sections.description")}</p>
        </div>

        {keys.map((key, i) => {
          const customSection = key.startsWith("custom:")
            ? custom.find((s) => `custom:${s.id}` === key)
            : undefined;
          const defaultTitle = customSection
            ? t("design.custom.untitled")
            : t(`template.section.${key}`);
          const value = customSection ? customSection.title : layout.titles?.[key] ?? "";
          const count = customSection
            ? customSection.entries.length
            : (content[key as keyof typeof content] as unknown[] | undefined)?.length ?? 0;
          const isHidden = hidden.has(key);

          return (
            <div
              key={key}
              className={`flex flex-col gap-2 rounded-md border p-3 ${isHidden ? "opacity-60" : ""}`}
            >
              <div className='flex items-center gap-2'>
                <Input
                  className='flex-1'
                  aria-label={t("design.sections.rename")}
                  placeholder={defaultTitle}
                  value={value}
                  onChange={(e) => rename(key, e.target.value)}
                />
                <span className='min-w-6 text-center text-xs text-muted-foreground' title={`${count}`}>
                  {count}
                </span>
                <Button size='icon' variant='ghost' onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("common.moveUp")}>
                  <ArrowUp className='h-4 w-4' />
                </Button>
                <Button
                  size='icon'
                  variant='ghost'
                  onClick={() => move(i, 1)}
                  disabled={i === keys.length - 1}
                  aria-label={t("common.moveDown")}
                >
                  <ArrowDown className='h-4 w-4' />
                </Button>
                <Button
                  size='icon'
                  variant='ghost'
                  onClick={() => toggleHidden(key)}
                  aria-label={isHidden ? t("design.sections.show") : t("design.sections.hide")}
                  title={isHidden ? t("design.sections.show") : t("design.sections.hide")}
                >
                  {isHidden ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                </Button>
              </div>
              {customSection && (
                <div className='flex gap-2'>
                  <Button variant='ghost' size='sm' className='text-primary' onClick={onEditCustom}>
                    <PencilLine className='h-4 w-4 mr-1' /> {t("design.custom.edit")}
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive'
                    onClick={() => removeCustom(customSection.id)}
                  >
                    <Trash2 className='h-4 w-4 mr-1' /> {t("design.custom.remove")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <Button variant='ghost' className='text-primary self-start' onClick={addCustom}>
          <PlusCircle className='h-4 w-4 mr-1' /> {t("design.custom.add")}
        </Button>
      </div>
    </div>
  );
};
