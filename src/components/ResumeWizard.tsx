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
import { AnimatePresence, motion } from "motion/react";
import Loader from "@/assets/loader.svg?react";

type ResumeWizardProps = {
  generateThumbnail: (data: ResumeData) => Promise<string>;
};

export const ResumeWizard = ({ generateThumbnail }: ResumeWizardProps) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Untitled");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedId, setSuggestedId] = useState("untitled");
  const [trim, setTrim] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);

  const sections = [
    "Personal",
    "Education",
    "Experience",
    "Projects",
    "Skills",
    "Awards",
  ];

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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

  const handleFinish = async (enhance: boolean) => {
    const settings = await getSettings();

    let content: ResumeContent = {
      personal: settings.personal ?? {
        fullName: "",
        email: "",
        location: "",
        socials: [],
      },
      education: settings.education ?? [],
      experience: settings.experience ?? [],
      projects: settings.projects ?? [],
      skills: settings.skills ?? [],
      awards: settings.awards ?? [],
    };

    if (!trim && !enhance) {
      const newResume: ResumeData = {
        id: suggestedId,
        title,
        updated: new Date().toISOString(),
        image: "https://placehold.co/210x297?text=New+Resume",
        content,
        jobDesc: jobDesc || undefined,
      };
      newResume.image = await generateThumbnail(newResume);

      await saveResume(newResume);
      navigate(`/editor/${newResume.id}`);
      return;
    }

    setStep(5);
    setLoading(true);

    for (const section of sections) {
      setCurrentSection(`Processing ${section}...`);

      if (trim) {
        await mockTrim(section, jobDesc);
        console.log(`Trimmed ${section}`);
      }

      if (enhance) {
        await mockEnhance(section, jobDesc);
        console.log(`Enhanced ${section}`);
      }
    }

    // Show "Finalizing..." for 1.5s after everything else is done
    setCurrentSection("Finalizing...");
    await new Promise((res) => setTimeout(res, 1500));

    const newResume: ResumeData = {
      id: suggestedId,
      title,
      updated: new Date().toISOString(),
      image: "https://placehold.co/210x297?text=New+Resume",
      content,
      jobDesc: jobDesc || undefined,
    };
    newResume.image = await generateThumbnail(newResume);

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
        return "Trim Unrelated Content?";
      case 4:
        return "Enhance Resume for ATS?";
      default:
        return "";
    }
  };

  const getDescText = () => {
    switch (step) {
      case 1:
        return "This will be the name of your resume. You can change it later.";
      case 2:
        return "Not doing this might result in a generic resume that isn't optimized!";
      case 3:
        return "AI can remove unrelated content based on the job description.";
      case 4:
        return "AI can enhance your resume with keywords for better ATS compatibility.";
      default:
        return "";
    }
  };

  return (
    <AnimatePresence mode='wait'>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className='fixed inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm select-none'
      >
        <AnimatePresence mode='wait'>
          <motion.div
            key={`step-${step}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className='bg-background rounded-lg border shadow-lg w-full max-w-md p-6'
          >
            {step != 5 && (
              <div className='flex flex-col gap-2 mb-4'>
                <h2 className='text-xl font-semibold'>{getTitleText()}</h2>
                <p className='text-sm text-muted-foreground'>{getDescText()}</p>
              </div>
            )}

            {step === 1 && (
              <div className='flex flex-col gap-4'>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className='text-sm text-muted-foreground'>
                  Filename: <code>{suggestedId}.resume</code>
                </p>
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
                  <Button
                    onClick={() => setStep(3)}
                    disabled={jobDesc.trim().length === 0}
                    title={
                      jobDesc.trim().length === 0
                        ? "Job description required"
                        : ""
                    }
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className='flex flex-col gap-4'>
                <p>
                  Would you like AI to trim your resume based on the job
                  description?
                </p>
                <div className='flex gap-2 justify-end'>
                  <Button variant='outline' onClick={() => setStep(4)}>
                    No, skip
                  </Button>
                  <Button
                    onClick={() => {
                      setStep(4);
                      setTrim(true);
                    }}
                  >
                    Yes, trim it
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className='flex flex-col gap-4'>
                <p>
                  Would you like AI to enhance your resume for ATS
                  compatibility?
                </p>
                <div className='flex gap-2 justify-end'>
                  <Button variant='outline' onClick={() => handleFinish(false)}>
                    No, keep it simple
                  </Button>
                  <Button
                    disabled={loading}
                    onClick={() => {
                      handleFinish(true);
                    }}
                  >
                    {loading ? "Enhancing..." : "Yes, enhance it"}
                  </Button>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className='flex flex-col gap-4'>
                <Loader className='w-12 h-12 mx-auto' />
                <AnimatePresence mode='wait'>
                  {currentSection && (
                    <motion.div
                      key={currentSection}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className='text-center text-md'
                    >
                      {currentSection}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};

// 🧪 Mock Functions
async function mockTrim(section: string, jobDesc: string): Promise<string> {
  console.log(`Trimming content... based on: ${jobDesc}`);
  await new Promise((res) => setTimeout(res, 1500));
  return section;
}

async function mockEnhance(section: string, jobDesc: string): Promise<string> {
  console.log(`Enhancing content... based on: ${jobDesc}`);
  await new Promise((res) => setTimeout(res, 1500));
  return section;
}
