import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume, saveResume } from "@/lib/resumesStore";
import { getSettings } from "@/lib/store";
import { ResumeData } from "@/lib/resumesStore";

export const Editor = () => {
  const { id } = useParams(); // defined if from /editor/:id
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);

  useEffect(() => {
    const load = async () => {
      if (location.pathname === "/new") {
        // Create new resume from settings
        const settings = await getSettings();
        const newResume: ResumeData = {
          id: crypto.randomUUID(),
          title: "Untitled Resume",
          updated: new Date().toISOString(),
          content: {
            personal: settings.personal ?? {
              fullName: "",
              email: "",
              location: "",
              headline: "",
              socials: [],
            },
            education: settings.education ?? [],
            experience: [],
            projects: [],
            skills: [],
            awards: [],
          },
          image: "https://placehold.co/210x297?text=Sample",
        };
        await saveResume(newResume);
        navigate(`/editor/${newResume.id}`, { replace: true });
      } else if (id) {
        const existing = await loadResume(id);
        if (!existing) {
          navigate("/", { replace: true });
        } else {
          setResume(existing);
        }
      }
    };

    load();
  }, [id, location.pathname, navigate]);

  if (!resume) {
    return (
      <div className='text-center mt-20 text-muted-foreground'>Loading...</div>
    );
  }

  return (
    <div className='p-6'>
      <h1 className='text-2xl font-bold mb-4'>{resume.title}</h1>
      {/* Editor UI here */}
    </div>
  );
};
