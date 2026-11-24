import { useEffect, useMemo, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { RsmEditor } from "@/components/RsmEditor";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ResumeContent, ResumeData } from "@/lib/resumesStore";
import { normalizeContent } from "@/lib/resumeMigration";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { getTemplate, PaperFormat, resolveTemplate } from "@/renderer";
import type { AppLanguage } from "@/lib/i18n";
import { checkTemplate } from "@/renderer/check";
import { useFonts } from "@/renderer/browser/useRenderedResume";
import { mergeParsedContent, parseContent, printContent } from "@/renderer/rsm/content";
import { templateSourceFor } from "@/templates";
import { AiEditPanel } from "./AiEditPanel";
import { TemplateLibraryPanel } from "./TemplateLibraryPanel";

type SetDraft = (
  action: React.SetStateAction<ResumeData | null>,
  opts?: { checkpoint?: boolean }
) => void;

type Props = {
  draft: ResumeData | null;
  setDraft: SetDraft;
  format: PaperFormat;
  language: AppLanguage;
};

/** Parsed source over the current content, keeping fields outside the schema. */
const mergeContent = (current: ResumeContent, parsed: ResumeContent): ResumeContent =>
  normalizeContent(mergeParsedContent(current, parsed));

/** Canonical text of some content; equal strings mean equal content. */
const canonical = (content: ResumeContent) => printContent(normalizeContent(content));

