import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/lib/store";
import {
  saveResume,
  listResumes,
  ResumeData,
  ResumeContent,
} from "@/lib/resumesStore";
import { useNavigate } from "react-router-dom";

export const ResumeWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Untitled Resume");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  };

  const getUniqueId = async (base: string): Promise<string> => {
    const existing = await listResumes();
    const ids = new Set(existing.map((r) => r.id));
    if (!ids.has(base)) return base;

    let suffix = 1;
    let candidate = `${base}-${suffix}`;
    while (ids.has(candidate)) {
      suffix++;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  };

  const handleFinish = async (useAI: boolean) => {
    setLoading(true);
    const settings = await getSettings();
    const baseId = slugify(title);
    const uniqueId = await getUniqueId(baseId);

    const newResume: ResumeData = {
      id: uniqueId,
      title,
      updated: new Date().toISOString(),
      image: "https://placehold.co/210x297?text=New+Resume",
      content: {
        personal: settings.personal ?? {
          fullName: "",
          email: "",
          location: "",
          headline: "",
          socials: [],
        },
        education: settings.education ?? [],
        experience: settings.experience ?? [],
        projects: settings.projects ?? [],
        skills: settings.skills ?? [],
        awards: settings.awards ?? [],
      },
    };

    if (useAI && jobDesc) {
      newResume.content = await simulateAI(newResume.content!, jobDesc);
    }

    await saveResume(newResume);
    setLoading(false);
    navigate(`/editor/${newResume.id}`);
  };

  return (
    <Dialog open>
      <DialogContent className='max-w-md' showClose={false}>
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Name Your Resume"}
            {step === 2 && "Paste Job Description (Optional)"}
            {step === 3 && "Trim Content with AI?"}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className='flex flex-col gap-4'>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            <Button onClick={() => setStep(2)}>Next</Button>
          </div>
        )}

        {step === 2 && (
          <div className='flex flex-col gap-4'>
            <Textarea
              placeholder='Paste job description from Infostud, Indeed, etc.'
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
              rows={6}
            />
            <div className='flex gap-2 justify-end'>
              <Button variant='outline' onClick={() => handleFinish(false)}>
                Skip
              </Button>
              <Button onClick={() => setStep(3)}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className='flex flex-col gap-4'>
            <p className='text-sm text-muted-foreground'>
              Would you like AI to trim your resume down to only what's relevant
              to the job?
            </p>
            <div className='flex gap-2 justify-end'>
              <Button variant='outline' onClick={() => handleFinish(false)}>
                No, keep everything
              </Button>
              <Button disabled={loading} onClick={() => handleFinish(true)}>
                {loading ? "Cleaning..." : "Yes, trim it"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Temporary mock function
async function simulateAI(
  content: ResumeContent,
  jobDesc: string
): Promise<ResumeContent> {
  await new Promise((res) => setTimeout(res, 1500));
  console.log(jobDesc);
  return content; // 🧠 replace with real filtering logic later
}
