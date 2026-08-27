import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, readDir, remove } from "@tauri-apps/plugin-fs";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Heart,
  Loader2,
  Microchip,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { SystemInfo, useSystem } from "@/contexts/SystemContext";
import { useDownloadListeners } from "@/hooks/useDownloadListeners";
import { checkAssetReady } from "@/lib/checkAssetReady";
import { evaluateFit, CompatibilityStatus } from "@/lib/resolveModel";
import type { DownloadState } from "@/types/download";
import type { DownloadStatusMap } from "@/types/downloadStatus";
import {
  buildVariants,
  extractParameters,
  fetchHuggingFaceFiles,
  formatBytes,
  GgufVariant,
  HfSearchResult,
  searchHuggingFaceModels,
} from "@/lib/huggingface";

type Props = {
  /** Notifies the page whenever the set of downloaded models changes. */
  onChanged?: (installed: string[]) => void;
};

const SEARCH_DEBOUNCE_MS = 350;
const INITIAL_VISIBLE_RESULTS = 5;
const RESULTS_PER_PAGE = 10;

type SortKey = "downloads-desc" | "downloads-asc" | "likes-desc" | "likes-asc";
const SORT_KEYS: SortKey[] = [
  "downloads-desc",
  "downloads-asc",
  "likes-desc",
  "likes-asc",
];

const comparatorFor = (key: SortKey) => (a: HfSearchResult, b: HfSearchResult) => {
  switch (key) {
    case "downloads-asc":
      return a.downloads - b.downloads;
    case "likes-desc":
      return b.likes - a.likes;
    case "likes-asc":
      return a.likes - b.likes;
    default:
      return b.downloads - a.downloads;
  }
};

/** Filesystem-safe, deterministic folder name for one repo variant. */
const folderFor = (result: HfSearchResult, variant: GgufVariant) => {
  const repoPart = result.repo.replace(/[/\\]+/g, "_");
  const variantPart =
    variant.partCount > 1 ? `${variant.key}_x${variant.partCount}` : variant.key;
  const raw = `${repoPart}__${variantPart}`;
  return (
    raw
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/\.gguf/gi, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "model"
  );
};

/**
 * Live model discovery against the Hugging Face Hub. Replaces the old static
 * catalog: search GGUF repos, pick a quantization, and Resuma streams it
 * straight into the local model library.
 */
