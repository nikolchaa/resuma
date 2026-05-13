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

import { defaultState, SettingsType } from "@/contexts/OnboardingContext";
import { getSection, updateSection } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getIdentifier,
  getTauriVersion,
  getVersion,
} from "@tauri-apps/api/app";
import { showError, showSuccess, showUpdateAvailable } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Settings() {
  const { t } = useLanguage();
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
    },
    education: [],
    experience: [],
    projects: [],
    skills: [],
    awards: [],
  });
  const [draftSettings, setDraftSettings] = useState<SettingsType>(settings);

  const [unsavedChanges, setUnsavedChanges] = useState(false);

  const [version, setVersion] = useState<string>("");
  const [identifier, setIdentifier] = useState<string>("");
  const [tauriVersion, setTauriVersion] = useState<string>("");

  useEffect(() => {
    getVersion()
      .then((v) => {
        setVersion(v);
      })
        .catch((error) =>
          showError(t("settings.error.fetchVersion"), (error as Error).message)
        );

    getIdentifier()
      .then((id) => {
        setIdentifier(id);
      })
        .catch((error) =>
          showError(t("settings.error.fetchIdentifier"), (error as Error).message)
        );

    getTauriVersion()
      .then((v) => {
        setTauriVersion(v);
      })
        .catch((error) =>
          showError(t("settings.error.fetchTauriVersion"), (error as Error).message)
        );
  }, [t]);

  const updateSettings = <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => {
    setDraftSettings((prev) => ({
      ...prev,
      [section]: Array.isArray(data)
        ? (data as SettingsType[K])
        : { ...(prev[section] as any), ...(data as any) },
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
        educationRaw,
        experienceRaw,
        projectsRaw,
        skillsRaw,
        awardsRaw,
      ] = await Promise.all([
        getSection<SettingsType["app"]>("app"),
        getSection<SettingsType["llm"]>("llm"),
        getSection<SettingsType["personal"]>("personal"),
        getSection("education"),
        getSection("experience"),
        getSection("projects"),
        getSection("skills"),
        getSection("awards"),
      ]);

      const education = Array.isArray(educationRaw)
        ? educationRaw.map((entry) => ({
            school: entry.school ?? "",
            degree: entry.degree ?? "",
            location: entry.location ?? "",
            gpa: entry.gpa ?? "",
            date: {
              from: entry.date?.from ?? "",
              to: entry.date?.to ?? undefined,
            },
            courses: Array.isArray(entry.courses) ? [...entry.courses] : [],
          }))
        : [...defaultState.education];

      const experience = Array.isArray(experienceRaw)
        ? experienceRaw.map((entry) => ({
            jobTitle: entry.jobTitle ?? "",
            company: entry.company ?? "",
            location: entry.location ?? "",
            description: entry.description ?? "",
            date: {
              from: entry.date?.from ?? "",
              to: entry.date?.to ?? undefined,
            },
            notes: Array.isArray(entry.notes) ? [...entry.notes] : [],
          }))
        : [...defaultState.experience];

      const projects = Array.isArray(projectsRaw)
        ? projectsRaw.map((entry) => ({
            name: entry.name ?? "",
            link: entry.link ?? "",
            date: entry.date ?? "",
            description: entry.description ?? "",
            technologies: Array.isArray(entry.technologies)
              ? [...entry.technologies]
              : [],
          }))
        : [...defaultState.projects];

      const skills = Array.isArray(skillsRaw)
        ? skillsRaw.map((entry) => ({
            category: entry.category ?? "",
            items: Array.isArray(entry.items) ? [...entry.items] : [],
          }))
        : [...defaultState.skills];

      const awards = Array.isArray(awardsRaw)
        ? awardsRaw.map((entry) => ({
            title: entry.title ?? "",
            organizer: entry.organizer ?? "",
            date: entry.date ?? "",
            description: entry.description ?? "",
            location: entry.location ?? "",
          }))
        : [...defaultState.awards];

      const loaded: SettingsType = {
        app: { ...defaultState.app, ...(app ?? {}) },
        llm: {
          ...defaultState.llm,
          ...(llm ?? {}),
          settings: {
            ...defaultState.llm.settings,
            ...(llm?.settings ?? {}),
          },
        },
        personal: { ...defaultState.personal, ...(personal ?? {}) },
        education,
        experience,
        projects,
        skills,
        awards,
      };

      setSettings(loaded);
      setDraftSettings(loaded);
    };

    loadSettings();
  }, []);

  useEffect(() => {
    let details = "Adjusting settings";
    let state = "Settings";

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

    invoke("set_activity", { details, state }).catch(
      (error) =>
        console.log(
          "Failed to update Discord presence",
          (error as Error).message
        ) // only for debugging, not shown to user
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
      <div className='flex max-w-[75rem] w-[calc(100vw-12.5rem)] h-screen gap-8 select-none'>
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
                  {t("settings.unsavedChanges")}
                </span>
                <Button variant='ghost' onClick={resetSettings}>
                  {t("common.reset")}
                </Button>
                <Button variant='default' onClick={applySettings}>
                  {t("common.apply")}
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
                 {t("settings.tab.app")}
              </TabsTrigger>
              <TabsTrigger
                value='artificial'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("settings.tab.ai")}
              </TabsTrigger>
              <TabsTrigger
                value='personal'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("settings.tab.personal")}
              </TabsTrigger>
              <TabsTrigger
                value='education'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("template.section.education")}
              </TabsTrigger>
              <TabsTrigger
                value='experience'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("template.section.experience")}
              </TabsTrigger>
              <TabsTrigger
                value='projects'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("template.section.projects")}
              </TabsTrigger>
              <TabsTrigger
                value='skills'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("template.section.skills")}
              </TabsTrigger>
              <TabsTrigger
                value='awards'
                className='px-4 py-2 w-48 justify-baseline'
              >
                 {t("template.section.awards")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {/* Version */}
          <div className='flex flex-col gap-4 w-[13.125rem] p-4 mt-2'>
            <Label>
              {t("settings.version")}:{" "}
              <span className='text-muted-foreground'>{version}</span>
            </Label>
            <Label>
              {t("settings.identifier")}:{" "}
              <span className='text-muted-foreground'>{identifier}</span>
            </Label>
            <Label>
              {t("settings.tauriVersion")}:{" "}
              <span className='text-muted-foreground'>{tauriVersion}</span>
            </Label>
          </div>
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
                      {t("settings.app.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.app.description")}
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
                <Card className='mt-8'>
                  <CardContent className='flex flex-col gap-4'>
                    <Label className='text-lg'>{t("settings.updates.heading")}</Label>
                    <Button
                      variant='outline'
                      className='self-start'
                      onClick={async () => {
                        console.log("Checking GitHub for latest version...");

                        try {
                          const current = await getVersion();

                          const res = await fetch(
                            "https://api.github.com/repos/nikolchaa/resuma/releases"
                          );
                          const releases = await res.json();

                          if (
                            !Array.isArray(releases) ||
                            releases.length === 0
                          ) {
                            throw new Error("No releases found.");
                          }

                          const latestTag = releases[0].tag_name?.replace(
                            /^v/,
                            ""
                          );
                          if (!latestTag) {
                            throw new Error("No tag name in latest release.");
                          }

                          if (latestTag !== current) {
                            console.log(
                              `New version available: ${latestTag} (current: ${current})`
                            );
                            showUpdateAvailable(latestTag);
                          } else {
                            showSuccess(t("settings.updates.latest"));
                          }
                        } catch (err) {
                          console.error("Failed to check for updates:", err);
                            showError(
                              t("settings.updates.checkFailed"),
                              err instanceof Error ? err.message : undefined
                            );
                        }
                      }}
                    >
                      {t("settings.updates.check")}
                    </Button>
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
                      {t("settings.ai.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.ai.description")}
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
                      {t("settings.personal.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.personal.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PersonalSettings
                      settings={draftSettings.personal}
                      updateSettings={updateSettings}
                    />
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
                      {t("settings.education.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.education.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EducationSettings
                      settings={draftSettings.education}
                      updateSettings={updateSettings}
                    />
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
                      {t("settings.experience.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.experience.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ExperienceSettings
                      settings={draftSettings.experience}
                      updateSettings={updateSettings}
                    />
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
                      {t("settings.projects.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.projects.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProjectsSettings
                      settings={draftSettings.projects}
                      updateSettings={updateSettings}
                    />
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
                      {t("settings.skills.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.skills.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SkillsSettings
                      settings={draftSettings.skills}
                      updateSettings={updateSettings}
                    />
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
                      {t("settings.awards.heading")}
                    </CardTitle>
                    <CardDescription className='text-sm text-muted-foreground'>
                      {t("settings.awards.description")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AwardsSettings
                      settings={draftSettings.awards}
                      updateSettings={updateSettings}
                    />
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
