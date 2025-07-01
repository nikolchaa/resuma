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
        showWarning("Export canceled", "No file was saved");
        return;
      }

      const textOutput = formatResumeTxt(draft.content);

      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(textOutput);
      await writeFile(filePath, uint8Array);

      showSuccess("TXT exported successfully", filePath);
    } catch (error) {
      showError(
        "Export failed",
        (error as Error).message || "Something went wrong"
      );
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Resume Title */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Resume Title</Label>
        <Input
          placeholder='Enter resume title...'
          value={draft?.title || ""}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className='w-2/3'
        />
      </div>

      {/* Template Switcher */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Template</Label>
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
            <SelectValue placeholder='Select a template' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='professional'>Professional</SelectItem>
            <SelectItem value='modern'>Modern</SelectItem>
            <SelectItem value='compact'>Compact</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Font Switcher */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Font</Label>
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
            <SelectValue placeholder='Select a font' />
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
        <Label className='w-1/3'>Export as TXT</Label>
        <Button variant='outline' className='w-2/3' onClick={handleExportTxt}>
          Download .txt
        </Button>
      </div>

      <Separator />

      <div className='flex flex-col gap-2'>
        <Label className='text-lg font-semibold'>Optimization Tools</Label>
        <Label className='text-sm text-muted-foreground'>
          Use these tools to enhance your resume content
        </Label>
      </div>

      {/* ATS Keyword Matcher */}
      <div className='flex flex-col gap-2'>
        <Label>ATS Keyword Matcher</Label>
        <Textarea
          placeholder='Paste job description from Indeed, LinkedIn, etc.'
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
          Match Keywords
        </Button>
      </div>

      {/* Clean Special Characters */}
      <div className='flex items-center justify-between'>
        <Label>Clean Special Characters</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={() => {
            if (!draft) return;

            const cleanedContent = cleanResumeContent(draft.content);
            setDraft({ ...draft, content: cleanedContent });

            showSuccess("Special characters cleaned successfully!");
          }}
        >
          Clean
        </Button>
      </div>

      {/* Detect Buzzwords */}
      <div className='flex items-center justify-between'>
        <Label>Detect Buzzwords</Label>
        <Button
          variant='outline'
          className='w-1/2'
          onClick={() => {
            if (!draft) return;

            const results = detectBuzzwords(draft.content);
            if (results.length === 0) {
              showSuccess("No buzzwords detected!");
            } else {
              const msg = results
                .map((r) => `${r.word} (${r.count})`)
                .join(", ");
              showWarning(`Buzzwords detected!`, msg);
            }
          }}
        >
          Run Detection
        </Button>
      </div>

      <Separator />

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
                  ATS Keyword Results
                </CardTitle>
                <CardDescription>
                  Review the keywords found in your resume compared to the job
                  description.
                </CardDescription>
              </CardHeader>

              <CardContent className='flex flex-col gap-4 max-h-72 overflow-y-auto'>
                <div>
                  <h3 className='font-semibold mb-1'>Present Keywords:</h3>
                  {atsResults.present.length > 0 ? (
                    <ul className='list-disc list-inside text-primary'>
                      {atsResults.present.map((word) => (
                        <li key={word}>{word}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      No keywords found in resume.
                    </p>
                  )}
                </div>

                <div>
                  <h3 className='font-semibold mb-1'>Missing Keywords:</h3>
                  {atsResults.missing.length > 0 ? (
                    <ul className='list-disc list-inside text-destructive'>
                      {atsResults.missing.map((word) => (
                        <li key={word}>{word}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      No missing keywords!
                    </p>
                  )}
                </div>
              </CardContent>

              <CardFooter className='flex justify-end'>
                <Button
                  variant='outline'
                  onClick={() => setAtsModalOpen(false)}
                >
                  Close
                </Button>
              </CardFooter>
            </Card>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
