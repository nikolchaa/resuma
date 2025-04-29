import { invoke } from "@tauri-apps/api/core";

/**
 * Checks if a specific asset (runtime, model, etc.) is already downloaded and extracted.
 *
 * @param assetType Folder category like "runtimes", "models", "adapters", etc.
 * @param assetName Name of the asset (e.g., "cuda-win64", "mistral-7b-instruct.gguf")
 * @returns true if asset is ready, false otherwise
 */

export async function checkAssetReady(
  assetType: string,
  assetName: string
): Promise<boolean> {
  if (!assetType || !assetName) return false;

  try {
    const exists = await invoke<boolean>("check_asset_ready", {
      assetType,
      assetName,
    });

    return exists;
  } catch (error) {
    console.error(`Error checking asset ready: ${error}`);
    return false;
  }
}
