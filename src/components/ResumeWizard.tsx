import { useState, useEffect } from "react";
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
import { AnimatePresence, motion } from "framer-motion";

export const ResumeWizard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Untitled Resume");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedId, setSuggestedId] = useState("untitled-resume");

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

  useEffect(() => {
    const updateId = async () => {
      const base = slugify(title);
      const unique = await getUniqueId(base);
      setSuggestedId(unique);
    };
    updateId();
  }, [title]);

  const handleFinish = async (useAI: boolean) => {
    setLoading(true);
    const settings = await getSettings();

    const newResume: ResumeData = {
      id: suggestedId,
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
      jobDesc: jobDesc ?? undefined,
    };

    if (useAI && jobDesc) {
      newResume.content = await simulateAI(newResume.content!, jobDesc);
    }

    await saveResume(newResume);
    setLoading(false);
    navigate(`/editor/${newResume.id}`);
  };

  const getTitleText = () => {
    switch (step) {
      case 1:
        return "Name Your Resume";
      case 2:
        return "Paste Job Description (Optional)";
      case 3:
        return "Trim Content with AI?";
      default:
        return "";
    }
  };

  const getDescText = () => {
    switch (step) {
      case 1:
        return "This will be the name of your resume. It will be used to identify your resume in the app. You can change it later.";
      case 2:
        return "Paste the job description you're targeting to help tailor your resume. This step is optional.";
      case 3:
        return "AI can help trim unrelated content from your resume based on the job description you provided.";
      default:
        return "";
    }
  };

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm'>
      <motion.div
        layout
        layoutRoot
        transition={{ layout: { duration: 0.25, ease: "easeInOut" } }}
        className='bg-background rounded-lg border shadow-lg w-full max-w-md p-6'
      >
        <AnimatePresence mode='wait'>
          <motion.div
            key={`header-${step}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className='flex flex-col gap-2 mb-4'
          >
            <h2 className='text-xl font-semibold'>{getTitleText()}</h2>
            <p className='text-sm text-muted-foreground'>{getDescText()}</p>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode='wait'>
          {step === 1 && (
            <motion.div
              key='step1'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className='flex flex-col gap-4'
            >
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              <p className='text-sm text-muted-foreground'>
                Filename: <code>{suggestedId}.resume</code>
              </p>
              <Button onClick={() => setStep(2)}>Next</Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key='step2'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className='flex flex-col gap-4'
            >
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
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key='step3'
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className='flex flex-col gap-4'
            >
              <p className='text-sm text-muted-foreground'>
                Would you like AI to trim your resume down to only what's
                relevant to the job?
              </p>
              <div className='flex gap-2 justify-end'>
                <Button variant='outline' onClick={() => handleFinish(false)}>
                  No, keep everything
                </Button>
                <Button disabled={loading} onClick={() => handleFinish(true)}>
                  {loading ? "Cleaning..." : "Yes, trim it"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
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
