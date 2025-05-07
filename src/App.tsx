import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion as m } from "motion/react";
import { useEffect } from "react";
import { getSection } from "./lib/store";
import { applyContentSizeClass } from "./lib/ui";
import { useTheme } from "./contexts/ThemeContext";
import { invoke } from "@tauri-apps/api/core";
import { SettingsType } from "./contexts/OnboardingContext";

export default function App() {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();

  const { setTheme: setThemeContext } = useTheme();

  useEffect(() => {
    getSection<{
      contentSize?: "md" | "lg";
      theme?: "light" | "dark" | "system";
    }>("app").then((app) => {
      applyContentSizeClass(app?.contentSize ?? "md");
      setThemeContext(app?.theme ?? "system");
    });

    getSection<SettingsType["awards"]>("awards").then((section) => {
      section === undefined && navigate("/onboarding");
    });
  }, []);

  useEffect(() => {
    const path = location.pathname;
    let details = "Idling";
    let state = "Home";
    let smallImage = "homeblack";
    let smallText = "Home";

    if (path.includes("/editor")) {
      details = "Editing a resume";
      state = "Editor";
      smallImage = "writingblack";
      smallText = "Editor";
    }

    invoke("set_activity", { details, state, smallImage, smallText }).catch(
      console.error
    );
  }, [location.pathname]);

  return (
    <div className='min-h-screen bg-background text-foreground overflow-hidden'>
      <AnimatePresence mode='wait'>
        <m.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className='w-full h-full'
        >
          {outlet}
        </m.div>
      </AnimatePresence>
    </div>
  );
}
