import { Progress } from "@/components/ui/progress";
import { SettingsType, useOnboarding } from "@/contexts/OnboardingContext";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { motion as m, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useOutlet } from "react-router-dom";

const steps = [
  "step1", // Basic
  "step2", // Artificial
  "step3", // Personal
  "step4", // Education
  "step5", // Experience
  "step6", // Projects
  "step7", // Skills
  "step8", // Awards
  "step9", // Finish
];

export const Onboarding = () => {
  const [fadeOut, setFadeOut] = useState(false);

  const { apply } = useOnboarding();
  const navigate = useNavigate();
  const outlet = useOutlet({ context: fadeOut, setFadeOut });
  const location = useLocation();
  const currentPath = location.pathname.split("/").pop() ?? "";

  const stepIndex = steps.indexOf(currentPath);
  const progress =
    stepIndex === -1 ? 0 : (stepIndex / (steps.length - 1)) * 100;

  useEffect(() => {
    let details = "Setting up Resuma";
    let state = "Onboarding";

    const stepActivityMap: Record<string, { details: string; state: string }> =
      {
        step1: { details: "Choosing layout", state: "Onboarding: Basic Setup" },
        step2: { details: "Configuring LLM", state: "Onboarding: AI Setup" },
        step3: {
          details: "Entering personal information",
          state: "Onboarding: Personal Info",
        },
        step4: {
          details: "Adding courses & education",
          state: "Onboarding: Education",
        },
        step5: {
          details: "Adding work experience",
          state: "Onboarding: Experience",
        },
        step6: {
          details: "Listing all projects",
          state: "Onboarding: Projects",
        },
        step7: {
          details: "Listing skills",
          state: "Onboarding: Skills",
        },
        step8: {
          details: "Adding awards & achievements",
          state: "Onboarding: Awards",
        },
        step9: {
          details: "Finishing up",
          state: "Onboarding: Finish",
        },
      };

    if (stepActivityMap[currentPath]) {
      details = stepActivityMap[currentPath].details;
      state = stepActivityMap[currentPath].state;
    }

    invoke("set_activity", { details, state }).catch(
      (error) =>
        console.log(
          "Failed to update Discord presence",
          (error as Error).message
        ) // only for debugging, not shown to user
    );
  }, [currentPath]);

  return (
    <div
      className={`w-full min-h-screen flex flex-col items-center justify-center bg-background overflow-hidden transition-opacity duration-400 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <AnimatePresence mode='wait'>
        <m.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className='w-full h-full flex items-center justify-center'
        >
          {outlet}
        </m.div>
      </AnimatePresence>
      {location.pathname !== "/onboarding" && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => {
              const stepToSectionMap: Record<string, keyof SettingsType> = {
                step1: "app",
                step2: "llm",
                step3: "personal",
                step4: "education",
                step5: "experience",
                step6: "projects",
                step7: "skills",
                step8: "awards",
              };

              const section = stepToSectionMap[currentPath];
              if (section) {
                apply(section).then(() => navigate(-1));
              } else {
                navigate(-1);
              }
            }}
            className='cursor-pointer group bg-background fixed top-8 left-8 z-40 border shadow-sm h-9 w-9 flex items-center justify-center rounded-lg hover:bg-primary dark:hover:bg-primary transition duration-200'
          >
            <ArrowLeft className='group-hover:dark:stroke-background transition duration-200 h-[calc(2.25rem-0.75rem)] w-[calc(2.25rem-0.75rem)]' />
          </m.div>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className='fixed bottom-0 left-0 w-full bg-background'
          >
            <Progress className='w-full h-3 rounded-none' value={progress} />
          </m.div>
        </>
      )}
    </div>
  );
};
