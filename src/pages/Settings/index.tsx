import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { AnimatePresence, motion as m } from "motion/react";

import { BasicSettings } from "./BasicSettings";
import { ArtificialSettings } from "./ArtificialSettings";
import { PersonalSettings } from "./PersonalSettings";
import { EducationSettings } from "./EducationSettings";
import { ExperienceSettings } from "./ExperienceSettings";
import { ProjectsSettings } from "./ProjectsSettings";
import { SkillsSettings } from "./SkillsSettings";
import { AwardsSettings } from "./AwardsSettings";

import { Back } from "@/components/Back";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { SettingsType } from "@/contexts/OnboardingContext";
import { getSection, updateSection } from "@/lib/store";
import { Button } from "@/components/ui/button";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("basic");
  const [settings, setSettings] = useState<SettingsType>({
    app: {
      theme: "system",
      paperSize: "A4",
      language: "en",
      contentSize: "md",
    },
    llm: {
      model: "",
      runtime: "",
      settings: {
        ctxSize: 0,
        gpuLayers: 0,
        flashAttn: false,
        mlock: false,
        noMmap: false,
      },
    },
    personal: {
      fullName: "",
      email: "",
      location: "",
      headline: "",
    },
    education: [],
    experience: [],
    projects: [],
    skills: [],
    awards: [],
  });
  const [draftSettings, setDraftSettings] = useState<SettingsType>(settings);

  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const updateSettings = <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]>
  ) => {
    setDraftSettings((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as object),
        ...(data as object),
      },
    }));
  };

  const applySettings = async () => {
    setSettings(draftSettings);
    await updateSection("app", draftSettings.app);
    await updateSection("llm", draftSettings.llm);
    await updateSection("personal", draftSettings.personal);
    await updateSection("education", draftSettings.education);
    await updateSection("experience", draftSettings.experience);
    await updateSection("projects", draftSettings.projects);
    await updateSection("skills", draftSettings.skills);
    await updateSection("awards", draftSettings.awards);
  };

  const resetSettings = () => {
    setDraftSettings(settings);
  };

  useEffect(() => {
    const loadSettings = async () => {
      const [
        app,
        llm,
        personal,
        education,
        experience,
        projects,
        skills,
        awards,
      ] = await Promise.all([
        getSection("app"),
        getSection("llm"),
        getSection("personal"),
        getSection("education"),
        getSection("experience"),
        getSection("projects"),
        getSection("skills"),
        getSection("awards"),
      ]);

      setSettings((prev) => ({
        app: { ...prev.app, ...(app ?? {}) },
        llm: { ...prev.llm, ...(llm ?? {}) },
        personal: { ...prev.personal, ...(personal ?? {}) },
        education: Array.isArray(education) ? education : [],
        experience: Array.isArray(experience) ? experience : [],
        projects: Array.isArray(projects) ? projects : [],
        skills: Array.isArray(skills) ? skills : [],
        awards: Array.isArray(awards) ? awards : [],
      }));

      setDraftSettings((prev) => ({
        app: { ...prev.app, ...(app ?? {}) },
        llm: { ...prev.llm, ...(llm ?? {}) },
        personal: { ...prev.personal, ...(personal ?? {}) },
        education: Array.isArray(education) ? education : [],
        experience: Array.isArray(experience) ? experience : [],
        projects: Array.isArray(projects) ? projects : [],
        skills: Array.isArray(skills) ? skills : [],
        awards: Array.isArray(awards) ? awards : [],
      }));
    };

    loadSettings();
  }, []);

  useEffect(() => {
    let details = "Adjusting settings";
    let state = "Settings";
    let smallImage = "settingsblack";
    let smallText = "Settings";

    switch (activeTab) {
      case "basic":
        details = "Customizing layout and theme";
        state = "Settings: App Settings";
        break;
      case "artificial":
        details = "Configuring LLM";
        state = "Settings: AI Settings";
        break;
      case "personal":
        details = "Editing personal information";
        state = "Settings: Personal Info";
        break;
      case "education":
        details = "Editing courses & education";
        state = "Settings: Education";
        break;
      case "experience":
        details = "Editing work experience";
        state = "Settings: Experience";
        break;
      case "projects":
        details = "Editing list of projects";
        state = "Settings: Projects";
        break;
      case "skills":
        details = "Editing list of skills";
        state = "Settings: Skills";
        break;
      case "awards":
        details = "Editing awards & achievements";
        state = "Settings: Awards";
        break;
    }

    invoke("set_activity", { details, state, smallImage, smallText }).catch(
      console.error
    );
  }, [activeTab]);

  useEffect(() => {
    const deepEqual = (a: any, b: any): boolean => {
      if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => deepEqual(val, b[i]));
      }

      if (
        typeof a === "object" &&
        typeof b === "object" &&
        a !== null &&
        b !== null
      ) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;

        return aKeys.every(
          (key) => b.hasOwnProperty(key) && deepEqual(a[key], b[key])
        );
      }

      return a === b;
    };

    const changed = (
      [
        "llm",
        "personal",
        "education",
        "experience",
        "projects",
        "skills",
        "awards",
      ] as const
    ).some((key) => !deepEqual(draftSettings[key], settings[key]));

    setUnsavedChanges(changed);
  }, [draftSettings, settings]);

  return (
    <div className='flex w-full h-screen items-center justify-center'>
      <Back location='/' />
      <div className='flex max-w-[75rem] w-[calc(100vw-12.5rem)] h-screen gap-8'>
        {/* Apply Settings popup */}
        <AnimatePresence>
          {unsavedChanges && (
            <m.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className='fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-popover border rounded-lg shadow-md p-2 flex gap-2 items-center'
            >
              <span className='pl-2 text-sm text-muted-foreground'>
                You have unsaved changes.
              </span>
              <Button variant='ghost' onClick={resetSettings}>
                Reset
              </Button>
              <Button variant='default' onClick={applySettings}>
                Apply
              </Button>
            </m.div>
          )}
        </AnimatePresence>

        {/* Left Vertical Tabs */}
        <div className='mt-8 sticky h-full'>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            orientation='vertical'
          >
            <TabsList className='flex flex-col gap-2 bg-background border shadow-sm p-2 h-full'>
              <TabsTrigger
                value='basic'
                className='px-4 py-2 w-48 justify-baseline'
              >
                App Settings
              </TabsTrigger>
              <TabsTrigger
                value='artificial'
                className='px-4 py-2 w-48 justify-baseline'
              >
                AI Settings
              </TabsTrigger>
              <TabsTrigger
                value='personal'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Personal Info
              </TabsTrigger>
              <TabsTrigger
                value='education'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Education
              </TabsTrigger>
              <TabsTrigger
                value='experience'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Experience
              </TabsTrigger>
              <TabsTrigger
                value='projects'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Projects
              </TabsTrigger>
              <TabsTrigger
                value='skills'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Skills
              </TabsTrigger>
              <TabsTrigger
                value='awards'
                className='px-4 py-2 w-48 justify-baseline'
              >
                Awards
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Right Content Area */}
        <div className='flex-1 py-8 overflow-y-auto'>
          <AnimatePresence mode='wait'>
            {activeTab === "basic" && (
              <m.div
                key='basic-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      App Settings
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Configure your general app preferences. Import and export
                      your application settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BasicSettings
                      settings={draftSettings.app}
                      setDraftSettings={setDraftSettings}
                      setSettings={setSettings}
                      draftSettings={draftSettings}
                    />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "artificial" && (
              <m.div
                key='artificial-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      AI Setup
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Adjust preferences for AI-powered resume generation,
                      including model selection, runtime options, and LLM
                      parameters.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ArtificialSettings
                      llm={draftSettings.llm}
                      updateSettings={updateSettings}
                      stockSettings={settings.llm}
                    />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "personal" && (
              <m.div
                key='personal-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Personal Details
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Change your info used across all resumes. These will
                      always be displayed on your resume.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PersonalSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "education" && (
              <m.div
                key='education-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Education
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      List your educational background, including school,
                      degree, and relevant coursework.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EducationSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "experience" && (
              <m.div
                key='experience-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Experience
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add your work history with key roles and accomplishments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ExperienceSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "projects" && (
              <m.div
                key='projects-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Projects
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Show off your best work. Include side projects, open
                      source, or professional apps.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProjectsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "skills" && (
              <m.div
                key='skills-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Skills
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add your professional and technical skills grouped by
                      category.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SkillsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}

            {activeTab === "awards" && (
              <m.div
                key='awards-settings'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className='text-2xl font-semibold'>
                      Awards
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      Add any notable awards or recognitions you've received.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AwardsSettings />
                  </CardContent>
                </Card>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
