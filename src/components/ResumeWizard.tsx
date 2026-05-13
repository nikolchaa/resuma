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
import { runResumeCleanup, runResumeEnhancement } from "@/lib/llmUtils";
import { cleanSpecialCharacters } from "@/lib/resumeUtils";
import { showWarning } from "@/lib/toastUtils";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type ResumeWizardProps = {
  generateThumbnail: (data: ResumeData) => Promise<string>;
};

export const ResumeWizard = ({ generateThumbnail }: ResumeWizardProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Untitled");
  const [jobDesc, setJobDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestedId, setSuggestedId] = useState("untitled");
  const [trim, setTrim] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);

  const sectionLabel = (section: string) => {
    switch (section) {
      case "education":
        return t("template.section.education");
      case "experience":
        return t("template.section.experience");
      case "projects":
        return t("template.section.projects");
      case "skills":
        return t("template.section.skills");
      default:
        return section;
    }
  };

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

    // Clean special characters before AI processing
    const cleanContent = (entry: any): any => {
      if (typeof entry === "string") return cleanSpecialCharacters(entry);
      if (Array.isArray(entry)) return entry.map(cleanContent);
      if (typeof entry === "object" && entry !== null) {
        const cleaned: any = {};
        for (const key in entry) {
          cleaned[key] = cleanContent(entry[key]);
        }
        return cleaned;
      }
      return entry;
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

    content = cleanContent(content);
    setStep(5);
    setLoading(true);

    try {
      // === AI Cleanup ===
      if (trim) {
        for (const [section, entries] of Object.entries(content)) {
          if (
            !["education", "experience", "projects", "skills"].includes(section)
          )
            continue;
          if (!Array.isArray(entries)) continue;

          const updated: any[] = [];

          for (const [index, entry] of entries.entries()) {
            setCurrentSection(
              `${t("wizard.status.trimming")} ${sectionLabel(section)} (${
                index + 1
              }/${entries.length})...`
            );

            try {
              const result = await runResumeCleanup(entry, jobDesc);

              if (result === "yes") {
                updated.push(entry);
              } else {
                console.log(`🗑️ Removed from ${section}:`, entry);
              }
            } catch (error: any) {
              showWarning(
                `Failed to trim ${section} (${
                  index + 1
                }). Keeping original entry.`
              );
              console.warn(
                `[Trim Error] ${section} (${index + 1}/${entries.length}):`,
                error
              );
              updated.push(entry);
            }
          }

          (content as any)[section] = updated;
          console.log(`✅ Trimmed section: ${section}`);
        }
      }

      // === AI Enhancement ===
      if (enhance) {
        for (const section of ["experience", "projects"]) {
          const entries = (content as any)[section];

          if (!Array.isArray(entries)) continue;

          const enhanced: any[] = [];

          for (const [index, entry] of entries.entries()) {
            setCurrentSection(
              `${t("wizard.status.enhancingSection")} ${sectionLabel(section)} (${
                index + 1
              }/${entries.length})...`
            );

            try {
              const result = await runResumeEnhancement(entry, jobDesc);
              const parsed = JSON.parse(result);

              enhanced.push(parsed);
            } catch (error: any) {
              showWarning(
                `Failed to enhance ${section} (${
                  index + 1
                }). Using original entry.`
              );

              console.warn(
                `[Enhancement Error] Failed for ${section} (${index + 1}/${
                  entries.length
                }):`,
                error
              );

              if (error && typeof error === "object" && "response" in error) {
                console.warn("Raw LLM response:", (error as any).response);
              }

              enhanced.push(entry);
            }
          }

          (content as any)[section] = enhanced;
          console.log(`✅ Enhanced section: ${section}`);
        }
      }
    } catch (error) {
      console.error("AI Processing failed:", error);
      showWarning(
        "AI processing failed. Your resume will still be created, but without AI cleanup or enhancement."
      );
    }

    setCurrentSection(t("wizard.status.finalizing"));
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
        return t("wizard.nameTitle");
      case 2:
        return t("wizard.jobTitle");
      case 3:
        return t("wizard.trimTitle");
      case 4:
        return t("wizard.enhanceTitle");
      default:
        return "";
    }
  };

  const getDescText = () => {
    switch (step) {
      case 1:
        return t("wizard.nameDesc");
      case 2:
        return t("wizard.jobDesc");
      case 3:
        return t("wizard.trimDesc");
      case 4:
        return t("wizard.enhanceDesc");
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
        {step !== 5 && (
          <motion.div
            className='group bg-background fixed top-8 left-8 z-50 border shadow-sm h-9 w-9 flex items-center justify-center rounded-lg hover:bg-primary dark:hover:bg-primary transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer'
            onClick={() => {
              if (step === 1) {
                navigate("/");
              } else if (step < 5) {
                setStep((prev) => Math.max(1, prev - 1));
              }
            }}
          >
            <ArrowLeft className='group-hover:dark:stroke-background transition duration-200 h-[calc(2.25rem-0.75rem)] w-[calc(2.25rem-0.75rem)]' />
          </motion.div>
        )}
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
                  {t("wizard.filename")} <code>{suggestedId}.resume</code>
                </p>
                <Button onClick={() => setStep(2)}>{t("wizard.next")}</Button>
              </div>
            )}

            {step === 2 && (
              <div className='flex flex-col gap-4'>
                <Textarea
                  placeholder={t("wizard.job.placeholder")}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  rows={6}
                />
                <div className='flex gap-2 justify-end'>
                  <Button variant='outline' onClick={() => handleFinish(false)}>
                    {t("wizard.skip")}
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={jobDesc.trim().length === 0}
                    title={
                      jobDesc.trim().length === 0
                        ? t("wizard.job.required")
                        : ""
                    }
                  >
                    {t("wizard.continue")}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className='flex flex-col gap-4'>
                <p>
                  {t("wizard.trim.question")}
                </p>
                <div className='flex gap-2 justify-end'>
                  <Button variant='outline' onClick={() => setStep(4)}>
                    {t("wizard.trim.no")}
                  </Button>
                  <Button
                    onClick={() => {
                      setStep(4);
                      setTrim(true);
                    }}
                  >
                    {t("wizard.trim.yes")}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className='flex flex-col gap-4'>
                <p>
                  {t("wizard.enhance.question")}
                </p>
                <div className='flex gap-2 justify-end'>
                  <Button variant='outline' onClick={() => handleFinish(false)}>
                    {t("wizard.enhance.no")}
                  </Button>
                  <Button
                    disabled={loading}
                    onClick={() => {
                      handleFinish(true);
                    }}
                  >
                    {loading ? t("wizard.enhancing") : t("wizard.enhance.yes")}
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
