import { useState } from "react";
import { BookmarkPlus, Check, Trash2 } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  deleteLibraryTemplate,
  libraryIdFor,
  libraryTemplateExists,
  saveLibraryTemplate,
  useTemplateLibrary,
} from "@/lib/templateLibrary";
import { showError, showSuccess } from "@/lib/toastUtils";

type Props = {
  /** The template currently in the editor. */
  source: string;
  /** Its display name, suggested when saving. */
  name: string;
  /** False while the template has errors (it can't be saved then). */
  valid: boolean;
  /** Uses a library template for this resume (copied into it). */
  onUse: (source: string) => void;
};

const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/** "My templates": save the current template, reuse or delete saved ones. */
export const TemplateLibraryPanel = ({ source, name, valid, onUse }: Props) => {
  const { t } = useLanguage();
  const { templates, error } = useTemplateLibrary();
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState(name);
  const current = source.replace(/\r\n/g, "\n");

  const save = async () => {
    const title = newName.trim();
    if (!title || !valid) return;
    try {
      const id = libraryIdFor(title);
      if (await libraryTemplateExists(id)) {
        const replace = await ask(fill(t("library.replace"), { name: title }), { kind: "warning" });
        if (!replace) return;
      }
      const saved = await saveLibraryTemplate(source, title);
      // Keep using what was just saved, so the picker shows it by name.
      onUse(saved.source);
      setSaving(false);
      showSuccess(fill(t("library.saved"), { name: saved.name }));
    } catch (e) {
      showError(t("library.failed"), (e as Error).message);
    }
  };

  const removeTemplate = async (id: string, title: string) => {
    try {
      if (!(await ask(fill(t("library.deleteConfirm"), { name: title }), { kind: "warning" }))) return;
      await deleteLibraryTemplate(id);
    } catch (e) {
      showError(t("library.failed"), (e as Error).message);
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex flex-col'>
          <span className='font-semibold'>{t("library.title")}</span>
          <span className='text-xs text-muted-foreground'>{t("library.description")}</span>
        </div>
        {!saving && (
          <Button
            size='sm'
            variant='outline'
            disabled={!valid}
            onClick={() => {
              setNewName(name);
              setSaving(true);
            }}
          >
            <BookmarkPlus className='h-4 w-4 mr-1' /> {t("library.save")}
          </Button>
        )}
      </div>

      {saving && (
        <div className='flex items-center gap-2'>
          <Input
            autoFocus
            aria-label={t("library.name")}
            placeholder={t("library.name")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setSaving(false);
            }}
          />
          <Button size='sm' onClick={save} disabled={!newName.trim()}>
            {t("library.saveConfirm")}
          </Button>
          <Button size='sm' variant='ghost' onClick={() => setSaving(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      {error && <p className='text-xs text-destructive'>{error.message}</p>}
      {templates.length === 0 ? (
        <p className='text-xs text-muted-foreground'>{t("library.empty")}</p>
      ) : (
        <ul className='flex flex-col divide-y rounded-md border'>
          {templates.map((tpl) => {
            const inUse = tpl.source === current;
            return (
              <li key={tpl.id} className='flex items-center gap-2 px-3 py-1.5 text-sm'>
                <span className='flex-1 truncate'>{tpl.name}</span>
                {inUse ? (
                  <span className='flex items-center text-xs text-muted-foreground'>
                    <Check className='h-3 w-3 mr-1' /> {t("library.inUse")}
                  </span>
                ) : (
                  <Button size='sm' variant='ghost' onClick={() => onUse(tpl.source)}>
                    {t("library.use")}
                  </Button>
                )}
                <Button
                  size='icon'
                  variant='ghost'
                  className='text-destructive'
                  aria-label={fill(t("library.delete"), { name: tpl.name })}
                  title={fill(t("library.delete"), { name: tpl.name })}
                  onClick={() => removeTemplate(tpl.id, tpl.name)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
