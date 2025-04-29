export type DownloadState =
  | "idle"
  | "downloading"
  | "extracting"
  | "ready"
  | "error";

export interface DownloadStatus {
  state: DownloadState;
  progress: number;
}
