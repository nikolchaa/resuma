import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume, saveResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";
import Logo from "../assets/Logo.svg?react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResumePDFDocument } from "@/components/ResumePreview";
import { PDFViewer } from "@react-pdf/renderer";

export const Editor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [draft, setDraft] = useState<ResumeData | null>(null);
  const isNew = location.pathname === "/new";

  useEffect(() => {
    if (!isNew && id) {
      loadResume(id).then((res) => {
        if (!res) {
          navigate("/", { replace: true });
        } else {
          setResume(res);
          setDraft(structuredClone(res)); // safe editable copy
        }
      });
    }
  }, [id, isNew, navigate]);

  return (
    // Work in progress
    <div className='flex'>
      {/* Sidebar */}
      <div className='bg-background h-screen min-w-72 border-r-1 shadow-sm'>
        <Logo className='w-full p-8' />
        <Button
          onClick={async () => {
            if (draft) {
              await saveResume(draft);
              setResume(draft);
            }
          }}
        >
          Save
        </Button>
      </div>

      {/* Main Editor */}
      <div className='w-full h-screen'>
        <h1 className='text-2xl'>{resume?.title || "Untitled Resume"}</h1>
        {draft && (
          <div className='w-full h-[calc(100vh-2rem)] overflow-auto bg-white text-black'>
            <PDFViewer
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                backgroundColor: "#fff",
              }}
              showToolbar={false}
            >
              <ResumePDFDocument data={draft} />
            </PDFViewer>
          </div>
        )}{" "}
        {/* Fix this later */}
      </div>

      {/* Export Button */}
      <Button
        onClick={async () => {
          if (draft) {
            await saveResume(draft);
            setResume(draft);
          }
          console.log("Exporting as PDF...");
          // Add PDF export logic here
        }}
        className='fixed bottom-8 right-8 shadow-sm'
      >
        <Download /> Export as PDF
      </Button>

      {/* Resume Wizard */}
      {isNew && <ResumeWizard />}
    </div>
  );
};
