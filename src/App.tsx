import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion as m } from "motion/react";
import { useEffect } from "react";
import { getSection } from "./lib/store";
import { applyContentSizeClass } from "./lib/ui";
import { useTheme } from "./contexts/ThemeContext";

export default function App() {
  const location = useLocation();
  const outlet = useOutlet();

  const { setTheme: setThemeContext } = useTheme();

  useEffect(() => {
    getSection<{
      contentSize?: "md" | "lg";
      theme?: "light" | "dark" | "system";
    }>("app").then((app) => {
      applyContentSizeClass(app?.contentSize ?? "md");
      setThemeContext(app?.theme ?? "system");
    });
  }, []);

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
