import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ResumeData } from "@/lib/resumesStore";
import type { AppLanguage } from "@/lib/i18n";
import { FontSet, PaperFormat, RenderedDocument, renderResume } from "..";
import { writePdf } from "../pdf";
import { loadFonts } from "./loadFonts";
import { renderThumbnail } from "./thumbnail";

export function useFonts(): { fonts: FontSet | null; error: Error | null } {
  const [fonts, setFonts] = useState<FontSet | null>(null);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    loadFonts()
      .then((f) => alive && setFonts(f))
      .catch((e) => alive && setError(e as Error));
    return () => {
      alive = false;
    };
  }, []);
  return { fonts, error };
}

/**
 * Lays out the resume on every change. Layout is synchronous and cheap; the
 * deferred value keeps typing responsive, and on an unexpected error the
 * last good document stays on screen.
 */
export function useRenderedResume(
  data: ResumeData | null,
  format: PaperFormat,
  language: AppLanguage
): { doc: RenderedDocument | null; error: Error | null } {
  const { fonts, error: fontError } = useFonts();
  const deferred = useDeferredValue(data);
  const lastGood = useRef<RenderedDocument | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const result = useMemo(() => {
    if (!deferred || !fonts) return { doc: lastGood.current, error: null as Error | null };
    try {
      return { doc: renderResume(deferred, { format, language, fonts }), error: null };
    } catch (e) {
      console.error("[renderer]", e);
      return { doc: lastGood.current, error: e as Error };
    }
  }, [deferred, fonts, format, language]);

  useEffect(() => {
    if (result.doc) lastGood.current = result.doc;
    setError(result.error);
  }, [result]);

  return { doc: result.doc, error: error ?? fontError };
}

export async function generateResumeThumbnail(data: ResumeData, language: AppLanguage): Promise<string> {
  const fonts = await loadFonts();
  return renderThumbnail(renderResume(data, { format: "A4", language, fonts }));
}

export async function generateResumePdf(
  data: ResumeData,
  format: PaperFormat,
  language: AppLanguage
): Promise<Uint8Array> {
  const fonts = await loadFonts();
  return writePdf(renderResume(data, { format, language, fonts }), fonts);
}
