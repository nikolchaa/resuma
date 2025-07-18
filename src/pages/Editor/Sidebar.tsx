import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PersonalEditor } from "./PersonalEditor";
import { ExperienceEditor } from "./ExperienceEditor";
import { EducationEditor } from "./EducationEditor";
import { ProjectsEditor } from "./ProjectsEditor";
import { SkillsEditor } from "./SkillsEditor";
import { AwardsEditor } from "./AwardsEditor";
import { Button } from "@/components/ui/button";
import { ResumeData } from "@/lib/resumesStore";
import Logo from "@/assets/Logo.svg?react";
import { AnimatePresence, motion as m } from "motion/react";
import { ResumeEditor } from "./ResumeEditor";
import { Card, CardContent } from "@/components/ui/card";
import Loader from "@/assets/loader.svg?react";

type SidebarProps = {
  draft: ResumeData | null;
  setDraft: React.Dispatch<React.SetStateAction<ResumeData | null>>;
  handleDiscard: () => void;
  handleSave: () => void;
};

const TABS = [
  { id: "resume", label: "Resume" },
  { id: "personal", label: "Personal" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "projects", label: "Projects" },
  { id: "skills", label: "Skills" },
  { id: "awards", label: "Awards" },
];

export const Sidebar: React.FC<SidebarProps> = ({
  draft,
  setDraft,
  handleDiscard,
  handleSave,
}) => {
  const [activeTab, setActiveTab] = useState<string>("resume");
  const [openLoader, setOpenLoader] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | undefined>(
    undefined
  );

  const updateDraft = <K extends keyof ResumeData["content"]>(
    section: K,
    data: Partial<ResumeData["content"][K]> | ResumeData["content"][K]
  ) => {
    if (!draft) return;

    const current = draft.content[section];
    const isDifferent = JSON.stringify(current) !== JSON.stringify(data);
    if (!isDifferent) return; // Avoid unnecessary state updates

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            content: {
              ...prev.content,
              [section]: Array.isArray(data)
                ? data
                : { ...(prev.content?.[section] as any), ...(data as any) },
            },
          }
        : null
    );
  };

  return (
    <div className='bg-background min-w-[28rem] w-[28rem] max-w-[28rem] border-r shadow-sm flex flex-col'>
      <Logo className='w-full p-8' />

      {/* Custom Tabs */}
      <div className='flex flex-wrap gap-2 p-4 border-b sticky top-0 z-10 bg-background w-full'>
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={"ghost"}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 text-sm rounded-md ${
              activeTab.toLowerCase() === tab.id.toLowerCase()
                ? "bg-primary text-primary-foreground hover:bg-primary/80 dark:hover:bg-primary/80 dark:text-background"
                : "hover:bg-muted"
            }`}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <div className='flex-1 overflow-y-auto p-4'>
        <AnimatePresence mode='wait'>
          {activeTab === "personal" && (
            <m.div
              key='personal'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <PersonalEditor
                settings={draft?.content?.personal}
                updateDraft={updateDraft}
              />
            </m.div>
          )}
          {activeTab === "experience" && (
            <m.div
              key='experience'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ExperienceEditor
                settings={draft?.content?.experience}
                updateDraft={updateDraft}
                jobDesc={draft?.jobDesc || ""}
                setOpenLoader={setOpenLoader}
                setCurrentSection={setCurrentSection}
              />
            </m.div>
          )}
          {activeTab === "education" && (
            <m.div
              key='education'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <EducationEditor
                settings={draft?.content?.education}
                updateDraft={updateDraft}
              />
            </m.div>
          )}
          {activeTab === "projects" && (
            <m.div
              key='projects'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ProjectsEditor
                settings={draft?.content?.projects}
                updateDraft={updateDraft}
                jobDesc={draft?.jobDesc || ""}
                setOpenLoader={setOpenLoader}
                setCurrentSection={setCurrentSection}
              />
            </m.div>
          )}
          {activeTab === "skills" && (
            <m.div
              key='skills'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SkillsEditor
                settings={draft?.content?.skills}
                updateDraft={updateDraft}
              />
            </m.div>
          )}
          {activeTab === "awards" && (
            <m.div
              key='awards'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <AwardsEditor
                settings={draft?.content?.awards}
                updateDraft={updateDraft}
                jobDesc={draft?.jobDesc || ""}
                setOpenLoader={setOpenLoader}
                setCurrentSection={setCurrentSection}
              />
            </m.div>
          )}
          {activeTab === "resume" && (
            <m.div
              key='resume'
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ResumeEditor draft={draft} setDraft={setDraft} />
            </m.div>
          )}
        </AnimatePresence>
      </div>

      <div className='flex gap-4 p-4 border-t'>
        <Button onClick={handleDiscard} variant='outline'>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <Button onClick={handleSave} className='flex-1'>
          Save
        </Button>
      </div>

      {/* AI Loader Modal */}
      <AnimatePresence>
        {openLoader && (
          <m.div
            key='ai-enhance-modal'
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className='fixed inset-0 z-40 flex items-center justify-center bg-background/50 backdrop-blur-sm'
          >
            <Card className='w-full max-w-md p-6'>
              <CardContent>
                <div className='flex flex-col gap-4'>
                  <Loader className='w-12 h-12 mx-auto' />
                  <AnimatePresence mode='wait'>
                    {currentSection && (
                      <m.div
                        key={currentSection}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className='text-center text-md'
                      >
                        {currentSection}
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
