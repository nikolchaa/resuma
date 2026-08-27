import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RotateCcw, Info, Download, Check, Trash2, X } from "lucide-react";
import { SettingsType } from "@/contexts/OnboardingContext";
import { useSystem } from "@/contexts/SystemContext";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { getRuntimes } from "@/lib/resolveRuntime";
import { Badge } from "@/components/ui/badge";
import { DownloadState } from "@/types/download";
import { DownloadStatusMap } from "@/types/downloadStatus";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, readDir, remove } from "@tauri-apps/plugin-fs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/lib/toastUtils";
import { RuntimeEntry } from "@/lib/selectRecommendedRuntime";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDownloadListeners } from "@/hooks/useDownloadListeners";
import {
  defaultRemoteSettings,
  getProvider,
  providerList,
} from "@/lib/resolveProvider";
import { RemoteProviderSetup } from "@/components/RemoteProviderSetup";
import { HfModelBrowser } from "@/components/HfModelBrowser";

type Props = {
  llm: SettingsType["llm"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]>,
  ) => void;
  stockSettings: SettingsType["llm"];
};

export const ArtificialSettings = ({
  llm,
  updateSettings,
  stockSettings,
}: Props) => {
  const { t } = useLanguage();
  const settings = llm.settings;
  const system = useSystem();

  const provider = getProvider(llm.provider);
  const isLocal = provider.kind === "bundled";

  const [downloadStatusMap, setDownloadStatusMap] = useState<DownloadStatusMap>(
    {},
  );
  const [deletingRuntime, setDeletingRuntime] = useState<string | null>(null);
  const [availableRuntimes, setAvailableRuntimes] = useState<RuntimeEntry[]>(
    [],
  );
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  /** Real decoder-block counts parsed from each installed GGUF (0 = unknown). */
  const [layerCounts, setLayerCounts] = useState<Record<string, number>>({});

  // Maximum offloadable layers for the selected model. Parsed from the GGUF
  // metadata on install; until known we allow a high ceiling that llama.cpp
  // clamps to the real count at load time.
  const knownLayers = layerCounts[llm.model];
  const maxGpuLayers = knownLayers && knownLayers > 0 ? knownLayers : 999;
  /** "-1" is the llama.cpp sentinel for "offload everything that fits". */
  const autoLayers = settings.gpuLayers === -1;
  const isCpuRuntime =
    getRuntimes(system).find((r) => r.runtime.name === llm.runtime)?.runtime
      .backend === "cpu";

  // Layer counts back the GPU Layers clamp and auto-fill. Refreshed whenever
  // the set of downloaded models changes.
  useEffect(() => {
    let cancelled = false;

    const missing = downloadedModels.filter(
      (name) => layerCounts[name] === undefined,
    );
    if (missing.length === 0) return;
    // Unknown models report 0; never re-query them forever.
    setLayerCounts((prev) => {
      const next = { ...prev };
      for (const name of missing) next[name] = -1; // pending marker
      return next;
    });

    Promise.all(
      missing.map(async (name) => {
        try {
          const meta = await invoke<
            { blockCount: number; nextnLayers: number } | number
          >("asset_model_layers", { assetName: name });
          // Older app builds return the bare count; tolerate both.
          const blockCount =
            typeof meta === "number" ? meta : meta?.blockCount ?? 0;
          return [name, blockCount] as const;
        } catch {
          return [name, 0] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) {
        setLayerCounts((prev) => ({
          ...prev,
          ...Object.fromEntries(entries),
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [downloadedModels]);

  /**
   * Re-scans the runtimes directory. Runs on mount, after every runtime
   * settles (extract completes), and after deletions - so the Runtime
   * dropdown always reflects what is actually installed.
   */
  const refreshRuntimes = useCallback(async () => {
    let runtimeFolders: string[] = [];

    try {
      const runtimeEntries = await readDir("runtimes", {
        baseDir: BaseDirectory.AppData,
      });
      runtimeFolders = runtimeEntries
        .filter((e) => e.name && e.isDirectory)
        .map((e) => e.name as string);
    } catch (error) {
      showError(
        t("ai.errorReadingRuntimes"),
        (error as Error).message || "An unexpected error occurred",
      );
    }

    // Update status map
    const runtimeReadyMap: DownloadStatusMap = {};
    runtimeFolders.forEach((name) => {
      runtimeReadyMap[name] = { state: "ready", progress: 100 };
    });

    setDownloadStatusMap((prev) => ({
      ...runtimeReadyMap,
      ...prev,
    }));

    const runtimes = getRuntimes(system)
      .filter((entry) => runtimeFolders.includes(entry.runtime.name))
      .map((entry) => entry.runtime);

    setAvailableRuntimes(runtimes);
  }, [system, t]);

  useEffect(() => {
    refreshRuntimes();
  }, [refreshRuntimes]);

  const handleDeleteRuntime = async (runtimeName: string) => {
    setDeletingRuntime(runtimeName);

    try {
      await remove(`runtimes/${runtimeName}`, {
        recursive: true,
        baseDir: BaseDirectory.AppData,
      });

      setDownloadStatusMap((prev) => {
        const updated = { ...prev };
        delete updated[runtimeName];
        return updated;
      });

      showSuccess(
        t("ai.runtimeDeleted"),
        `"${runtimeName}" was removed successfully`,
      );
      await refreshRuntimes();
    } catch (error) {
      showError(
        t("ai.runtimeDeleteFailed"),
        (error as Error).message || "An unexpected error occurred",
      );
    } finally {
      setDeletingRuntime(null);
    }
  };

  const handleDownloadClick = async (
    assetName: string,
    assetUrl: string,
    assetType: "runtime" | "model",
  ) => {
    if (!assetName) return;

    setDownloadStatusMap((prev) => ({
      ...prev,
      [assetName]: {
        state: "downloading",
        progress: 0,
      },
    }));

    try {
      await invoke("download_and_extract", {
        assetName,
        assetUrls: [assetUrl],
        noExtract: assetType === "model",
        assetType,
      });
    } catch (err) {
      showError(
        `${t("ai.downloadErrorPrefix")} ${assetName}`,
        (err as Error).message || "An unexpected error occurred",
      );

      setDownloadStatusMap((prev) => ({
        ...prev,
        [assetName]: {
          state: "error",
          progress: 0,
        },
      }));
    }
  };

  const renderParamTooltip = (label: string, desc: string) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='text-muted-foreground cursor-help flex items-center gap-1'>
            ({label}) <Info className='h-4 w-4' />
          </span>
        </TooltipTrigger>
        <TooltipContent side='top'>
          <p>{desc}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className='flex flex-col gap-4'>
      {/* Provider */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>{t("ai.provider")}</Label>
        <Select
          value={llm.provider}
          onValueChange={(value) => {
            const next = getProvider(value);
            updateSettings("llm", {
              provider: value,
              remote: defaultRemoteSettings(next, llm.remote),
            });
          }}
        >
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder={t("ai.provider.select")} />
          </SelectTrigger>
          <SelectContent>
            {providerList.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}{" "}
                <Badge variant='outline'>
                  {t(`ai.provider.kind.${entry.kind}`)}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLocal && (
        <RemoteProviderSetup
          provider={provider}
          remote={llm.remote}
          onChange={(patch) =>
            updateSettings("llm", { remote: { ...llm.remote, ...patch } })
          }
        />
      )}

      {isLocal && (
        <>
          {/* Runtime */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>{t("ai.runtime")}</Label>
            <Select
              value={llm.runtime}
              onValueChange={(value) =>
                updateSettings("llm", { runtime: value })
              }
            >
              <SelectTrigger className='w-2/3 text-right'>
                <SelectValue
                  placeholder={
                    availableRuntimes.length > 0
                      ? t("ai.runtime.select")
                      : t("ai.runtime.none")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableRuntimes.map((runtime) => (
                  <SelectItem key={runtime.name} value={runtime.name}>
                    {runtime.label}{" "}
                    <Badge variant='outline'>
                      {runtime.backend.toUpperCase()}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>{t("ai.model")}</Label>
            <Select
              value={llm.model}
              onValueChange={(value) => {
                // Known layer counts prefill the input - but never silently kick
                // the user out of Auto (-1) mode.
                const layers = layerCounts[value];
                updateSettings("llm", {
                  model: value,
                  ...(layers > 0 && !autoLayers
                    ? { settings: { ...settings, gpuLayers: layers } }
                    : {}),
                });
              }}
            >
              <SelectTrigger className='w-2/3 text-right'>
                <SelectValue
                  placeholder={
                    downloadedModels.length > 0
                      ? t("ai.model.select")
                      : t("ai.model.none")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {downloadedModels.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Context Size */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.contextSize")}{" "}
              {renderParamTooltip("ctx_size", t("ai.contextSize.tooltip"))}
            </Label>
            <Input
              type='number'
              min={1}
              max={16384}
              value={settings.ctxSize}
              onChange={(e) =>
                updateSettings("llm", {
                  settings: { ...settings, ctxSize: Number(e.target.value) },
                })
              }
              className='text-right w-2/3'
            />
          </div>

          {/* GPU Layers */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.gpuLayers")}{" "}
              {renderParamTooltip(
                "gpu_layers",
                knownLayers > 0
                  ? t("ai.gpuLayers.tooltip")
                  : t("ai.gpuLayers.unknown"),
              )}
            </Label>

            <Input
              type='number'
              min={0}
              max={maxGpuLayers}
              disabled={autoLayers || isCpuRuntime}
              value={settings.gpuLayers}
              onChange={(e) =>
                updateSettings("llm", {
                  settings: {
                    ...settings,
                    gpuLayers: Math.min(
                      Math.max(0, Number(e.target.value)),
                      maxGpuLayers,
                    ),
                  },
                })
              }
              className='text-right w-2/3'
            />
          </div>

          {/* Auto GPU Offload */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.autoGpuLayers")}{" "}
              {renderParamTooltip(
                "gpu_layers=-1",
                t("ai.autoGpuLayers.tooltip"),
              )}
            </Label>
            <Switch
              checked={autoLayers}
              disabled={isCpuRuntime}
              onCheckedChange={(checked) =>
                updateSettings("llm", {
                  settings: {
                    ...settings,
                    // "Auto" is spelled exactly how llama.cpp understands it.
                    gpuLayers: checked
                      ? -1
                      : Math.min(Math.max(0, settings.gpuLayers), maxGpuLayers),
                  },
                })
              }
            />
          </div>

          {/* Flash Attention */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.flashAttention")}{" "}
              {renderParamTooltip("flash_attn", t("ai.flashAttention.tooltip"))}
            </Label>
            <Switch
              checked={settings.flashAttn}
              onCheckedChange={(checked) =>
                updateSettings("llm", {
                  settings: { ...settings, flashAttn: checked },
                })
              }
            />
          </div>

          {/* Memory Lock */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.memoryLock")}{" "}
              {renderParamTooltip("mlock", t("ai.memoryLock.tooltip"))}
            </Label>
            <Switch
              checked={settings.mlock}
              onCheckedChange={(checked) =>
                updateSettings("llm", {
                  settings: { ...settings, mlock: checked },
                })
              }
            />
          </div>

          {/* Disable MMAP */}
          <div className='flex items-center justify-between h-9'>
            <Label className='w-1/3'>
              {t("ai.disableMmap")}{" "}
              {renderParamTooltip("no_mmap", t("ai.disableMmap.tooltip"))}
            </Label>
            <Switch
              checked={settings.noMmap}
              onCheckedChange={(checked) =>
                updateSettings("llm", {
                  settings: { ...settings, noMmap: checked },
                })
              }
            />
          </div>

          {/* Reset */}
          <Button
            className='text-destructive'
            variant={"ghost"}
            onClick={() => {
              updateSettings("llm", stockSettings);
            }}
          >
            <RotateCcw className='mr-1' /> {t("ai.resetDefaults")}
          </Button>

          {/* Live Hugging Face model browser */}
          <HfModelBrowser onChanged={setDownloadedModels} />

          {/* Runtime download lifecycle: status badges + auto-refresh of the
          runtime list once a runtime finishes extracting. */}
          {getRuntimes(system).map((entry) => (
            <RuntimeWatcher
              key={entry.runtime.name}
              name={entry.runtime.name}
              onStatus={(patch) =>
                setDownloadStatusMap((prev) => ({
                  ...prev,
                  [entry.runtime.name]: {
                    ...prev[entry.runtime.name],
                    ...patch,
                  },
                }))
              }
              onSettled={refreshRuntimes}
            />
          ))}

          {/* Description */}
          <div className='flex flex-col gap-1.5 my-2'>
            <CardTitle className='text-2xl font-semibold'>
              {t("ai.runtimes")}
            </CardTitle>
            <CardDescription className='text-sm text-muted-foreground'>
              {t("ai.runtimes.description")}
            </CardDescription>
          </div>

          <div className='flex flex-col gap-3'>
            {getRuntimes(system).map((entry) => (
              <div
                key={entry.runtime.name}
                className='flex items-center justify-between border rounded-xl px-2 py-2 pl-4 shadow-sm'
              >
                <div className='flex gap-2 items-center'>
                  <span className='font-medium'>
                    {entry.runtime.label}{" "}
                    <span className='text-muted-foreground'>
                      ({entry.runtime.name})
                    </span>
                  </span>
                  <Badge variant='outline' className='w-fit'>
                    {entry.status === "confirmed" ? (
                      <>
                        <Check className='h-5 w-5' /> {t("common.supported")}
                      </>
                    ) : entry.status === "unknown" ? (
                      <>
                        <X className='h-5 w-5' /> {t("common.unknown")}
                      </>
                    ) : (
                      <>
                        <X className='h-5 w-5' /> {t("common.unsupported")}
                      </>
                    )}
                  </Badge>
                </div>

                <div className='flex gap-2'>
                  {downloadStatusMap[entry.runtime.name]?.state === "ready" && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive'
                      onClick={() => handleDeleteRuntime(entry.runtime.name)}
                    >
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  )}
                  {entry.status !== "unsupported" && (
                    <Button
                      size='sm'
                      variant='secondary'
                      disabled={
                        !entry.runtime.download ||
                        downloadStatusMap[entry.runtime.name]?.state ===
                          "ready" ||
                        downloadStatusMap[entry.runtime.name]?.state ===
                          "downloading" ||
                        downloadStatusMap[entry.runtime.name]?.state ===
                          "extracting" ||
                        deletingRuntime === entry.runtime.name
                      }
                      onClick={() =>
                        handleDownloadClick(
                          entry.runtime.name,
                          entry.runtime.download,
                          "runtime",
                        )
                      }
                    >
                      {(() => {
                        const state =
                          downloadStatusMap[entry.runtime.name]?.state ??
                          "idle";
                        const progress =
                          downloadStatusMap[entry.runtime.name]?.progress ?? 0;

                        if (state === "ready") {
                          return (
                            <>
                              <Check className='w-4 h-4 mr-1' />
                              {t("common.ready")}
                            </>
                          );
                        }

                        if (state === "downloading") {
                          return (
                            <>
                              <Download className='w-4 h-4 mr-1' />
                              {t("common.downloading")} ({Math.round(progress)}
                              %)
                            </>
                          );
                        }

                        if (state === "extracting") {
                          return (
                            <>
                              <Download className='w-4 h-4 mr-1' />
                              {t("common.extracting")}
                            </>
                          );
                        }

                        return (
                          <>
                            <Download className='w-4 h-4 mr-1' />
                            {t("common.download")}
                          </>
                        );
                      })()}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Runtime download lifecycle watcher                                  */
/* ------------------------------------------------------------------ */

function RuntimeWatcher({
  name,
  onStatus,
  onSettled,
}: {
  name: string;
  onStatus: (patch: { state?: DownloadState; progress?: number }) => void;
  onSettled: () => void;
}) {
  const { t } = useLanguage();

  useDownloadListeners(name, {
    onProgress: (progress) => onStatus({ state: "downloading", progress }),
    onComplete: () => onStatus({ state: "extracting" }),
    onError: (error) => {
      showError(`${t("ai.downloadErrorPrefix")} ${name}`, error);
      onStatus({ state: "error", progress: 0 });
    },
    // Extraction finishing is what actually makes the runtime usable, so the
    // list refresh happens here rather than on raw download completion.
    onExtractComplete: () => {
      onStatus({ state: "ready", progress: 100 });
      onSettled();
    },
    onExtractError: (error) => {
      showError(`${t("ai.extractErrorPrefix")} ${name}`, error);
      onStatus({ state: "error", progress: 0 });
    },
  });

  return null;
}
