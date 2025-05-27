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
import {
  RotateCcw,
  Info,
  Microchip,
  Cpu,
  X,
  Download,
  Check,
  Trash2,
} from "lucide-react";
import { SettingsType } from "@/contexts/OnboardingContext";
import { getModels } from "@/lib/resolveModel";
import { useSystem } from "@/contexts/SystemContext";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { getRuntimes } from "@/lib/resolveRuntime";
import { Badge } from "@/components/ui/badge";
import { DownloadStatusMap } from "@/types/downloadStatus";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useDownloadListeners } from "@/hooks/useDownloadListeners";
import {
  BaseDirectory,
  DirEntry,
  readDir,
  remove,
} from "@tauri-apps/plugin-fs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError } from "@/lib/toastUtils";

type Props = {
  llm: SettingsType["llm"];
  updateSettings: <K extends keyof SettingsType>(
    section: K,
    data: Partial<SettingsType[K]>
  ) => void;
  stockSettings: SettingsType["llm"];
};

export const ArtificialSettings = ({
  llm,
  updateSettings,
  stockSettings,
}: Props) => {
  const settings = llm.settings;
  const system = useSystem();

  const [downloadedModelNames, setDownloadedModelNames] = useState<string[]>(
    []
  );
  const [downloadedRuntimeNames, setDownloadedRuntimeNames] = useState<
    string[]
  >([]);
  const [downloadStatusMap, setDownloadStatusMap] = useState<DownloadStatusMap>(
    {}
  );

  const getDownloadedModels = async (): Promise<string[]> => {
    try {
      const entries: DirEntry[] = await readDir("models", {
        baseDir: BaseDirectory.AppData,
      });

      const folders = entries
        .filter((entry) => entry.name && entry.isDirectory)
        .map((entry) => entry.name as string);

      return folders;
    } catch (error) {
      showError(
        "Error reading downloaded models",
        (error as Error).message || "An unexpected error occurred"
      );
      return [];
    }
  };

  const getDownloadedRuntimes = async (): Promise<string[]> => {
    try {
      const entries: DirEntry[] = await readDir("runtimes", {
        baseDir: BaseDirectory.AppData,
      });

      const folders = entries
        .filter((entry) => entry.name && entry.isDirectory)
        .map((entry) => entry.name as string);

      return folders;
    } catch (error) {
      showError(
        "Error reading downloaded runtimes",
        (error as Error).message || "An unexpected error occurred"
      );
      return [];
    }
  };

  useEffect(() => {
    const loadDownloadedModels = async () => {
      const folders = await getDownloadedModels();

      const readyMap: DownloadStatusMap = {};
      folders.forEach((folderName) => {
        readyMap[folderName] = {
          state: "ready",
          progress: 100,
        };
      });

      setDownloadStatusMap((prev) => ({
        ...readyMap,
        ...prev, // don't overwrite in-progress ones
      }));
    };
    const loadDownloadedRuntimes = async () => {
      const folders = await getDownloadedRuntimes();

      const readyMap: DownloadStatusMap = {};
      folders.forEach((folderName) => {
        readyMap[folderName] = {
          state: "ready",
          progress: 100,
        };
      });

      setDownloadStatusMap((prev) => ({
        ...readyMap,
        ...prev, // don't overwrite in-progress ones
      }));
    };

    loadDownloadedModels();
    loadDownloadedRuntimes();

    getDownloadedModels().then(setDownloadedModelNames);
    getDownloadedRuntimes().then(setDownloadedRuntimeNames);
  }, []);

  const downloadedModels = getModels(system).filter((entry) => {
    const safeName = entry.model.name.replace(/\./g, "_");
    return downloadedModelNames.includes(safeName);
  });
  const downloadedRuntimes = getRuntimes(system).filter((entry) => {
    return downloadedRuntimeNames.includes(entry.runtime.name);
  });

  const handleDeleteModel = async (modelName: string) => {
    try {
      await remove(`models/${modelName.replace(/\./g, "_")}`, {
        recursive: true,
        baseDir: BaseDirectory.AppData,
      });

      setDownloadStatusMap((prev) => {
        const updated = { ...prev };
        delete updated[modelName.replace(/\./g, "_")];
        return updated;
      });
    } catch (error) {
      showError(
        "Failed to delete model",
        (error as Error).message || "An unexpected error occurred"
      );
    }
  };

  const handleDeleteRuntime = async (runtimeName: string) => {
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
    } catch (error) {
      showError(
        "Failed to delete runtime",
        (error as Error).message || "An unexpected error occurred"
      );
    }
  };

  getModels(system).forEach((entry) => {
    const safeName = entry.model.name.replace(/\./g, "_");
    useDownloadListeners(safeName, {
      onProgress: (progress) => {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [safeName]: {
            state: "downloading",
            progress,
          },
        }));
      },
      onComplete: () => {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [safeName]: {
            ...prev[safeName],
            state: "ready",
            progress: 100,
          },
        }));
      },
      onError: (error) => {
        showError(
          `Download error for ${safeName}`,
          error || "An unexpected error occurred"
        );
        setDownloadStatusMap((prev) => ({
          ...prev,
          [safeName]: {
            ...prev[safeName],
            state: "error",
          },
        }));
      },
      onExtractComplete: () => {},
      onExtractError: () => {},
    });
  });

  getRuntimes(system).forEach((entry) => {
    const name = entry.runtime.name;
    if (!name) return;

    useDownloadListeners(name, {
      onProgress: (progress) => {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [name]: {
            state: "downloading",
            progress,
          },
        }));
      },
      onComplete: () => {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            state: "extracting",
          },
        }));
      },
      onError: (error) => {
        showError(
          `Download error for ${name}`,
          error || "An unexpected error occurred"
        );
        setDownloadStatusMap((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            state: "error",
          },
        }));
      },
      onExtractComplete: () => {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [name]: {
            state: "ready",
            progress: 100,
          },
        }));
      },
      onExtractError: (error) => {
        showError(
          `Extraction error for ${name}`,
          error || "An unexpected error occurred"
        );
        setDownloadStatusMap((prev) => ({
          ...prev,
          [name]: {
            ...prev[name],
            state: "error",
          },
        }));
      },
    });
  });

  const handleDownloadClick = async (
    assetName: string,
    assetUrl: string,
    assetType: "runtime" | "model"
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
        assetUrl,
        noExtract: assetType === "model",
        assetType,
      });
    } catch (err) {
      showError(
        `Error downloading ${assetName}`,
        (err as Error).message || "An unexpected error occurred"
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
      {/* Runtime */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>Runtime</Label>
        <Select
          value={llm.runtime}
          onValueChange={(value) => updateSettings("llm", { runtime: value })}
        >
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder='Select model' />
          </SelectTrigger>
          <SelectContent>
            {downloadedRuntimes.map((entry) => (
              <SelectItem key={entry.runtime.name} value={entry.runtime.name}>
                {entry.runtime.label}{" "}
                <Badge variant='outline'>
                  {entry.runtime.backend.toUpperCase()}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>Model</Label>
        <Select
          value={llm.model}
          onValueChange={(value) => updateSettings("llm", { model: value })}
        >
          <SelectTrigger className='w-2/3 text-right'>
            <SelectValue placeholder='Select model' />
          </SelectTrigger>
          <SelectContent>
            {downloadedModels.map((entry) => (
              <SelectItem key={entry.model.name} value={entry.model.name}>
                {entry.model.label}{" "}
                <Badge variant='outline'>{entry.model.size}</Badge>
                <Badge variant='outline'>{entry.status.toUpperCase()}</Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Context Size */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>
          Context Size{" "}
          {renderParamTooltip(
            "ctx_size",
            "Max tokens the model can keep in memory."
          )}
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
          GPU Layers{" "}
          {renderParamTooltip(
            "gpu_layers",
            "Number of model layers offloaded to GPU."
          )}
        </Label>

        <Input
          type='number'
          min={0}
          disabled={
            getRuntimes(system).find((r) => r.runtime.name === llm.runtime)
              ?.runtime.backend === "cpu"
          }
          max={
            getModels(system).find((entry) => entry.model.name === llm.model)
              ?.model.layers ?? 48
          }
          value={settings.gpuLayers}
          onChange={(e) =>
            updateSettings("llm", {
              settings: {
                ...settings,
                gpuLayers: Math.min(
                  Math.max(0, Number(e.target.value)),
                  getModels(system).find(
                    (entry) => entry.model.name === llm.model
                  )?.model.layers ?? 48
                ),
              },
            })
          }
          className='text-right w-2/3'
        />
      </div>

      {/* Flash Attention */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>
          Flash Attention{" "}
          {renderParamTooltip(
            "flash_attn",
            "Enables Flash Attention for faster generation."
          )}
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
          Memory Lock{" "}
          {renderParamTooltip(
            "mlock",
            "Locks model in memory to avoid swapping."
          )}
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
          Disable MMAP{" "}
          {renderParamTooltip(
            "no_mmap",
            "Avoids memory-mapping the model file."
          )}
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
        <RotateCcw className='mr-1' /> Reset to Defaults
      </Button>

      {/* Description */}
      <div className='flex flex-col gap-1.5 my-2'>
        <CardTitle className='text-2xl font-semibold'>AI Models</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Download an AI model from the available options below.
        </CardDescription>
      </div>

      <div className='flex gap-4 overflow-x-auto scrollbar-override pb-2'>
        {getModels(system).map((entry) => (
          <div
            key={entry.model.name}
            className='min-w-[260px] shrink-0 border rounded-lg p-4 flex flex-col justify-between shadow-sm bg-background gap-3'
          >
            <div className='font-medium text-lg'>
              {entry.model.label}{" "}
              <span className='text-muted-foreground text-sm'>
                ({entry.model.size})
              </span>
            </div>

            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline' className='flex items-center gap-1'>
                {entry.status === "gpu" ? (
                  <>
                    <Microchip className='h-3.5 w-3.5' />
                    GPU Compatible
                  </>
                ) : entry.status === "cpu" ? (
                  <>
                    <Cpu className='h-3.5 w-3.5' />
                    CPU Compatible
                  </>
                ) : (
                  <>
                    <X className='h-3.5 w-3.5' />
                    Unsupported
                  </>
                )}
              </Badge>
              <Badge variant='outline'>{entry.model.parameters}</Badge>
              <Badge variant='outline'>{entry.model.quantization}</Badge>
            </div>

            <div className='flex gap-2 mt-2'>
              <Button
                size='sm'
                disabled={
                  !entry.model.download ||
                  entry.status === "unsupported" ||
                  downloadStatusMap[entry.model.name.replace(/\./g, "_")]
                    ?.state === "ready" ||
                  downloadStatusMap[entry.model.name.replace(/\./g, "_")]
                    ?.state === "downloading"
                }
                onClick={() => {
                  handleDownloadClick(
                    entry.model.name.replace(/\./g, "_"),
                    entry.model.download,
                    "model"
                  );
                }}
                className='flex-grow'
              >
                {(entry.model.name.replace(/\./g, "_")
                  ? downloadStatusMap[entry.model.name.replace(/\./g, "_")] ?? {
                      state: "idle",
                      progress: 0,
                    }
                  : { state: "idle", progress: 0 }
                ).state === "ready" ? (
                  <>
                    <Check className='w-4 h-4 mr-1' />
                    Ready
                  </>
                ) : (entry.model.name.replace(/\./g, "_")
                    ? downloadStatusMap[
                        entry.model.name.replace(/\./g, "_")
                      ] ?? {
                        state: "idle",
                        progress: 0,
                      }
                    : { state: "idle", progress: 0 }
                  ).state === "downloading" ? (
                  <>
                    <Download className='w-4 h-4 mr-1' />
                    Downloading... (
                    {Math.round(
                      (entry.model.name.replace(/\./g, "_")
                        ? downloadStatusMap[
                            entry.model.name.replace(/\./g, "_")
                          ] ?? {
                            state: "idle",
                            progress: 0,
                          }
                        : { state: "idle", progress: 0 }
                      ).progress
                    )}
                    %)
                  </>
                ) : (
                  <>
                    <Download className='w-4 h-4 mr-1' />
                    Download
                  </>
                )}
              </Button>
              {downloadStatusMap[entry.model.name.replace(/\./g, "_")]
                ?.state === "ready" && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-destructive'
                  onClick={() => handleDeleteModel(entry.model.name)}
                >
                  <Trash2 className='w-4 h-4' />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Description */}
      <div className='flex flex-col gap-1.5 my-2'>
        <CardTitle className='text-2xl font-semibold'>Runtimes</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          Download a compatible runtime from the available options below.
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
                    <Check className='h-5 w-5' /> Supported
                  </>
                ) : entry.status === "unknown" ? (
                  <>
                    <X className='h-5 w-5' /> Unknown
                  </>
                ) : (
                  <>
                    <X className='h-5 w-5' /> Unsupported
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
              <Button
                size='sm'
                variant={"secondary"}
                disabled={
                  !entry.runtime.download ||
                  entry.status === "unsupported" ||
                  downloadStatusMap[entry.runtime.name]?.state === "ready" ||
                  downloadStatusMap[entry.runtime.name]?.state ===
                    "downloading" ||
                  downloadStatusMap[entry.runtime.name]?.state === "extracting"
                }
                onClick={() =>
                  handleDownloadClick(
                    entry.runtime.name,
                    entry.runtime.download,
                    "runtime"
                  )
                }
              >
                {(entry.runtime.name
                  ? downloadStatusMap[entry.runtime.name] ?? {
                      state: "idle",
                      progress: 0,
                    }
                  : { state: "idle", progress: 0 }
                ).state === "ready" ? (
                  <>
                    <Check className='w-4 h-4 mr-1' />
                    Ready
                  </>
                ) : (entry.runtime.name
                    ? downloadStatusMap[entry.runtime.name] ?? {
                        state: "idle",
                        progress: 0,
                      }
                    : { state: "idle", progress: 0 }
                  ).state === "downloading" ? (
                  <>
                    <Download className='w-4 h-4 mr-1' />
                    Downloading... (
                    {Math.round(
                      (entry.runtime.name
                        ? downloadStatusMap[entry.runtime.name] ?? {
                            state: "idle",
                            progress: 0,
                          }
                        : { state: "idle", progress: 0 }
                      ).progress
                    )}
                    %)
                  </>
                ) : (entry.runtime.name
                    ? downloadStatusMap[entry.runtime.name] ?? {
                        state: "idle",
                        progress: 0,
                      }
                    : { state: "idle", progress: 0 }
                  ).state === "extracting" ? (
                  <>
                    <Download className='w-4 h-4 mr-1' />
                    Extracting...
                  </>
                ) : entry.status === "unsupported" ? (
                  <>
                    <X className='w-4 h-4 mr-1' />
                    Unsupported
                  </>
                ) : (
                  <>
                    <Download className='w-4 h-4 mr-1' />
                    Download
                  </>
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
