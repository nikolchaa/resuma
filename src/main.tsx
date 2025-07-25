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
import { Toaster } from "./components/ui/sonner";

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
    element: <App />,
    children: [
      { path: "", element: <Home /> },
      { path: "new", element: <Editor /> },
      { path: "editor/:id", element: <Editor /> },
      { path: "settings", element: <Settings /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <SystemProvider>
        <Titlebar />
        <Toaster />
        <RouterProvider router={router} />
      </SystemProvider>
    </ThemeProvider>
  </React.StrictMode>
);
