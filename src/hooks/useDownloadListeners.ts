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

    const unlistenProgress = listen<number>(
      `download_progress:${assetName}`,
      (event) => onProgress(event.payload)
    );

    const unlistenComplete = listen<string>(
      `download_complete:${assetName}`,
      () => onComplete()
    );

    const unlistenError = listen<string>(
      `download_error:${assetName}`,
      (event) => onError(event.payload)
    );

    const unlistenExtractComplete = listen<string>(
      `extract_complete:${assetName}`,
      (event) => onExtractComplete(event.payload)
    );

    const unlistenExtractError = listen<string>(
      `extract_error:${assetName}`,
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
