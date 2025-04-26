import { useTheme } from "@/contexts/ThemeContext";

export const AppSettings = () => {
  const { setTheme } = useTheme();

  return (
    <div className='flex gap-2'>
      <button onClick={() => setTheme("light")}>🌞</button>
      <button onClick={() => setTheme("dark")}>🌙</button>
      <button onClick={() => setTheme("system")}>💻</button>
    </div>
  );
};
