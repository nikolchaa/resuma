import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export function useDownloadListeners(
  assetName: string | undefined,
  {
    onProgress,
    onComplete,
    onError,
    onExtractComplete,
    onExtractError,
  }: {
    onProgress: (progress: number) => void;
    onComplete: () => void;
    onError: (error: string) => void;
    onExtractComplete: (path: string) => void;
    onExtractError: (error: string) => void;
  }
) {
  useEffect(() => {
    if (!assetName) return;
    const safeName = assetName.replace(/\./g, "_");

    const unlistenProgress = listen<number>(
      `download_progress:${safeName}`,
      (event) => onProgress(event.payload)
    );

    const unlistenComplete = listen<string>(
      `download_complete:${safeName}`,
      () => onComplete()
    );

    const unlistenError = listen<string>(
      `download_error:${safeName}`,
      (event) => onError(event.payload)
    );

    const unlistenExtractComplete = listen<string>(
      `extract_complete:${safeName}`,
      (event) => onExtractComplete(event.payload)
    );

    const unlistenExtractError = listen<string>(
      `extract_error:${safeName}`,
      (event) => onExtractError(event.payload)
    );

    return () => {
      unlistenProgress.then((f) => f());
      unlistenComplete.then((f) => f());
      unlistenError.then((f) => f());
      unlistenExtractComplete.then((f) => f());
      unlistenExtractError.then((f) => f());
    };
  }, [assetName]);
}
