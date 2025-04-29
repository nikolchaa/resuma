import { DownloadState } from "@/types/download";

export interface AssetDownloadStatus {
  state: DownloadState;
  progress: number;
}

export type DownloadStatusMap = Record<string, AssetDownloadStatus>;