export function HfModelBrowser({ onChanged }: Props) {
  const { t } = useLanguage();
  const system = useSystem();

  const [queryInput, setQueryInput] = useState("");
  const [results, setResults] = useState<HfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("downloads-desc");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);

  const [statusMap, setStatusMap] = useState<DownloadStatusMap>({});
  const [deleting, setDeleting] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [diskUsage, setDiskUsage] = useState<Record<string, number>>({});
  /** Decoder-block depths parsed from each installed GGUF (0 = unknown). */
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});
  /** MTP/nextn draft blocks embedded inside that depth (0 when none). */
  const [mtpCounts, setMtpCounts] = useState<Record<string, number>>({});

  const debounceTimer = useRef<number | null>(null);

  const refreshInstalled = useCallback(async () => {
    try {
      const entries = await readDir("models", { baseDir: BaseDirectory.AppData });
      const names = entries
        .filter((e) => e.name && e.isDirectory)
        .map((e) => e.name as string);
      setInstalled(names);
      onChanged?.(names);

      setStatusMap((prev) => {
        const next = { ...prev };
        for (const name of names) {
          next[name] = { state: "ready", progress: 100 };
        }
        return next;
      });

      // Real on-disk footprint + GGUF depth metrics per model folder.
      const [usageEntries, layerEntries] = await Promise.all([
        Promise.all(
          names.map(async (name) => {
            try {
              const bytes = await invoke<number>("asset_disk_usage", {
                assetType: "models",
                assetName: name,
              });
              return [name, bytes] as const;
            } catch {
              return [name, 0] as const;
            }
          })
        ),
        Promise.all(
          names.map(async (name) => {
            try {
              const meta = await invoke<
                { blockCount: number; nextnLayers: number } | number
              >("asset_model_layers", { assetName: name });
              // Older app builds return the bare count; tolerate both.
              const payload =
                typeof meta === "number"
                  ? { blockCount: meta, nextnLayers: 0 }
                  : meta;
              return [
                name,
                payload.blockCount ?? 0,
                payload.nextnLayers ?? 0,
              ] as const;
            } catch {
              return [name, 0, 0] as const;
            }
          })
        ),
      ]);

      setDiskUsage(Object.fromEntries(usageEntries.map(([n, b]) => [n, b])));
      setLayerCounts(Object.fromEntries(layerEntries.map(([n, l]) => [n, l])));
      setMtpCounts(Object.fromEntries(layerEntries.map(([n, , m]) => [n, m])));
    } catch {
      // The library may not exist yet; treat as empty.
      setInstalled([]);
      setDiskUsage({});
      setLayerCounts({});
      setMtpCounts({});
      onChanged?.([]);
    }
  }, [onChanged]);

  const runSearch = useCallback(async (query: string) => {
    setSearching(true);
    setSearchError(null);

    try {
      const found = await searchHuggingFaceModels(query);
      setResults(found);
      setVisibleCount(INITIAL_VISIBLE_RESULTS);
    } catch (error) {
      setResults([]);
      setSearchError((error as Error)?.message || "Hugging Face request failed");
    } finally {
      setSearching(false);
    }
  }, []);

  /**
   * Repo-level metadata: GPU-fitting models are "recommended", bubble to the
   * top of the list, and carry the checkmark by the model name. Both groups
   * stay ordered by whatever metric the user picked.
   */
  const repoMetas = useMemo(() => {
    const annotated = results.map((result) => ({
      result,
      status: evaluateFit({ parameters: extractParameters(result.repo) }, system),
    }));

    const compare = comparatorFor(sortKey);
    const recommended = annotated
      .filter((meta) => meta.status === "gpu")
      .sort((a, b) => compare(a.result, b.result));
    const rest = annotated
      .filter((meta) => meta.status !== "gpu")
      .sort((a, b) => compare(a.result, b.result));

    return { recommended, rest };
  }, [results, sortKey, system]);

  const visibleMetas = [
    ...repoMetas.recommended,
    ...repoMetas.rest,
  ].slice(0, visibleCount);
  const remainingCount =
    repoMetas.recommended.length + repoMetas.rest.length - visibleCount;

  // Debounced live search; an empty query lists popular GGUF repos.
  useEffect(() => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
      runSearch(queryInput.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, [queryInput, runSearch]);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  const startDownload = async (
    variant: GgufVariant,
    folder: string
  ) => {
    setStatusMap((prev) => ({
      ...prev,
      [folder]: { state: "downloading", progress: 0 },
    }));

    try {
      await invoke("download_and_extract", {
        assetName: folder,
        assetUrls: variant.urls,
        noExtract: true,
        assetType: "model",
      });
    } catch (error) {
      showError(
        `${t("ai.downloadErrorPrefix")} ${variant.label}`,
        (error as Error)?.message || "An unexpected error occurred"
      );
      setStatusMap((prev) => ({ ...prev, [folder]: { state: "error", progress: 0 } }));
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    setDeleting(modelName);

    try {
      await remove(`models/${modelName}`, {
        recursive: true,
        baseDir: BaseDirectory.AppData,
      });

      setStatusMap((prev) => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });

      showSuccess(t("ai.modelDeleted"), `"${modelName}" was removed successfully`);
      await refreshInstalled();
    } catch (error) {
      showError(
        t("ai.modelDeleteFailed"),
        (error as Error).message || "An unexpected error occurred"
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      {/* Section heading */}
      <div className='flex flex-col gap-1.5 my-2'>
        <CardTitle className='text-2xl font-semibold'>{t("ai.models")}</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("ai.models.description")}
        </CardDescription>
      </div>

      {/* Search + sorting */}
      <div className='flex gap-2'>
        <div className='relative flex-1'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none' />
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder={t("ai.hf.searchPlaceholder")}
            className='pl-9'
          />
        </div>
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger className='w-[190px] shrink-0' aria-label={t("ai.hf.sortLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`ai.hf.sort.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className='text-xs text-muted-foreground'>{t("ai.hf.searchHint")}</p>

      {/* States */}
      {searchError && (
        <div className='flex items-center justify-between border border-destructive/40 rounded-lg px-3 py-2'>
          <span className='text-sm text-destructive flex items-center gap-2 min-w-0'>
            <TriangleAlert className='h-4 w-4 shrink-0' />
            {t("ai.hf.error")}
            {searchError ? ` — ${searchError}` : ""}
          </span>
          <Button size='sm' variant='ghost' onClick={() => runSearch(queryInput.trim())}>
            <RefreshCw className='h-4 w-4 mr-1' /> {t("ai.hf.retry")}
          </Button>
        </div>
      )}

      {!searching && !searchError && visibleMetas.length === 0 && (
        <p className='text-sm text-muted-foreground py-6 text-center'>
          {t("ai.hf.empty")}
        </p>
      )}

      {/* Results */}
      <div className='flex flex-col gap-2'>
        {visibleMetas.map(({ result, status }) => (
          <HfRepoCard
            key={result.repo}
            result={result}
            recommended={status === "gpu"}
            statusMap={statusMap}
            onDownload={startDownload}
          />
        ))}
      </div>

      {remainingCount > 0 && (
        <Button
          variant='ghost'
          className='mx-auto'
          onClick={() => setVisibleCount((count) => count + RESULTS_PER_PAGE)}
        >
          <ChevronDown className='h-4 w-4 mr-1' />
          {`${t("ai.hf.showMore")} (${remainingCount})`}
        </Button>
      )}

      {searching && (
        <div className='flex justify-center py-6'>
          <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
        </div>
      )}

      {/* Installed */}
      <div className='flex flex-col gap-2 mt-2'>
        <h3 className='font-medium'>{t("ai.hf.installedTitle")}</h3>
        {installed.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t("ai.hf.installedEmpty")}</p>
        ) : (
          <div className='flex flex-col gap-2'>
            {installed.map((name) => (
              <div
                key={name}
                className='flex items-center justify-between border rounded-xl px-3 py-2 shadow-sm'
              >
                <div className='flex items-center gap-2 min-w-0'>
                  <Check className='h-4 w-4 text-primary shrink-0' />
                  <span className='text-sm truncate' title={name}>
                    {name}
                  </span>
                  {diskUsage[name] > 0 && (
                    <Badge variant='outline' className='shrink-0'>
                      {formatBytes(diskUsage[name])}
                    </Badge>
                  )}
                  {(layerCounts[name] ?? 0) > 0 && (
                    <Badge variant='outline' className='shrink-0'>
                      {(() => {
                        const total = layerCounts[name];
                        const mtp = mtpCounts[name] ?? 0;
                        // Show the transformer-layer count users expect
                        // (HF's num_hidden_layers); the MTP draft is called
                        // out separately instead of inflating the number.
                        return mtp > 0
                          ? t("ai.hf.layerCountMtp")
                              .replace("{count}", String(total - mtp))
                              .replace("{mtp}", String(mtp))
                          : t("ai.hf.layerCount").replace(
                              "{count}",
                              String(total)
                            );
                      })()}
                    </Badge>
                  )}
                </div>
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-destructive'
                  disabled={
                    deleting === name || statusMap[name]?.state === "downloading"
                  }
                  onClick={() => handleDeleteModel(name)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Backend download events continue regardless of which card is open,
          so watch every folder this session has ever started. */}
      {Object.keys(statusMap).map((folder) =>
        statusMap[folder].state === "ready" ? null : (
          <DownloadWatcher
            key={folder}
            folder={folder}
            onUpdate={(patch) =>
              setStatusMap((prev) => ({
                ...prev,
                [folder]: { ...prev[folder], ...patch },
              }))
            }
            onSettled={() => refreshInstalled()}
          />
        )
      )}
    </div>
  );
}

function HfRepoCard({
  result,
  recommended,
  statusMap,
  onDownload,
}: {
  result: HfSearchResult;
  recommended: boolean;
  statusMap: DownloadStatusMap;
  onDownload: (variant: GgufVariant, folder: string) => void;
}) {
  const { t } = useLanguage();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<GgufVariant[] | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    setError(null);

    try {
      const files = await fetchHuggingFaceFiles(result.repo);
      setVariants(buildVariants(result.repo, files));
    } catch (err) {
      setError((err as Error)?.message || "Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const system = useSystem();

  /** Sorts variants so hardware-fitting builds surface first. */
  const rankedVariants = (
    candidates: GgufVariant[],
    info: SystemInfo
  ): { variant: GgufVariant; status: CompatibilityStatus }[] => {
    const rank = (status: CompatibilityStatus) =>
      status === "gpu" ? 0 : status === "cpu" ? 1 : 2;

    return candidates
      .map((variant) => ({
        variant,
        status: evaluateFit(
          {
            parameters:
              extractParameters(variant.key) ?? extractParameters(result.repo),
            sizeBytes: variant.sizeBytes,
          },
          info
        ),
      }))
      .sort(
        (a, b) =>
          rank(a.status) - rank(b.status) ||
          candidates.indexOf(a.variant) - candidates.indexOf(b.variant)
      );
  };

  const shortName = result.repo.split("/").slice(1).join("/") || result.repo;

  return (
    <div className='border rounded-lg shadow-sm bg-background'>
      <button
        type='button'
        className='w-full flex items-center justify-between gap-3 px-4 py-3 text-left'
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open && !variants && !loading) loadFiles();
        }}
      >
        <div className='min-w-0'>
          <div className='font-medium truncate flex items-center gap-1.5'>
            <span className='truncate'>{shortName}</span>
            {recommended && (
              <Badge
                variant='outline'
                className='border-primary/50 text-primary shrink-0'
              >
                <Check className='h-3 w-3 mr-1' />
                {t("ai.hf.recommended")}
              </Badge>
            )}
          </div>
          <div className='text-xs text-muted-foreground truncate'>{result.author}</div>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
          <Badge variant='outline' className='gap-1'>
            <TrendingUp className='h-3 w-3' />
            {compactNumber(result.downloads)}
          </Badge>
          <Badge variant='outline' className='gap-1'>
            <Heart className='h-3 w-3' />
            {compactNumber(result.likes)}
          </Badge>
          {open ? (
            <ChevronUp className='h-4 w-4 text-muted-foreground' />
          ) : (
            <ChevronDown className='h-4 w-4 text-muted-foreground' />
          )}
        </div>
      </button>

      {open && (
        <div className='px-4 pb-3 flex flex-col gap-1.5 border-t pt-3'>
          {loading && (
            <div className='flex items-center gap-2 text-sm text-muted-foreground py-2'>
              <Loader2 className='h-4 w-4 animate-spin' /> {t("ai.hf.loading")}
            </div>
          )}

          {!loading && error && (
            <div className='flex items-center justify-between text-sm py-1'>
              <span className='text-destructive'>{error}</span>
              <Button size='sm' variant='ghost' onClick={loadFiles}>
                <RefreshCw className='h-4 w-4 mr-1' /> {t("ai.hf.retry")}
              </Button>
            </div>
          )}

          {!loading &&
            !error &&
            variants &&
            rankedVariants(variants, system).map(({ variant, status }) => (
              <VariantRow
                key={variant.key}
                variant={variant}
                folder={folderFor(result, variant)}
                state={statusMap[folderFor(result, variant)]}
                status={status}
                onDownload={() => onDownload(variant, folderFor(result, variant))}
              />
            ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One downloadable quantization                                       */
/* ------------------------------------------------------------------ */

function VariantRow({
  variant,
  folder,
  state,
  status,
  onDownload,
}: {
  variant: GgufVariant;
  folder: string;
  state?: { state: string; progress: number };
  status: CompatibilityStatus;
  onDownload: () => void;
}) {
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkAssetReady("models", folder).then((exists) => {
      if (!cancelled) setReady(exists);
    });
    return () => {
      cancelled = true;
    };
  }, [folder]);

  const busy = state?.state === "downloading";

  return (
    <div className='flex flex-col'>
      <div className='flex items-center justify-between gap-3 py-1.5'>
        <div className='flex items-center gap-2 min-w-0'>
          <span className='text-sm font-medium font-mono truncate'>{variant.label}</span>
          <CompatBadge status={status} />
          {variant.sizeBytes > 0 && (
            <Badge variant='outline' className='shrink-0'>
              <Download className='h-3 w-3 mr-1' />
              {formatBytes(variant.sizeBytes)}
            </Badge>
          )}
          {variant.partCount > 1 && (
            <Badge variant='outline'>{"×" + variant.partCount}</Badge>
          )}
        </div>

        <Button size='sm' variant='secondary' disabled={busy || ready} onClick={onDownload}>
          {ready ? (
            <>
              <Check className='w-4 h-4 mr-1' /> {t("common.ready")}
            </>
          ) : busy ? (
            <>
              <Download className='w-4 h-4 mr-1' />
              {`${t("common.downloading")} (${Math.round(state?.progress ?? 0)}%)`}
            </>
          ) : (
            <>
              <Download className='w-4 h-4 mr-1' /> {t("common.download")}
            </>
          )}
        </Button>
      </div>

      {busy && <Progress value={state?.progress ?? 0} className='h-1.5 mb-1' />}
    </div>
  );
}

/** GPU offload / CPU fallback / unsupported indicator for one variant. */
function CompatBadge({ status }: { status: CompatibilityStatus }) {
  const { t } = useLanguage();

  if (status === "gpu") {
    return (
      <Badge variant='outline' className='shrink-0'>
        <Microchip className='h-3 w-3 mr-1' />
        {t("ai.gpuCompatible")}
      </Badge>
    );
  }

  if (status === "cpu") {
    return (
      <Badge variant='outline' className='shrink-0'>
        <Cpu className='h-3 w-3 mr-1' />
        {t("ai.cpuCompatible")}
      </Badge>
    );
  }

  return (
    <Badge variant='outline' className='text-muted-foreground shrink-0'>
      <X className='h-3 w-3 mr-1' />
      {t("common.unsupported")}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Mounted once per ever-started download                              */
/* ------------------------------------------------------------------ */

function DownloadWatcher({
  folder,
  onUpdate,
  onSettled,
}: {
  folder: string;
  onUpdate: (patch: { state?: DownloadState; progress?: number }) => void;
  onSettled: () => void;
}) {
  const { t } = useLanguage();

  useDownloadListeners(folder, {
    onProgress: (progress) => onUpdate({ state: "downloading", progress }),
    onComplete: () => {
      onUpdate({ state: "ready", progress: 100 });
      onSettled();
    },
    onError: (error) => {
      showError(`${t("ai.downloadErrorPrefix")} ${folder}`, error);
      onUpdate({ state: "error", progress: 0 });
    },
    onExtractComplete: () => {},
    onExtractError: () => {},
  });

  return null;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}
