import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { loadResume, saveResume } from "@/lib/resumesStore";
import { ResumeData } from "@/lib/resumesStore";
import { ResumeWizard } from "@/components/ResumeWizard";
import { Download, Minus, Plus, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useHistoryState } from "@/hooks/useHistoryState";
import { Button } from "@/components/ui/button";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Sidebar } from "./Editor/Sidebar";
import { getSection } from "@/lib/store";
import { EditorMode, SettingsType } from "@/contexts/OnboardingContext";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { updateDiscordPresence } from "@/lib/discord";
import { useLanguage } from "@/contexts/LanguageContext";
import { AppLanguage, normalizeLanguage } from "@/lib/i18n";
import { SvgPage } from "@/renderer/browser/SvgPage";
import {
  generateResumePdf,
  generateResumeThumbnail,
  useRenderedResume,
} from "@/renderer/browser/useRenderedResume";

/** Preview page width in CSS pixels at 100 % zoom. */
const PAGE_WIDTH = 800;

export const Editor = () => {
  const { t } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState<ResumeData | null>(null);
  // The draft keeps undo/redo history; typing bursts become one step.
  const history = useHistoryState<ResumeData>(null);
  const draft = history.value;
  const setDraft = history.set;
  const isNew = location.pathname === "/new";

  useEffect(() => {
    if (isNew) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      // The source editor has its own text undo; resume history applies elsewhere.
      if ((e.target as HTMLElement | null)?.closest?.(".cm-editor")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNew, history.undo, history.redo]);

  const [pdfFormat, setPdfFormat] = useState<"A4" | "LETTER">("A4"); // Default
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [mode, setMode] = useState<EditorMode>("simple");
  // Source mode needs room for the code editor.
  const sidebarWidth = mode === "source" ? "clamp(28rem, 42vw, 42rem)" : "28rem";

  // Live preview: re-laid-out on every change, painted in place (no flash).
  const { doc, error: renderError } = useRenderedResume(
    isNew ? null : draft,
    pdfFormat,
    language
  );

  useEffect(() => {
    if (renderError) {
      showError(t("editor.toast.pdfGenerateFailed"), renderError.message);
    }
  }, [renderError]);

  const generateThumbnail = (data: ResumeData) =>
    generateResumeThumbnail(data, language);

  useEffect(() => {
    // Generic text only: resume titles and contents never go to Discord.
    const details = location.pathname.startsWith("/new")
      ? "Creating a new resume"
      : "Editing a resume";
    updateDiscordPresence(details, "Editor");
  }, [location.pathname]);

  useEffect(() => {
    const fetchPaperSize = async () => {
      const settings = await getSection<SettingsType["app"]>("app");
      const format = settings?.paperSize === "US" ? "LETTER" : "A4";
      setPdfFormat(format);
      setLanguage(normalizeLanguage(settings?.language));
      const m = settings?.editorMode;
      setMode(m === "design" || m === "source" ? m : "simple");
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
          history.reset(structuredClone(res)); // safe editable copy, fresh history
        }
      });
    }
  }, [id, isNew, navigate, history.reset]);

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
      history.replace(updatedDraft); // not an undo step: only metadata changed

      showSuccess(t("editor.toast.savedTitle"), t("editor.toast.savedDesc"));
    }
  };

  const handleDiscard = () => {
    if (resume) {
      history.reset(structuredClone(resume));
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

      if (!filePath) {
        showWarning("Export canceled", "No file was saved");
        return;
      }

      const bytes = await generateResumePdf(draft, pdfFormat, language);
      await writeFile(filePath, bytes);

      showSuccess(t("editor.toast.pdfExportSuccess"), filePath);
    } catch (error) {
      showError(
        "Export failed",
        (error as Error).message || "Something went wrong"
      );
    }
  };

  const [zoomLevel, setZoomLevel] = useState(1);

  // The wider Source sidebar can leave less room than the page needs (e.g. at
  // the 1280 px minimum window); zoom out just enough to fit when entering it.
  useEffect(() => {
    if (mode !== "source") return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const sidebarPx = Math.min(42 * rem, Math.max(28 * rem, 0.42 * window.innerWidth));
    const available = window.innerWidth - sidebarPx - 64; // preview padding
    const fit = Math.floor((available / PAGE_WIDTH) * 20) / 20;
    if (fit < 1) setZoomLevel((z) => Math.min(z, Math.max(0.5, fit)));
  }, [mode]);
  const numPages = doc?.pages.length ?? 0;

  return (
    <div className='flex h-screen'>
      {/* Sidebar */}
      <Sidebar
        draft={draft}
        setDraft={setDraft}
        handleDiscard={handleDiscard}
        handleSave={handleSave}
        mode={mode}
        setMode={setMode}
        width={sidebarWidth}
      />

      {/* PDF Preview */}
      <div className='w-full h-full bg-secondary dark:bg-background text-black overflow-auto'>
        <div className='flex'>
          {doc && !isNew && (
            <div className='py-20 px-8 xl:px-20 mx-auto'>
              {doc.pages.map((page) => (
                <div key={`page_${page.index + 1}`}>
                  <SvgPage
                    page={page}
                    width={PAGE_WIDTH * zoomLevel}
                    className='border'
                  />
                  <div className='text-xs text-center text-gray-500 mb-[4rem]'>
                    {t("editor.page")} {page.index + 1} {t("editor.of")} {numPages}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className='absolute bottom-8 -translate-x-1/2 bg-background border shadow-sm rounded-lg flex items-center gap-2 p-2 z-30 text-foreground'
            style={{ left: `calc(50vw + ${sidebarWidth} / 2)` }}
          >
            <Button
              size='sm'
              variant='outline'
              className='hover:text-muted-foreground'
              onClick={history.undo}
              disabled={!history.canUndo}
              title={`${t("editor.undo")} (Ctrl+Z)`}
              aria-label={t("editor.undo")}
            >
              <Undo2 className='h-4 w-4' />
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='hover:text-muted-foreground'
              onClick={history.redo}
              disabled={!history.canRedo}
              title={`${t("editor.redo")} (Ctrl+Shift+Z)`}
              aria-label={t("editor.redo")}
            >
              <Redo2 className='h-4 w-4' />
            </Button>
            <div className='w-px h-6 bg-border' />
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
              <Download className='h-4 w-4' /> {t("editor.exportPdf")}
            </Button>
          </div>
        </div>
      </div>

      {/* Resume Wizard */}
      {isNew && <ResumeWizard generateThumbnail={generateThumbnail} />}
    </div>
  );
};
