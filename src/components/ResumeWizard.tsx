import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/store";
import {
  saveResume,
  listResumes,
  ResumeData,
  ResumeContent,
} from "@/lib/resumesStore";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { matchATSKeywords } from "@/lib/resumeUtils";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import { normalizeResume } from "@/lib/resumeMigration";
import { startTailoring } from "@/lib/tailoring/job";
import { fill } from "@/components/ChangeReview";

type ResumeWizardProps = {
  generateThumbnail: (data: ResumeData) => Promise<string>;
};

/** The resume content a new resume starts from: the user's profile. */
async function profileContent(): Promise<ResumeContent> {
  const settings = await getSettings();
  return {
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
}

/**
 * New resume: a name, then an optional job ad. The resume is created and
 * opened at once; tailoring it to the job (when asked for) runs in the
 * background and arrives as suggestions to review.
 */
export const ResumeWizard = ({ generateThumbnail }: ResumeWizardProps) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Untitled");
  const [jobDesc, setJobDesc] = useState("");
  const [suggestedId, setSuggestedId] = useState("untitled");
  const [creating, setCreating] = useState(false);
  const [tailor, setTailor] = useState(true);
  const [profile, setProfile] = useState<ResumeContent | null>(null);
  const aiEnabled = useAiEnabled();

  useEffect(() => {
    profileContent().then(setProfile).catch(() => setProfile(null));
  }, []);

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
      const base = slugify(title) || "untitled";
      const unique = await getUniqueId(base);
      setSuggestedId(unique);
    };
    updateId();
  }, [title]);

  // Keyword coverage, without AI: how much of the ad the profile already mentions.
  const coverage = useMemo(() => {
    if (!profile || !jobDesc.trim()) return null;
    const { present, missing } = matchATSKeywords(profile, jobDesc);
    const total = present.length + missing.length;
    return total ? { present: present.length, total, missing } : null;
  }, [profile, jobDesc]);

  const willTailor = aiEnabled === true && tailor && jobDesc.trim().length > 0;

  const create = async () => {
    setCreating(true);
    try {
      const content = profile ?? (await profileContent());
      // Normalised so new files carry the current schema and defaults.
      const newResume: ResumeData = normalizeResume({
        id: suggestedId,
        title,
        updated: new Date().toISOString(),
        image: "https://placehold.co/210x297?text=New+Resume",
        content,
        jobDesc: jobDesc.trim() || undefined,
      })!;
      newResume.image = await generateThumbnail(newResume);
      await saveResume(newResume);
      if (willTailor) startTailoring(newResume.id, jobDesc);
      navigate(`/editor/${newResume.id}`);
    } finally {
      setCreating(false);
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
        <motion.div
          className='group bg-background fixed top-8 left-8 z-50 border shadow-sm h-9 w-9 flex items-center justify-center rounded-lg hover:bg-primary dark:hover:bg-primary transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:cursor-pointer'
          onClick={() => (step === 1 ? navigate("/") : setStep(1))}
        >
          <ArrowLeft className='group-hover:dark:stroke-background transition duration-200 h-[calc(2.25rem-0.75rem)] w-[calc(2.25rem-0.75rem)]' />
        </motion.div>
        <AnimatePresence mode='wait'>
          <motion.div
            key={`step-${step}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className='bg-background rounded-lg border shadow-lg w-full max-w-md p-6'
          >
            <div className='flex flex-col gap-2 mb-4'>
              <h2 className='text-xl font-semibold'>
                {step === 1 ? t("wizard.nameTitle") : t("wizard.jobTitle")}
              </h2>
              <p className='text-sm text-muted-foreground'>
                {step === 1 ? t("wizard.nameDesc") : t("wizard.jobDesc")}
              </p>
            </div>

            {step === 1 && (
              <form
                className='flex flex-col gap-4'
                onSubmit={(e) => {
                  e.preventDefault();
                  setStep(2);
                }}
              >
                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <p className='text-sm text-muted-foreground'>
                  {t("wizard.filename")} <code>{suggestedId}.resume</code>
                </p>
                <Button type='submit'>{t("wizard.next")}</Button>
              </form>
            )}

            {step === 2 && (
              <div className='flex flex-col gap-4'>
                <Textarea
                  placeholder={t("wizard.job.placeholder")}
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  rows={7}
                  className='max-h-72 select-text'
                  autoFocus
                />
                {coverage && (
                  <div className='flex flex-col gap-1 text-sm'>
                    <p>{fill(t("wizard.coverage"), { present: coverage.present, total: coverage.total })}</p>
                    {coverage.missing.length > 0 && (
                      <p className='text-muted-foreground'>
                        {fill(t("wizard.coverageMissing"), { values: coverage.missing.slice(0, 8).join(", ") })}
                      </p>
                    )}
                  </div>
                )}
                {aiEnabled === true && (
                  <div className='flex items-start gap-2'>
                    <Switch
                      id='wizard-tailor'
                      checked={tailor}
                      disabled={!jobDesc.trim()}
                      onCheckedChange={setTailor}
                      className='mt-0.5'
                    />
                    <div className='flex flex-col gap-1'>
                      <Label htmlFor='wizard-tailor' className={!jobDesc.trim() ? "opacity-50" : ""}>
                        {t("wizard.tailor")}
                      </Label>
                      <p className='text-xs text-muted-foreground'>{t("wizard.tailorHint")}</p>
                    </div>
                  </div>
                )}
                {aiEnabled === false && <p className='text-xs text-muted-foreground'>{t("ai.off.wizardHint")}</p>}
                <Button disabled={creating || aiEnabled === null} onClick={create}>
                  {t("wizard.create")}
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
};
