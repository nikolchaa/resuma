/**
 * The optional job-matching model for local AI: Qwen3-Reranker-0.6B, which
 * scores how well each entry fits a job ad. It is faster and steadier than
 * asking the chat model yes or no, especially for small chat models.
 */
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, remove } from "@tauri-apps/plugin-fs";
import { checkAssetReady } from "@/lib/checkAssetReady";

export const RERANKER = {
  /** Folder under rerankers/ (no dots: download events are keyed by it). */
  name: "qwen3-reranker-0_6b-q8_0",
  label: "Qwen3 Reranker 0.6B",
  download: "https://huggingface.co/ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/resolve/main/qwen3-reranker-0.6b-q8_0.gguf",
  size: "639 MB",
} as const;

/** Asset type for download_and_extract; files land in rerankers/. */
export const RERANKER_ASSET_TYPE = "reranker";

/**
 * Entries scoring below this are suggested for leaving out. The scores
 * aren't calibrated probabilities: relevant entries can score below 0.001.
 * Measured on 200 hand-labelled entries across 10 full job ads in English
 * and Serbian, this cut-off flagged 71 of the 109 entries labelled "leave
 * out" and 5 of the 69 labelled "keep" (all borderline), so each flagged
 * entry is its own suggestion the user can discard. Serbian ads flag
 * fewer entries: the model scores them less sharply, which errs towards
 * keeping.
 */
export const LEAVE_OUT_BELOW = 0.001;

/** Bytes of the complete model file; a smaller folder is a cut-off download. */
const RERANKER_BYTES = 639_153_184;

export async function rerankerInstalled(): Promise<boolean> {
  if (!(await checkAssetReady("rerankers", RERANKER.name))) return false;
  const bytes = await invoke<number>("asset_disk_usage", { assetType: "rerankers", assetName: RERANKER.name }).catch(() => 0);
  return bytes >= RERANKER_BYTES;
}

export const downloadReranker = () =>
  invoke("download_and_extract", {
    assetName: RERANKER.name,
    assetUrls: [RERANKER.download],
    noExtract: true,
    assetType: RERANKER_ASSET_TYPE,
    version: null,
  });

export async function deleteReranker() {
  await stopReranker();
  await remove(`rerankers/${RERANKER.name}`, { recursive: true, baseDir: BaseDirectory.AppData });
}

/** Scores documents against a job ad; higher fits better. */
export const rerankScores = (runtime: string, query: string, documents: string[]) =>
  invoke<number[]>("rerank", { runtime, model: RERANKER.name, query, documents });

/** Frees the model's memory; the next scoring starts it again. */
export const stopReranker = () => invoke("reranker_stop").catch(() => undefined);
