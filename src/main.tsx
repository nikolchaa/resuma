import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import "./index.css";
import { ThemeProvider } from "./contexts/ThemeContext";
import Titlebar from "./components/Titlebar";
import { Home } from "./pages/Home";
import { Editor } from "./pages/Editor";
import { Onboarding } from "./pages/Onboarding/index";
import Settings from "./pages/Settings";
import Welcome from "./pages/Onboarding/Welcome";
import Basic from "./pages/Onboarding/Basic";
import Education from "./pages/Onboarding/Education";
import Personal from "./pages/Onboarding/Personal";
import Experience from "./pages/Onboarding/Experience";
import Skills from "./pages/Onboarding/Skills";
import Finish from "./pages/Onboarding/Finish";
import Projects from "./pages/Onboarding/Projects";
import Artificial from "./pages/Onboarding/Artificial";
import { SystemProvider } from "./contexts/SystemContext";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import Awards from "./pages/Onboarding/Awards";
import { BasicSettings } from "./pages/Settings/BasicSettings";
import { ArtificialSettings } from "./pages/Settings/ArtificialSettings";
import { PersonalSettings } from "./pages/Settings/PersonalSettings";
import { EducationSettings } from "./pages/Settings/EducationSettings";
import { ExperienceSettings } from "./pages/Settings/ExperienceSettings";
import { ProjectsSettings } from "./pages/Settings/ProjectsSettings";
import { SkillsSettings } from "./pages/Settings/SkillsSettings";
import { AwardsSettings } from "./pages/Settings/AwardsSettings";

const router = createBrowserRouter([
  {
    path: "/onboarding",
    element: (
      <OnboardingProvider>
        <Onboarding />
      </OnboardingProvider>
    ),
    children: [
      { path: "", element: <Welcome /> },
      { path: "step1", element: <Basic /> },
      { path: "step2", element: <Artificial /> },
      { path: "step3", element: <Personal /> },
      { path: "step4", element: <Education /> },
      { path: "step5", element: <Experience /> },
      { path: "step6", element: <Projects /> },
      { path: "step7", element: <Skills /> },
      { path: "step8", element: <Awards /> },
      { path: "step9", element: <Finish /> },
    ],
  },
  {
    path: "/",
    element: <App />, // main layout
    children: [
      { path: "", element: <Home /> },
      { path: "editor", element: <Editor /> },
      {
        path: "settings",
        element: <Settings />,
        children: [
          { path: "app", element: <BasicSettings /> },
          { path: "ai", element: <ArtificialSettings /> },
          { path: "personal", element: <PersonalSettings /> },
          { path: "education", element: <EducationSettings /> },
          { path: "experience", element: <ExperienceSettings /> },
          { path: "projects", element: <ProjectsSettings /> },
          { path: "skills", element: <SkillsSettings /> },
          { path: "awards", element: <AwardsSettings /> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <SystemProvider>
        <Titlebar />
        <RouterProvider router={router} />
      </SystemProvider>
    </ThemeProvider>
  </React.StrictMode>
);
