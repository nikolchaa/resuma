import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";

export const Editor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const isNew = location.pathname === "/new";

  useEffect(() => {
    if (!isNew && id) {
      loadResume(id).then((res) => {
        if (!res) {
          navigate("/", { replace: true });
        } else {
          setResume(res);
        }
      });
    }
  }, [id, isNew, navigate]);

  const title = resume?.title || "Untitled Resume";

  return (
    <div className='relative p-6'>
      <h1 className='text-2xl font-bold mb-4'>{title}</h1>

      {/* Editor UI goes here */}
      {/* For example: <ResumeEditor resume={resume} /> */}

      {isNew && <ResumeWizard />}
    </div>
  );
};
