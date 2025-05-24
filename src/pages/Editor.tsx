// Editor.tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume, saveResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";
import Logo from "../assets/Logo.svg?react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResumePDFDocument } from "@/components/ResumePreview";
import { pdf } from "@react-pdf/renderer";

import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import worker from "pdfjs-dist/build/pdf.worker?url";
pdfjs.GlobalWorkerOptions.workerSrc = worker;

export const Editor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [draft, setDraft] = useState<ResumeData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
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

  useEffect(() => {
    if (draft) {
      pdf(<ResumePDFDocument data={draft} />)
        .toBlob()
        .then((blob) => setPdfUrl(URL.createObjectURL(blob)));
    }
  }, [draft]);

  return (
    <div className='flex h-screen'>
      {/* Sidebar */}
      <div className='bg-background min-w-72 border-r-1 shadow-sm flex flex-col justify-between'>
        <Logo className='w-full p-8' />
        <Button
          onClick={async () => {
            if (draft) {
              await saveResume(draft);
              setResume(draft);
            }
          }}
          className='m-4'
        >
          Save
        </Button>
      </div>

      {/* PDF Preview */}
      <div className='w-full h-full bg-secondary dark:bg-background text-black overflow-auto'>
        <div className='flex flex-col items-center py-20'>
          {pdfUrl ? (
            <Document
              key={pdfUrl} // Force reset when pdfUrl changes
              file={pdfUrl}
              onLoadError={(err) => console.error(err)}
            >
              <Page
                pageNumber={1}
                width={800}
                className={"border"}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          ) : (
            <div className='text-gray-500 mt-40'>Generating preview…</div>
          )}
        </div>
      </div>

      {/* Export Button */}
      <Button
        onClick={async () => {
          if (draft) {
            await saveResume(draft);
            setResume(draft);
          }
          console.log("Exporting as PDF...");
          // You can trigger download here if needed
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
