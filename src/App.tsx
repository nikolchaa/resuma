import { useLocation, useNavigate, useOutlet } from "react-router-dom";
import { AnimatePresence, motion as m } from "motion/react";
import { useEffect } from "react";
import { getSection } from "./lib/store";
import { applyContentSizeClass } from "./lib/ui";
import { useTheme } from "./contexts/ThemeContext";
import {
  setDiscordPresenceEnabled,
  updateDiscordPresence,
} from "./lib/discord";
import { SettingsType } from "./contexts/OnboardingContext";
import { McpBridge } from "./components/McpBridge";
import { Suggestions } from "./components/Suggestions";

export default function App() {
  const location = useLocation();
  const outlet = useOutlet();
  const navigate = useNavigate();

  const { setTheme: setThemeContext } = useTheme();

  useEffect(() => {
    const requiredSections: (keyof SettingsType)[] = [
      "app",
      "llm",
      "personal",
      "education",
      "experience",
      "projects",
      "skills",
      "awards",
    ];

    const checkSections = async () => {
      const results = await Promise.all(
        requiredSections.map((section) => getSection(section))
      );
      const app = results[0] as SettingsType["app"];
      applyContentSizeClass(app?.contentSize ?? "md");
      setThemeContext(app?.theme ?? "system");
      // Discord presence is opt-in; nothing connects to Discord unless it's on.
      setDiscordPresenceEnabled(app?.discordPresence ?? false);
      const allExist = results.every(
        (sectionData) => sectionData !== undefined
      );

      !allExist && navigate("/onboarding");
    };

    checkSections();
  }, []);

  useEffect(() => {
    updateDiscordPresence("Idling", "Home");
  }, [location.pathname]);

  return (
    <div className='min-h-screen bg-background text-foreground overflow-hidden'>
      <McpBridge />
      <Suggestions />
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
