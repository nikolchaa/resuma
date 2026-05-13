import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
          value={draft?.theme ?? "professional"}
          onValueChange={(value) =>
            setDraft({
              ...draft,
              theme: value,
            })
          }
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
        <Button
          variant='outline'
          className='self-end'
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

      {/* <Separator /> */}

      {/* Debug */}
      {/* <div className='flex items-center justify-between'>
        <Label>Test LLM Trim</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={async () => {
            if (!draft) return;

            try {
              const result = await runResumeCleanup(
                draft.content.education[1],
                draft.jobDesc
              );
              console.log("LLM result:", result);
              showSuccess("LLM Cleanup Result", result);
            } catch (error) {
              console.error("LLM error:", error);
              showError("LLM call failed", String(error));
            }
          }}
        >
          Run Test
        </Button>
      </div>

      <div className='flex items-center justify-between'>
        <Label>Test LLM Enhance</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={async () => {
            if (!draft) return;

            try {
              const result = await runResumeEnhancement(
                draft.content.experience[0],
                draft.jobDesc
              );
              console.log("LLM result:", result);
              showSuccess("LLM Enhancement Result", result);
            } catch (error) {
              console.error("LLM error:", error);
              showError("LLM call failed", String(error));
            }
          }}
        >
          Run Test
        </Button>
      </div> */}

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
