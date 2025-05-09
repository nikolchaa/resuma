import { createContext, useContext, useEffect, useState } from "react";
import { getSection, updateSection } from "@/lib/store";

export type SettingsType = {
  app: {
    theme: "light" | "dark" | "system";
    paperSize: "A4" | "US Letter";
    language: "en";
    contentSize: "md" | "lg";
  };
  llm: {
    model: string;
    runtime: string;
    settings: {
      ctxSize: number;
      gpuLayers: number;
      flashAttn: boolean;
      mlock: boolean;
      noMmap: boolean;
    };
  };
  personal: {
    fullName: string;
    email: string;
    location: string;
    headline: string;
    socials: string[];
  };
  education: {
    school: string;
    degree: string;
    location: string;
    gpa: string;
    date: {
      from: string;
      to?: string;
    };
    courses?: string[]; // ← added field for relevant coursework
  }[];
  experience: {
    jobTitle: string;
    company: string;
    location: string;
    description: string;
    date: {
      from: string;
      to?: string;
    };
    notes?: string[];
  }[];
  projects: {
    name: string;
    link?: string;
    date: { from: string }; // e.g. "Apr 2024"
    description: string;
    technologies: string[]; // optional tags/keywords
  }[];
  skills: {
    category: string;
    items: string[];
  }[];
  awards: {
    title: string;
    organizer: string;
    date: { from: string }; // e.g. "Apr 2024"
    description: string;
    location: string;
  }[];
};

const defaultState: SettingsType = {
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
    socials: [],
  },
  education: [
    {
      school: "",
      degree: "",
      location: "",
      gpa: "",
      date: { from: "Jan 2021", to: "Jan 2025" },
      courses: [],
    },
  ],
  experience: [
    {
      jobTitle: "",
      company: "",
      location: "",
      description: "",
      date: { from: "", to: "" },
      notes: [],
    },
  ],
  projects: [
    {
      name: "",
      link: "",
      date: { from: "" },
      description: "",
      technologies: [],
    },
  ],
  skills: [
    {
      category: "",
      items: [],
    },
  ],
  awards: [
    {
      title: "",
      organizer: "",
      date: { from: "" },
      description: "",
      location: "",
    },
  ],
};

const OnboardingContext = createContext<{
  state: SettingsType;
  update: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => void;
  apply: <K extends keyof SettingsType>(section: K) => Promise<void>;
  exists: (section: keyof SettingsType) => Promise<boolean>;
} | null>(null);

export const OnboardingProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [state, setState] = useState<SettingsType>(defaultState);

  useEffect(() => {
    const load = async () => {
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
              to: entry.date?.to ?? "",
            },
            courses: Array.isArray(entry.courses) ? entry.courses : [],
          }))
        : defaultState.education;

      const experience = Array.isArray(experienceRaw)
        ? experienceRaw.map((entry) => ({
            jobTitle: entry.jobTitle ?? "",
            company: entry.company ?? "",
            location: entry.location ?? "",
            date: {
              from: entry.date?.from ?? "",
              to: entry.date?.to ?? "",
            },
            description: entry.description ?? "",
            notes: Array.isArray(entry.notes) ? entry.notes : [],
          }))
        : defaultState.experience;

      const projects = Array.isArray(projectsRaw)
        ? projectsRaw.map((entry) => ({
            name: entry.name ?? "",
            link: entry.link ?? "",
            date: entry.date ?? "",
            description: entry.description ?? "",
            technologies: Array.isArray(entry.technologies)
              ? entry.technologies
              : [],
          }))
        : defaultState.projects;

      const skills = Array.isArray(skillsRaw)
        ? skillsRaw.map((group) => ({
            category: group.category ?? "",
            items: Array.isArray(group.items) ? group.items : [],
          }))
        : defaultState.skills;

      const awards = Array.isArray(awardsRaw)
        ? awardsRaw.map((entry) => ({
            title: entry.title ?? "",
            organizer: entry.organizer ?? "",
            date: entry.date ?? "",
            description: entry.description ?? "",
            location: entry.location ?? "",
          }))
        : defaultState.awards;

      setState((prev) => ({
        ...prev,
        app: { ...prev.app, ...app },
        llm: { ...prev.llm, ...llm },
        personal: { ...prev.personal, ...personal },
        education,
        experience,
        projects,
        skills,
        awards,
      }));
    };

    load();
  }, []);

  const update = <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]> | SettingsType[K]
  ) => {
    setState((prev) => ({
      ...prev,
      [section]: Array.isArray(data)
        ? (data as SettingsType[K])
        : {
            ...prev[section],
            ...data,
          },
    }));
  };

  const apply = async <K extends keyof SettingsType>(section: K) => {
    await updateSection(section, state[section]);
  };

  const exists = async (section: keyof SettingsType): Promise<boolean> => {
    const value = await getSection(section);
    return value !== undefined;
  };

  return (
    <OnboardingContext.Provider value={{ state, update, apply, exists }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context)
    throw new Error("useOnboarding must be used inside OnboardingProvider");
  return context;
};
