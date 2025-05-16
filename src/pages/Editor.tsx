import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";
import Logo from "../assets/Logo.svg?react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  return (
    <>
      <div className='fixed top-0 left-0 bg-background h-screen w-72 border-r-1 shadow-sm'>
        <Logo className='w-full p-8' />
        <h1 className='text-2xl font-bold mb-4'>
          {resume?.title || "Untitled Resume"}
        </h1>
        {isNew && <ResumeWizard />}
      </div>
      <Button
        onClick={() => {
          console.log("hi!");
        }}
        className='fixed bottom-8 right-8 shadow-sm'
      >
        <Download /> Export as PDF
      </Button>
    </>
  );
};
