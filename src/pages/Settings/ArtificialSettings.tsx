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
      console.error("Error reading downloaded models:", error);
      return [];
    }
  };

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

      console.log(`Deleted model folder: ${modelName}`);
    } catch (error) {
      console.error("Failed to delete model:", error);
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

    loadDownloadedModels();
  }, []);

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
        console.error(`Download error for ${safeName}: ${error}`);
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
    } catch (error) {
      console.error(`Error downloading ${assetName}:`, error);
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
        <Input
          value={llm.runtime}
          onChange={(e) => updateSettings("llm", { runtime: e.target.value })}
          className='text-right w-2/3'
        />
      </div>

      {/* Model */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>Model</Label>
        <Input
          value={llm.model}
          onChange={(e) => updateSettings("llm", { model: e.target.value })}
          className='text-right w-2/3'
        />
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
                  console.log("download: ", entry.model.download);
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

      <div className='flex flex-col gap-1.5'>
        {getRuntimes(system).map((entry) => (
          <div
            key={entry.runtime.name}
            className='flex items-center justify-between'
          >
            <Label className='w-1/3'>{entry.runtime.label}</Label>
            <div className='text-right w-2/3'>
              <span>{entry.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
