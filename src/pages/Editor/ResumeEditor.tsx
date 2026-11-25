import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTemplateLibrary } from "@/lib/templateLibrary";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  cleanSpecialCharacters,
  detectBuzzwords,
  formatResumeTxt,
  matchATSKeywords,
} from "@/lib/resumeUtils";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { AnimatePresence, motion as m } from "motion/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import { startTailoring, useTailoring } from "@/lib/tailoring/job";
// import { runResumeCleanup, runResumeEnhancement } from "@/lib/llmUtils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
// import { runResumeCleanup, runResumeEnhancement } from "@/lib/llmUtils";

type Props = {
  draft: any;
  setDraft: any;
};

export const ResumeEditor = ({ draft, setDraft }: Props) => {
  const { t } = useLanguage();
  const aiEnabled = useAiEnabled();
  const tailoring = useTailoring(draft?.id);
  const { templates: library } = useTemplateLibrary();
  // Which picker entry the resume's template is: a built-in, a library
  // template (its copy is unchanged), or its own edited copy.
  const ownSource: string | undefined = draft?.templateSource?.replace(/\r\n/g, "\n");
  const libraryMatch = ownSource ? library.find((l) => l.source === ownSource) : undefined;
  const templateValue = libraryMatch
    ? `lib:${libraryMatch.id}`
    : ownSource
    ? "own"
    : draft?.theme ?? "professional";
  const [atsModalOpen, setAtsModalOpen] = useState(false);
  const [atsResults, setAtsResults] = useState<{
    present: string[];
    missing: string[];
  }>({ present: [], missing: [] });

  const cleanResumeContent = (content: any): any => {
    if (typeof content === "string") {
      return cleanSpecialCharacters(content);
    } else if (Array.isArray(content)) {
      return content.map(cleanResumeContent);
    } else if (typeof content === "object" && content !== null) {
      const cleanedObj: any = {};
      for (const key in content) {
        cleanedObj[key] = cleanResumeContent(content[key]);
      }
      return cleanedObj;
    } else {
      return content;
    }
  };

  const handleExportTxt = async () => {
    if (!draft?.content) return;

    try {
      const filePath = await save({
        filters: [{ name: "Text", extensions: ["txt"] }],
        defaultPath: `${draft.title || "resume"}.txt`,
      });

      if (!filePath) {
        showWarning(t("toast.exportCanceled"), t("toast.noFileSaved"));
        return;
      }

      const textOutput = formatResumeTxt(draft.content);

      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(textOutput);
      await writeFile(filePath, uint8Array);

      showSuccess(t("toast.txtExported"), filePath);
    } catch (error) {
      showError(
        t("toast.exportFailed"),
        (error as Error).message || t("toast.somethingWrong")
      );
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Resume Title */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.resumeTitle")}</Label>
        <Input
          placeholder={t("placeholder.resumeTitle")}
          value={draft?.title || ""}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className='w-2/3'
        />
      </div>

      {/* Template Switcher */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.template")}</Label>
        <Select
          value={templateValue}
          onValueChange={(value) => {
            if (value === "own") return;
            const fromLibrary = value.startsWith("lib:")
              ? library.find((l) => `lib:${l.id}` === value)
              : undefined;
            // A library template is copied into the resume; a built-in drops
            // the resume's own copy (undo restores either).
            setDraft(
              fromLibrary
                ? { ...draft, templateSource: fromLibrary.source }
                : { ...draft, theme: value, templateSource: undefined }
            );
          }}
        >
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder={t("editor.template.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='professional'>
              {t("editor.template.professional")}
            </SelectItem>
            <SelectItem value='modern'>{t("editor.template.modern")}</SelectItem>
            <SelectItem value='compact'>{t("editor.template.compact")}</SelectItem>
            <SelectItem value='sidebar'>{t("editor.template.sidebar")}</SelectItem>
            {library.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>{t("library.title")}</SelectLabel>
                  {library.map((l) => (
                    <SelectItem key={l.id} value={`lib:${l.id}`}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
            {templateValue === "own" && (
              <SelectItem value='own'>{t("source.own")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Font Switcher */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.font")}</Label>
        <Select
          value={draft?.font ?? "figtree"}
          onValueChange={(value) =>
            setDraft({
              ...draft,
              font: value,
            })
          }
        >
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder={t("editor.font.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='figtree'>Figtree</SelectItem>
            <SelectItem value='inter'>Inter</SelectItem>
            <SelectItem value='spaceGrotesk'>Space Grotesk</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* TXT Export */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>{t("field.exportTxt")}</Label>
        <Button variant='outline' className='w-2/3' onClick={handleExportTxt}>
          {t("editor.downloadTxt")}
        </Button>
      </div>

      <Separator />

      <div className='flex flex-col gap-2'>
        <Label className='text-lg font-semibold'>{t("editor.optimizationTools")}</Label>
        <Label className='text-sm text-muted-foreground'>
          {t("editor.optimizationTools.desc")}
        </Label>
      </div>

      {/* ATS Keyword Matcher */}
      <div className='flex flex-col gap-2'>
        <Label>{t("editor.atsMatcher")}</Label>
        <Textarea
          placeholder={t("wizard.job.placeholder")}
          value={draft?.jobDesc}
          onChange={(e) => setDraft({ ...draft, jobDesc: e.target.value })}
        />
        <div className='flex flex-wrap justify-end gap-2'>
          {aiEnabled === true && (
            <Button
              variant='outline'
              disabled={!draft?.jobDesc?.trim() || tailoring !== undefined}
              title={!draft?.jobDesc?.trim() ? t("tailor.needsJob") : t("tailor.actionHint")}
              onClick={() => {
                if (!draft?.id || !draft.jobDesc?.trim()) return;
                if (!startTailoring(draft.id, draft.jobDesc)) showWarning(t("tailor.running"));
              }}
            >
              {t("tailor.action")}
            </Button>
          )}
          <Button
            variant='outline'
            onClick={() => {
              if (!draft?.content || !draft.jobDesc) return;

              const results = matchATSKeywords(draft.content, draft.jobDesc);
              setAtsResults(results);
              setAtsModalOpen(true);
            }}
          >
            {t("editor.ats.match")}
          </Button>
        </div>
        {aiEnabled === true && (
          <p className='text-xs text-muted-foreground'>{t("tailor.actionHint")}</p>
        )}
      </div>

      {/* Clean Special Characters */}
      <div className='flex items-center justify-between'>
        <Label>{t("editor.cleanSpecialCharacters")}</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={() => {
            if (!draft) return;

            const cleanedContent = cleanResumeContent(draft.content);
            setDraft({ ...draft, content: cleanedContent });

            showSuccess(t("toast.specialCharsCleaned"));
          }}
        >
          {t("editor.clean")}
        </Button>
      </div>

      {/* Detect Buzzwords */}
      <div className='flex items-center justify-between'>
        <Label>{t("editor.detectBuzzwords")}</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={() => {
            if (!draft) return;

            const results = detectBuzzwords(draft.content);
            if (results.length === 0) {
              showSuccess(t("toast.noBuzzwords"));
            } else {
              const msg = results
                .map((r) => `${r.word} (${r.count})`)
                .join(", ");
              showWarning(t("toast.buzzwordsDetected"), msg);
            }
          }}
        >
          {t("editor.runDetection")}
        </Button>
      </div>

      {/* ATS Results Modal */}
      <AnimatePresence>
        {atsModalOpen && (
          <m.div
            key='ats-modal'
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className='fixed inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm'
          >
            <Card className='w-full max-w-md'>
              <CardHeader>
                <CardTitle className='text-xl font-semibold'>
                  {t("editor.ats.title")}
                </CardTitle>
                <CardDescription>
                  {t("editor.ats.description")}
                </CardDescription>
              </CardHeader>

              <CardContent className='flex flex-col gap-4 max-h-72 overflow-y-auto'>
                <div>
                  <h3 className='font-semibold mb-1'>{t("editor.ats.present")}</h3>
                  {atsResults.present.length > 0 ? (
                    <ul className='list-disc list-inside text-primary'>
                      {atsResults.present.map((word) => (
                        <li key={word}>{word}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t("editor.ats.nonePresent")}
                    </p>
                  )}
                </div>

                <div>
                  <h3 className='font-semibold mb-1'>{t("editor.ats.missing")}</h3>
                  {atsResults.missing.length > 0 ? (
                    <ul className='list-disc list-inside text-destructive'>
                      {atsResults.missing.map((word) => (
                        <li key={word}>{word}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      {t("editor.ats.noneMissing")}
                    </p>
                  )}
                </div>
              </CardContent>

              <CardFooter className='flex justify-end'>
                <Button
                  variant='outline'
                  onClick={() => setAtsModalOpen(false)}
                >
                  {t("common.close")}
                </Button>
              </CardFooter>
            </Card>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
