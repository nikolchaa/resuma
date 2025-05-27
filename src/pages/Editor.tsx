import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume, saveResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResumePreview } from "@/components/ResumePreview";
import { pdf } from "@react-pdf/renderer";

import { pdf as pdfRenderer } from "@react-pdf/renderer";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import worker from "pdfjs-dist/build/pdf.worker?url";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Sidebar } from "./Editor/Sidebar";
import { getSection } from "@/lib/store";
import { SettingsType } from "@/contexts/OnboardingContext";
pdfjs.GlobalWorkerOptions.workerSrc = worker;

export const Editor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [draft, setDraft] = useState<ResumeData | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const isNew = location.pathname === "/new";

  const [pdfFormat, setPdfFormat] = useState<"A4" | "LETTER">("A4"); // Default

  async function generateThumbnail(data: ResumeData): Promise<string> {
    const pdfBlob = await pdfRenderer(
      <ResumePreview data={data} format='A4' />
    ).toBlob();
    const pdf = await pdfjs.getDocument({
      data: await pdfBlob.arrayBuffer(),
    }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d")!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL("image/png");
  }

  useEffect(() => {
    const fetchPaperSize = async () => {
      const settings = await getSection<SettingsType["app"]>("app");
      const format = settings?.paperSize === "US" ? "LETTER" : "A4";
      console.log("Paper size from settings:", format);
      console.log("settings:", settings);
      setPdfFormat(format);
    };

    fetchPaperSize();
  }, []);

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
      pdf(<ResumePreview data={draft} format={pdfFormat} />)
        .toBlob()
        .then((blob) => setPdfUrl(URL.createObjectURL(blob)))
        .catch((err) => console.error("PDF generation failed:", err));
    }
  }, [draft, pdfFormat]);

  const handleSave = async () => {
    if (draft) {
      const thumbnail = await generateThumbnail(draft);

      const updatedDraft = {
        ...draft,
        updated: new Date().toISOString(),
        image: thumbnail, // Update image field with generated thumbnail
      };

      await saveResume(updatedDraft);
      setResume(structuredClone(updatedDraft)); // Sync resume to draft
      setDraft(updatedDraft); // Also update the draft state itself
    }
  };

  const handleDiscard = () => {
    if (resume) {
      setDraft(structuredClone(resume));
    }
    navigate("/");
  };

  const handleExportPDF = async () => {
    if (!draft) return;

    try {
      const filePath = await save({
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        defaultPath: `${draft.title || "resume"}.pdf`,
      });

      if (filePath) {
        const blob = await pdf(
          <ResumePreview data={draft} format={pdfFormat} />
        ).toBlob();
        console.log(pdfFormat, "PDF format used for export");
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        await writeFile(filePath, uint8Array);
        console.log("PDF saved at:", filePath);
      }
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  const [zoomLevel, setZoomLevel] = useState(1); // testing zoom functionality
  const [numPages, setNumPages] = useState(0);

  return (
    <div className='flex h-screen'>
      {/* Sidebar */}
      <Sidebar
        draft={draft}
        setDraft={setDraft}
        handleDiscard={handleDiscard}
        handleSave={handleSave}
      />

      {/* PDF Preview */}
      <div className='w-full h-full bg-secondary dark:bg-background text-black overflow-auto'>
        <div className='flex'>
          {pdfUrl && !isNew && (
            <div className='py-20 px-8 xl:px-20 mx-auto'>
              <Document
                key={pdfUrl}
                file={pdfUrl}
                onLoadError={(err) => console.error(err)}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              >
                {Array.from(new Array(numPages), (_, index) => (
                  <Page
                    key={`page_${index + 1}`}
                    pageNumber={index + 1}
                    width={800 * zoomLevel}
                    className={`border mb-8`}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  >
                    <div className='text-xs text-center text-gray-500 mt-2'>
                      Page {index + 1} of {numPages}
                    </div>
                  </Page>
                ))}
              </Document>
            </div>
          )}

          <div className='absolute bottom-8 left-[calc(calc(100vw/2)+calc(28rem/2))] -translate-x-1/2 bg-background border shadow-sm rounded-lg flex items-center gap-2 p-2 z-30 text-foreground'>
            <Button
              size='sm'
              variant='outline'
              className='hover:text-muted-foreground'
              onClick={() => setZoomLevel(1)}
            >
              <RotateCcw className='h-4 w-4' />
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='hover:text-muted-foreground'
              onClick={() => setZoomLevel((z) => Math.max(z - 0.1, 0.5))}
            >
              <Minus className='h-4 w-4' />
            </Button>
            <span className='text-sm text-center w-12'>
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              size='sm'
              variant='outline'
              className='hover:text-muted-foreground'
              onClick={() => setZoomLevel((z) => Math.min(z + 0.1, 2))}
            >
              <Plus className='h-4 w-4' />
            </Button>
            <Button size='sm' onClick={handleExportPDF}>
              <Download className='h-4 w-4' /> Export PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Resume Wizard */}
      {isNew && <ResumeWizard generateThumbnail={generateThumbnail} />}
    </div>
  );
};
