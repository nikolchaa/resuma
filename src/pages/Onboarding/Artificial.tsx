import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSystem } from "@/contexts/SystemContext";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Info,
  Microchip,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdaptiveSettings, LLMSettings } from "@/lib/defaultSettings";
import { getRuntimes } from "@/lib/resolveRuntime";
import {
  RuntimeEntry,
  selectRecommendedRuntime,
} from "@/lib/selectRecommendedRuntime";
import { invoke } from "@tauri-apps/api/core";
import { useDownloadListeners } from "@/hooks/useDownloadListeners";
import { checkAssetReady } from "@/lib/checkAssetReady";
import { DownloadStatusMap } from "@/types/downloadStatus";
import { getModels } from "@/lib/resolveModel";
import {
  ModelSelection,
  selectRecommendedModel,
} from "@/lib/selectRecommendedModel";
import { useOnboarding } from "@/contexts/OnboardingContext";

const Artificial = () => {
  const { state, update, apply } = useOnboarding();

  const navigate = useNavigate();
  const system = useSystem();

  const [runtime, setRuntime] = useState<RuntimeEntry | null>(null);
  const [model, setModel] = useState<ModelSelection>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [downloadStatusMap, setDownloadStatusMap] = useState<DownloadStatusMap>(
    {}
  );

  const cpu = system?.cpu?.model;
  const gpu = system?.gpu?.model;
  const gpuVram = system?.gpu?.vramMb;
  const ram = system?.ram?.sizeMb ? Math.round(system.ram.sizeMb / 1024) : null;

  const runtimeStatus = runtime?.name
    ? downloadStatusMap[runtime.name] ?? { state: "idle", progress: 0 }
    : { state: "idle", progress: 0 };

  const modelStatus = model?.model.name
    ? downloadStatusMap[model.model.name] ?? { state: "idle", progress: 0 }
    : { state: "idle", progress: 0 };

  const [defaultSettings, setDefaultSettings] = useState<LLMSettings>(
    getAdaptiveSettings({
      ramGb: ram,
      gpuVramMb: gpuVram,
      model: model,
    })
  );

  useEffect(() => {
    setDefaultSettings(
      getAdaptiveSettings({
        ramGb: ram,
        gpuVramMb: gpuVram,
        model: model,
      })
    );
  }, [system, model]);

  useEffect(() => {
    if (state.llm?.settings.ctxSize === 0) {
      update("llm", {
        settings: defaultSettings,
      });
    }
  }, [defaultSettings, state.llm?.settings]);

  useEffect(() => {
    setRuntime(() => selectRecommendedRuntime(getRuntimes(system)));
    setModel(() => selectRecommendedModel(getModels(system)));
  }, [system]);

  useEffect(() => {
    const checkRuntimeExistence = async () => {
      if (!runtime?.name) return;

      const exists = await checkAssetReady("runtimes", runtime.name);

      if (exists) {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [runtime.name]: {
            state: "ready",
            progress: 100,
          },
        }));
      }
    };

    checkRuntimeExistence();
  }, [runtime]);

  useEffect(() => {
    const checkModelExistence = async () => {
      if (!model?.model.name) return;

      const exists = await checkAssetReady("models", model.model.name);

      if (exists) {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [model.model.name]: {
            state: "ready",
            progress: 100,
          },
        }));
      }
    };

    checkModelExistence();
  }, [model]);

  useDownloadListeners(runtime?.name, {
    onProgress: (progress) => {
      if (!runtime?.name) return;
      setDownloadStatusMap((prev) => ({
        ...prev,
        [runtime.name]: {
          state: "downloading",
          progress,
        },
      }));
    },
    onComplete: () => {
      if (!runtime?.name) return;
      setDownloadStatusMap((prev) => ({
        ...prev,
        [runtime.name]: {
          ...prev[runtime.name],
          state: "extracting",
        },
      }));
    },
    onError: (error) => {
      if (!runtime?.name) return;
      console.error(`Download error for ${runtime.name}: ${error}`);
      setDownloadStatusMap((prev) => ({
        ...prev,
        [runtime.name]: {
          ...prev[runtime.name],
          state: "error",
        },
      }));
    },
    onExtractComplete: () => {
      if (!runtime?.name) return;
      setDownloadStatusMap((prev) => ({
        ...prev,
        [runtime.name]: {
          state: "ready",
          progress: 100,
        },
      }));
    },
    onExtractError: (error) => {
      if (!runtime?.name) return;
      console.error(`Extraction error for ${runtime.name}: ${error}`);
      setDownloadStatusMap((prev) => ({
        ...prev,
        [runtime.name]: {
          ...prev[runtime.name],
          state: "error",
        },
      }));
    },
  });

  useDownloadListeners(model?.model.name, {
    onProgress: (progress) => {
      if (!model?.model.name) return;
      setDownloadStatusMap((prev) => ({
        ...prev,
        [model.model.name]: {
          state: "downloading",
          progress,
        },
      }));
    },
    onComplete: () => {
      if (!model?.model.name) return;
      setDownloadStatusMap((prev) => ({
        ...prev,
        [model.model.name]: {
          ...prev[model.model.name],
          state: "ready",
          progress: 100,
        },
      }));
    },
    onError: (error) => {
      if (!model?.model.name) return;
      console.error(`Download error for ${model.model.name}: ${error}`);
      setDownloadStatusMap((prev) => ({
        ...prev,
        [model.model.name]: {
          ...prev[model.model.name],
          state: "error",
        },
      }));
    },
    onExtractComplete: () => {},
    onExtractError: () => {},
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
    <Card className='w-full max-w-lg mx-auto my-16'>
      <CardHeader>
        <CardTitle className='text-2xl font-semibold'>AI Setup</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          We'll configure a default model and runtime based on your system
          specs. You can change or download new ones later.
        </CardDescription>
      </CardHeader>

      <CardContent className='flex flex-col gap-4'>
        {/* System Info */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            Detected Specs
          </Label>
          <div className='text-sm flex flex-col gap-1'>
            <span>
              CPU: <span className='font-medium'>{cpu ?? "Detecting..."}</span>
            </span>
            <span>
              GPU:{" "}
              <span className='font-medium'>
                {gpu
                  ? `${gpu} (${Math.round(gpuVram / 1024)} GB)`
                  : "Detecting..."}
              </span>
            </span>
            <span>
              RAM:{" "}
              <span className='font-medium'>
                {ram ? `${ram} GB` : "Detecting..."}
              </span>
            </span>
          </div>
        </div>

        {/* Model Download */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            Recommended Model
          </Label>
          <div className='flex items-center justify-between'>
            <span className='font-medium'>
              {model ? (
                <>
                  {model.model.label}{" "}
                  <span className='text-muted-foreground text-sm'>
                    ({model.model.size})
                  </span>
                </>
              ) : model === null ? (
                "No compatible model found."
              ) : (
                "Detecting..."
              )}
            </span>
            <Button
              variant='secondary'
              size='sm'
              disabled={
                modelStatus.state === "downloading" ||
                modelStatus.state === "ready" ||
                model === null
              }
              onClick={() => {
                if (model?.model.name && model?.model.download) {
                  handleDownloadClick(
                    model.model.name,
                    model.model.download,
                    "model"
                  );
                }
              }}
            >
              {modelStatus.state === "ready" ? (
                <>
                  <Check className='w-4 h-4 mr-1' />
                  Ready
                </>
              ) : modelStatus.state === "downloading" ? (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  Downloading... ({Math.round(modelStatus.progress)}%)
                </>
              ) : (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  Download
                </>
              )}
            </Button>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='outline' className='flex items-center gap-1'>
              {model?.status === "gpu" ? (
                <>
                  <Microchip className='h-3.5 w-3.5' />
                  GPU Compatible
                </>
              ) : model?.status === "cpu" ? (
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
            {!(model === null) && (
              <Badge variant='outline'>{model?.model.parameters}</Badge>
            )}
            {!(model === null) && (
              <Badge variant='outline'>{model?.model.quantization}</Badge>
            )}
          </div>
          <Progress
            value={modelStatus.state === "ready" ? 100 : modelStatus.progress}
            className='h-2 mt-2'
          />
        </div>

        {/* Runtime Download */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            Recommended Runtime
          </Label>
          <div className='flex items-center justify-between'>
            <span className='font-medium'>
              {runtime ? (
                <>
                  {runtime.label}{" "}
                  <span className='text-muted-foreground text-sm'>
                    ({runtime.name})
                  </span>
                </>
              ) : runtime === null ? (
                "No compatible runtime found."
              ) : (
                "Detecting..."
              )}
            </span>
            <Button
              variant='secondary'
              size='sm'
              disabled={
                runtimeStatus.state === "downloading" ||
                runtimeStatus.state === "extracting" ||
                runtimeStatus.state === "ready" ||
                runtime === null
              }
              onClick={() => {
                if (runtime?.name && runtime?.download) {
                  handleDownloadClick(
                    runtime.name,
                    runtime.download,
                    "runtime"
                  );
                }
              }}
            >
              {runtimeStatus.state === "ready" ? (
                <>
                  <Check className='w-4 h-4 mr-1' />
                  Ready
                </>
              ) : runtimeStatus.state === "downloading" ? (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  Downloading... ({Math.round(runtimeStatus.progress)}%)
                </>
              ) : runtimeStatus.state === "extracting" ? (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  Extracting...
                </>
              ) : (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  Download
                </>
              )}
            </Button>
          </div>
          <Progress
            value={
              runtimeStatus.state === "ready"
                ? 100
                : runtimeStatus.state === "extracting"
                ? runtimeStatus.progress * 0.95
                : runtimeStatus.progress
            }
            className='h-2 mt-2'
          />
        </div>

        {/* Advanced Options Toggle */}
        <div className='flex justify-between items-center'>
          <Label className='text-muted-foreground text-sm'>
            Advanced Options
          </Label>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            {showAdvanced ? (
              <>
                Hide <ChevronUp className='ml-1 h-4 w-4' />
              </>
            ) : (
              <>
                Show <ChevronDown className='ml-1 h-4 w-4' />
              </>
            )}
          </Button>
        </div>

        {showAdvanced && state.llm?.settings && (
          <div className='flex flex-col gap-4'>
            {/* Threads */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Threads{" "}
                {renderParamTooltip(
                  "threads",
                  "Number of CPU threads used for inference."
                )}
              </Label>
              <Input
                type='number'
                placeholder='(Auto)'
                min={-1}
                max={system?.cpu?.threads ?? 16}
                value={
                  state.llm?.settings.threads === -1
                    ? ""
                    : state.llm?.settings.threads
                }
                onChange={(e) => {
                  const value = e.target.value;
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      threads:
                        value === "" ? defaultSettings.threads : Number(value),
                    },
                  });
                }}
                className='w-36 text-right'
              />
            </div>

            {/* Context Size */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Context Size{" "}
                {renderParamTooltip(
                  "ctx_size",
                  "Max tokens the model can keep in memory."
                )}
              </Label>
              <Input
                type='number'
                placeholder='(Auto)'
                max={16384}
                min={1024}
                value={
                  state.llm?.settings.ctxSize === defaultSettings.ctxSize
                    ? ""
                    : state.llm?.settings.ctxSize
                }
                onChange={(e) => {
                  const value = e.target.value;
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      ctxSize:
                        value === "" ? defaultSettings.ctxSize : Number(value),
                    },
                  });
                }}
                className='w-36 text-right'
              />
            </div>

            {/* Predict */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Predict{" "}
                {renderParamTooltip(
                  "predict",
                  "Max tokens to generate before stopping."
                )}
              </Label>
              <Input
                type='number'
                placeholder='(Auto)'
                min={-1}
                max={16384}
                value={
                  state.llm?.settings.predict === -1
                    ? ""
                    : state.llm?.settings.predict
                }
                onChange={(e) => {
                  const value = e.target.value;
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      predict:
                        value === "" ? defaultSettings.predict : Number(value),
                    },
                  });
                }}
                className='w-36 text-right'
              />
            </div>

            {/* GPU Layers */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                GPU Layers{" "}
                {renderParamTooltip(
                  "gpu_layers",
                  "Number of model layers offloaded to GPU."
                )}
              </Label>
              <Input
                type='number'
                placeholder='(Auto)'
                min={0}
                max={defaultSettings.gpuLayers}
                value={
                  state.llm?.settings.gpuLayers === defaultSettings.gpuLayers
                    ? ""
                    : state.llm?.settings.gpuLayers
                }
                onChange={(e) => {
                  const value = e.target.value;
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      gpuLayers:
                        value === ""
                          ? defaultSettings.gpuLayers
                          : Number(value),
                    },
                  });
                }}
                className='w-36 text-right'
              />
            </div>

            {/* Flash Attention */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Flash Attention{" "}
                {renderParamTooltip(
                  "flash_attn",
                  "Enables Flash Attention for faster generation if supported."
                )}
              </Label>
              <Switch
                checked={state.llm?.settings.flashAttn}
                onCheckedChange={(checked) => {
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      flashAttn: checked,
                    },
                  });
                }}
              />
            </div>

            {/* Memory Lock */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Memory Lock{" "}
                {renderParamTooltip(
                  "mlock",
                  "Locks model in memory to avoid swapping (more stable)."
                )}
              </Label>
              <Switch
                checked={state.llm?.settings.mlock}
                onCheckedChange={(checked) => {
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      mlock: checked,
                    },
                  });
                }}
              />
            </div>

            {/* Disable MMAP */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                Disable MMAP{" "}
                {renderParamTooltip(
                  "no_mmap",
                  "Avoids memory-mapping the model file. May fix load errors on some systems."
                )}
              </Label>
              <Switch
                checked={state.llm?.settings.noMmap}
                onCheckedChange={(checked) => {
                  update("llm", {
                    settings: {
                      ...state.llm?.settings,
                      noMmap: checked,
                    },
                  });
                }}
              />
            </div>
          </div>
        )}

        {/* Continue */}
        <div className='flex justify-end mt-4'>
          <Button
            disabled={
              !(runtimeStatus.state === "ready") ||
              !(modelStatus.state === "ready")
            }
            onClick={() => {
              apply("llm").then(() => navigate("/onboarding/step3"));
            }}
          >
            Continue <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Artificial;
