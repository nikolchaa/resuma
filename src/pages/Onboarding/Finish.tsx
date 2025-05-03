import confetti from "canvas-confetti";
import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Finish() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let stop = false;
    const duration = 5000;
    const animationEnd = Date.now() + duration;
    const colors = ["#00d9cb", resolvedTheme === "dark" ? "#fff" : "#000"];

    (function frame() {
      if (stop) return;

      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });

      if (Date.now() < animationEnd) {
        requestAnimationFrame(frame);
      }
    })();

    return () => {
      stop = true;
    };
  }, [resolvedTheme]);

  const handleContinue = () => {
    setFadeOut(true);
    setTimeout(() => {
      navigate("/");
    }, 400);
  };

  return (
    <div
      className={`flex flex-col items-center justify-center w-full h-full gap-2 text-center transition-opacity duration-400 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      <h1 className='text-2xl font-bold'>You're All Set!</h1>
      <p className='text-muted-foreground'>Your resume journey begins now.</p>
      <Button className='mt-3' onClick={handleContinue}>
        Continue <ArrowRight className='h-4 ml-1' />
      </Button>
    </div>
  );
}