export const SourceEditor = ({ draft, setDraft, format, language }: Props) => {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"content" | "template">("content");
  const { fonts } = useFonts();

  // ---- content --------------------------------------------------------------
  const draftContentText = useMemo(() => (draft ? canonical(draft.content) : ""), [draft?.content]);
  const [contentText, setContentText] = useState(draftContentText);
  const contentParse = useMemo(() => parseContent(contentText), [contentText]);

  // Follow outside changes (forms, undo, AI) unless the text already says the same.
  useEffect(() => {
    const mine = contentParse.content ? canonical(contentParse.content) : null;
    if (mine !== draftContentText) setContentText(draftContentText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftContentText]);

  const applyContent = (text: string, checkpoint = false) => {
    const parsed = parseContent(text).content;
    if (!parsed) return;
    setDraft((d) => {
      if (!d) return d;
      const next = mergeContent(d.content, parsed);
      // Formatting-only edits don't change the resume (and don't add undo steps).
      return canonical(next) === canonical(d.content) ? d : { ...d, content: next };
    }, { checkpoint });
  };

  const onContentChange = (text: string) => {
    setContentText(text);
    applyContent(text);
  };

  // ---- template -------------------------------------------------------------
  const resolved = useMemo(
    () => resolveTemplate({ theme: draft?.theme, templateSource: draft?.templateSource }),
    [draft?.theme, draft?.templateSource]
  );
  const [templateText, setTemplateText] = useState(resolved.source);
  const templateResult = useMemo(() => getTemplate(templateText), [templateText]);

  useEffect(() => {
    if (templateText !== resolved.source) setTemplateText(resolved.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved.source]);

  const applyTemplate = (text: string, checkpoint = false) => {
    if (!getTemplate(text).template) return;
    setDraft(
      (d) => {
        if (!d) return d;
        // Identical to the built-in? Then it isn't the resume's own template.
        const own = text.replace(/\r\n/g, "\n") === templateSourceFor(d.theme) ? undefined : text;
        return own === d.templateSource ? d : { ...d, templateSource: own };
      },
      { checkpoint }
    );
  };

  const onTemplateChange = (text: string) => {
    setTemplateText(text);
    applyTemplate(text);
  };

  const resetTemplate = () =>
    setDraft((d) => (d ? { ...d, templateSource: undefined } : d), { checkpoint: true });

  // AI-written templates are rendered with this resume (and a probe resume)
  // before the user sees them; problems go back to the model or show as warnings.
  const checkCandidate = useMemo(
    () =>
      fonts && draft
        ? (candidate: string) => checkTemplate(candidate, draft, { format, language, fonts }, templateText)
        : undefined,
    [fonts, draft, format, language, templateText]
  );

  // ---- shared ---------------------------------------------------------------
  const text = tab === "content" ? contentText : templateText;
  const diagnostics = tab === "content" ? contentParse.diagnostics : templateResult.diagnostics;
  const errors = diagnostics.filter((d) => d.severity === "error").length;

  const exportFile = async () => {
    try {
      const path = await save({
        filters: [{ name: "Resuma Markup", extensions: ["rsm"] }],
        defaultPath: `${draft?.title || "resume"}${tab === "template" ? "-template" : ""}.rsm`,
      });
      if (!path) return showWarning(t("toast.exportCanceled"));
      await writeTextFile(path, text);
      showSuccess(t("source.toast.exported"), path);
    } catch (e) {
      showError(t("source.toast.failed"), (e as Error).message);
    }
  };

  const importFile = async () => {
    try {
      const path = await open({ filters: [{ name: "Resuma Markup", extensions: ["rsm"] }], multiple: false });
      if (!path || typeof path !== "string") return;
      const imported = await readTextFile(path);
      if (tab === "content") {
        setContentText(imported);
        applyContent(imported, true);
      } else {
        setTemplateText(imported);
        applyTemplate(imported, true);
      }
      showSuccess(t("source.toast.imported"), path);
    } catch (e) {
      showError(t("source.toast.failed"), (e as Error).message);
    }
  };

  if (!draft) return null;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='grid grid-cols-2 gap-1 rounded-lg bg-muted p-1'>
          {(["content", "template"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1 text-sm ${
                tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(`source.${k}`)}
            </button>
          ))}
        </div>
        <div className='flex gap-1'>
          <Button size='sm' variant='outline' onClick={importFile} title={t("source.import")}>
            <Upload className='h-4 w-4' />
          </Button>
          <Button size='sm' variant='outline' onClick={exportFile} title={t("source.export")}>
            <Download className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <p className='text-sm text-muted-foreground'>{t(`source.hint.${tab}`)}</p>

      {tab === "template" && (
        <div className='flex items-center justify-between gap-2 text-sm'>
          <span className='rounded-full border px-2 py-0.5'>
            {resolved.custom ? t("source.own") : t("source.builtin")}
          </span>
          {resolved.custom && (
            <Button size='sm' variant='ghost' onClick={resetTemplate}>
              <RotateCcw className='h-4 w-4 mr-1' /> {t("source.resetTemplate")}
            </Button>
          )}
        </div>
      )}

      <RsmEditor
        key={tab}
        value={text}
        onChange={tab === "content" ? onContentChange : onTemplateChange}
        diagnostics={diagnostics}
        ariaLabel={t(`source.${tab}`)}
        className='h-[26rem] overflow-hidden rounded-md border'
      />

      <p className={`text-xs ${errors ? "text-destructive" : "text-muted-foreground"}`}>
        {errors ? `${errors} ${t("source.problems")}` : t("source.noProblems")}
      </p>

      {tab === "template" && (
        <div className='border-t pt-4'>
          <TemplateLibraryPanel
            source={templateText}
            name={templateResult.template?.name ?? resolved.template.name}
            valid={errors === 0}
            onUse={(next) => {
              setTemplateText(next);
              applyTemplate(next, true);
            }}
          />
        </div>
      )}

      <div className='border-t pt-4'>
        <AiEditPanel
          key={tab}
          target={tab}
          source={text}
          hasErrors={errors > 0}
          jobDesc={draft.jobDesc}
          check={tab === "template" ? checkCandidate : undefined}
          onAccept={(next) => {
            if (tab === "content") {
              setContentText(next);
              applyContent(next, true);
            } else {
              setTemplateText(next);
              applyTemplate(next, true);
            }
          }}
        />
      </div>
    </div>
  );
};
