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
} from "@/lib/resumeUtils";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";

type Props = {
  draft: any;
  setDraft: any; // will need it later
};

export const ResumeEditor = ({ draft, setDraft }: Props) => {
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
      {/* Template Switcher */}
      <div className='flex items-center justify-between'>
        <Label className='w-1/3'>Template</Label>
        <Select>
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
        <Select>
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder='Select a font' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='figtree'>Figtree</SelectItem>
            <SelectItem value='inter'>Inter</SelectItem>
            <SelectItem value='sourceSans'>Source Sans</SelectItem>
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
        <Textarea placeholder='Paste job description here...' />
        <Button variant='outline' className='self-end'>
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
    </div>
  );
};
