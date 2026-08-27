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
  RotateCcw,
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
import {
  getTierResults,
  TierResult,
} from "@/lib/resolveModel";
import {
  selectRecommendedTier,
} from "@/lib/selectRecommendedModel";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { showError } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { describePrimaryGpu, effectiveVramMb } from "@/lib/gpuSelection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  defaultRemoteSettings,
  getProvider,
  isRemoteConfigured,
  providerList,
} from "@/lib/resolveProvider";
import { RemoteProviderSetup } from "@/components/RemoteProviderSetup";

const safeName = (name: string) => name.replace(/\./g, "_");

const Artificial = () => {
  const { t } = useLanguage();
  const { state, update, apply, exists } = useOnboarding();

  const navigate = useNavigate();
  const system = useSystem();

  const [runtime, setRuntime] = useState<RuntimeEntry | null>(null);
  const [tierResults, setTierResults] = useState<TierResult[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [remoteHasKey, setRemoteHasKey] = useState(false);

  const provider = getProvider(state.llm.provider);
  const isLocal = provider.kind === "bundled";

  const [downloadStatusMap, setDownloadStatusMap] = useState<DownloadStatusMap>(
    {}
  );

  const cpu = system?.cpu?.model;
  const gpuLabel = describePrimaryGpu(system);
  const ram = system?.ram?.sizeMb ? Math.round(system.ram.sizeMb / 1024) : null;
  // system.gpu is already the priority-picked primary adapter.
  const gpuVramMb = system?.gpu ? effectiveVramMb(system.gpu, system.ram.sizeMb) : null;

  const runtimeStatus = runtime?.name
    ? downloadStatusMap[runtime.name] ?? {
        state: "idle",
        progress: 0,
      }
    : { state: "idle", progress: 0 };

  // Hardware detection may land late; re-score whenever specs arrive and
  // preselect the recommended tier exactly once hardware is known.
  useEffect(() => {
    setTierResults(getTierResults(system));
    setRuntime(() => selectRecommendedRuntime(getRuntimes(system)));
  }, [system]);

  const selectedTier =
    tierResults.find((tier) => tier.id === selectedTierId) ?? null;

  useEffect(() => {
    setSelectedTierId(selectRecommendedTier(tierResults)?.id ?? null);
  }, [tierResults]);

  const modelStatus = selectedTier
    ? downloadStatusMap[safeName(selectedTier.model.name)] ?? {
        state: "idle",
        progress: 0,
      }
    : { state: "idle", progress: 0 };

  const [defaultSettings, setDefaultSettings] = useState<LLMSettings>(
    getAdaptiveSettings({
      ramGb: ram,
      gpuVramMb: gpuVramMb,
      model: selectedTier,
    })
  );

  useEffect(() => {
    setDefaultSettings(
      getAdaptiveSettings({
        ramGb: ram,
        gpuVramMb: gpuVramMb,
        model: selectedTier,
      })
    );
  }, [system, selectedTier]);

  useEffect(() => {
    const checkAndSet = async () => {
      const hasLLM = await exists("llm");
      if (!hasLLM) {
        update("llm", { settings: defaultSettings });
      }
    };

    checkAndSet();
  }, [defaultSettings]);

  useEffect(() => {
    const checkRuntimeExistence = async () => {
      if (!runtime?.name) return;

      const assetExists = await checkAssetReady("runtimes", runtime.name);

      if (assetExists) {
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
    update("llm", {
      runtime: runtime?.name ?? "",
    });
  }, [runtime]);

  useEffect(() => {
    const checkAndApplyTier = async () => {
      if (!selectedTier) return;

      const assetName = safeName(selectedTier.model.name);
      const assetExists = await checkAssetReady("models", assetName);

      if (assetExists) {
        setDownloadStatusMap((prev) => ({
          ...prev,
          [assetName]: {
            state: "ready",
            progress: 100,
          },
        }));
      }

      update("llm", { model: selectedTier.model.name });
    };

    checkAndApplyTier();
  }, [selectedTier]);

  const handleDownloadClick = async (
    assetName: string,
    assetUrls: string[],
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
        assetUrls,
        noExtract: assetType === "model",
        assetType,
      });
    } catch (error) {
      showError(`${t("ai.downloadErrorPrefix")} ${assetName}`, (error as Error).message);
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
        <CardTitle className='text-2xl font-semibold'>
          {t("ai.setup.title")}
        </CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>
          {t("ai.setup.description")}
        </CardDescription>
      </CardHeader>

      <CardContent className='flex flex-col gap-4'>
        {/* Provider */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            {t("ai.provider")}
          </Label>
          <Select
            value={state.llm.provider}
            onValueChange={(value) => {
              const next = getProvider(value);
              update("llm", {
                provider: value,
                remote: defaultRemoteSettings(next, state.llm.remote),
              });
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue placeholder={t("ai.provider.select")} />
            </SelectTrigger>
            <SelectContent>
              {providerList.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}{" "}
                  <Badge variant='outline'>{t(`ai.provider.kind.${entry.kind}`)}</Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Remote providers get their disclosure from RemoteProviderSetup. */}
          {isLocal && (
            <p className='text-xs text-muted-foreground'>
              {t("ai.provider.localHint")}
            </p>
          )}
        </div>

        {isLocal ? (
          <>
        {/* System Info */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            {t("field.detectedSpecs")}
          </Label>
          <div className='text-sm flex flex-col gap-1'>
            <span>
               CPU: <span className='font-medium'>{cpu ?? t("common.detecting")}</span>
            </span>
            <span>
              GPU:{" "}
              <span className='font-medium'>
                {gpuLabel ?? t("common.detecting")}
              </span>
            </span>
            <span>
              RAM:{" "}
              <span className='font-medium'>
                 {ram ? `${ram} GB` : t("common.detecting")}
              </span>
            </span>
          </div>
        </div>

        {/* Starter model tiers */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            {t("ai.tier.pickModel")}
          </Label>

          {!selectedTier && tierResults.length === 0 && (
            <p className='text-sm text-muted-foreground'>{t("common.detecting")}</p>
          )}

          {tierResults.map((tier) => (
            <StarterTierRow
              key={tier.id}
              tier={tier}
              selected={selectedTierId === tier.id}
              status={
                downloadStatusMap[safeName(tier.model.name)] ?? {
                  state: "idle",
                  progress: 0,
                }
              }
              onSelect={() => setSelectedTierId(tier.id)}
              onDownload={() =>
                handleDownloadClick(
                  safeName(tier.model.name),
                  [tier.model.download],
                  "model"
                )
              }
              setStatus={setDownloadStatusMap}
            />
          ))}
        </div>

        {/* Runtime Download */}
        <div className='flex flex-col gap-2'>
          <Label className='text-muted-foreground text-sm'>
            {t("field.recommendedRuntime")}
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
                t("ai.recommendedRuntime.none")
              ) : (
                t("common.detecting")
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
                    [runtime.download],
                    "runtime"
                  );
                }
              }}
            >
              {runtimeStatus.state === "ready" ? (
                <>
                  <Check className='w-4 h-4 mr-1' />
                  {t("common.ready")}
                </>
              ) : runtimeStatus.state === "downloading" ? (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  {t("common.downloading")} ({Math.round(runtimeStatus.progress)}%)
                </>
              ) : runtimeStatus.state === "extracting" ? (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  {t("common.extracting")}
                </>
              ) : (
                <>
                  <Download className='w-4 h-4 mr-1' />
                  {t("common.download")}
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
            {t("ai.advancedOptions")}
          </Label>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setShowAdvanced((prev) => !prev)}
          >
            {showAdvanced ? (
              <>
                 {t("common.hide")} <ChevronUp className='ml-1 h-4 w-4' />
              </>
            ) : (
              <>
                 {t("common.show")} <ChevronDown className='ml-1 h-4 w-4' />
              </>
            )}
          </Button>
        </div>

        {showAdvanced && state.llm?.settings && (
          <div className='flex flex-col gap-4'>
            {/* Context Size */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                 {t("ai.contextSize")}{" "}
                 {renderParamTooltip(
                   "ctx_size",
                   t("ai.contextSize.tooltip")
                 )}
              </Label>
              <Input
                type='number'
                placeholder={`${defaultSettings.ctxSize}`}
                max={16384}
                min={1}
                value={state.llm?.settings.ctxSize}
                onChange={(e) => {
                  const value = e.target.value;
                  if (+value >= 1 && +value <= 16384) {
                    update("llm", {
                      settings: {
                        ...state.llm?.settings,
                        ctxSize:
                          value === ""
                            ? defaultSettings.ctxSize
                            : Number(value),
                      },
                    });
                  }
                }}
                className='w-36 text-right'
              />
            </div>

            {/* GPU Layers */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                 {t("ai.gpuLayers")}{" "}
                 {renderParamTooltip(
                   "gpu_layers",
                   t("ai.gpuLayers.tooltip")
                 )}
              </Label>
              <Input
                type='number'
                placeholder={`${defaultSettings.gpuLayers}`}
                min={0}
                max={defaultSettings.gpuLayers || undefined}
                value={state.llm?.settings.gpuLayers}
                onChange={(e) => {
                  const value = e.target.value;
                  const ceiling = defaultSettings.gpuLayers;
                  if (ceiling === 0 || (+value >= 0 && +value <= ceiling)) {
                    update("llm", {
                      settings: {
                        ...state.llm?.settings,
                        gpuLayers:
                          value === "" ? defaultSettings.gpuLayers : Number(value),
                      },
                    });
                  }
                }}
                className='w-36 text-right'
              />
            </div>

            {/* Flash Attention */}
            <div className='flex items-center justify-between h-9'>
              <Label>
                 {t("ai.flashAttention")}{" "}
                 {renderParamTooltip(
                   "flash_attn",
                   t("ai.flashAttention.tooltip")
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
                 {t("ai.memoryLock")}{" "}
                 {renderParamTooltip(
                   "mlock",
                   t("ai.memoryLock.tooltip")
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
                 {t("ai.disableMmap")}{" "}
                 {renderParamTooltip(
                   "no_mmap",
                   t("ai.disableMmap.tooltip")
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

            {/* Reset to Default Settings */}
            <Button
              className='text-destructive'
              variant={"ghost"}
              onClick={() => {
                update("llm", { settings: defaultSettings });
              }}
            >
               <RotateCcw /> {t("ai.resetDefault")}
            </Button>
          </div>
        )}
          </>
        ) : (
          <RemoteProviderSetup
            provider={provider}
            remote={state.llm.remote}
            onChange={(patch) =>
              update("llm", { remote: { ...state.llm.remote, ...patch } })
            }
            onKeyStatusChange={setRemoteHasKey}
          />
        )}

        {/* Continue */}
        <div className='flex justify-end mt-4'>
          <Button
            disabled={
              isLocal
                ? runtimeStatus.state !== "ready" ||
                  !selectedTier ||
                  modelStatus.state !== "ready"
                : !isRemoteConfigured(provider, state.llm.remote, remoteHasKey)
            }
            onClick={() => {
              apply("llm").then(() => navigate("/onboarding/step3"));
            }}
          >
            {t("common.continue")} <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

/* ------------------------------------------------------------------ */
/* One starter-model option                                            */
/* ------------------------------------------------------------------ */

function StarterTierRow({
  tier,
  selected,
  status,
  onSelect,
  onDownload,
  setStatus,
}: {
  tier: TierResult;
  selected: boolean;
  status: { state: string; progress: number };
  onSelect: () => void;
  onDownload: () => void;
  setStatus: React.Dispatch<React.SetStateAction<DownloadStatusMap>>;
}) {
  const { t } = useLanguage();

  useDownloadListeners(safeName(tier.model.name), {
    onProgress: (progress) => {
      setStatus((prev) => ({
        ...prev,
        [safeName(tier.model.name)]: { state: "downloading", progress },
      }));
    },
    onComplete: () => {
      setStatus((prev) => ({
        ...prev,
        [safeName(tier.model.name)]: { state: "ready", progress: 100 },
      }));
    },
    onError: (error) => {
      showError(
        `${t("ai.downloadErrorPrefix")} ${safeName(tier.model.name)}`,
        error
      );
      setStatus((prev) => ({
        ...prev,
        [safeName(tier.model.name)]: { state: "error", progress: 0 },
      }));
    },
    onExtractComplete: () => {},
    onExtractError: () => {},
  });

  const tierLabelKey = `ai.tier.${tier.id}`;
  const tierDescKey = `ai.tier.${tier.id}.description`;

  return (
    <button
      type='button'
      onClick={onSelect}
      className={`border rounded-xl px-3 py-2.5 shadow-sm bg-background text-left transition-colors w-full ${
        selected ? "border-primary ring-1 ring-primary" : "hover:border-muted-foreground/40"
      }`}
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='min-w-0'>
          <div className='font-medium text-sm flex items-center gap-2'>
            {tier.model.label}
            <Badge variant='outline'>{t(tierLabelKey, tier.id)}</Badge>
          </div>
          <p className='text-xs text-muted-foreground mt-0.5 truncate'>
            {t(tierDescKey, "")}
          </p>
          <div className='flex flex-wrap gap-1.5 mt-1.5'>
            <Badge variant='outline' className='flex items-center gap-1'>
              {tier.status === "gpu" ? (
                <>
                  <Microchip className='h-3 w-3' />
                  {t("ai.gpuCompatible")}
                </>
              ) : tier.status === "cpu" ? (
                <>
                  <Cpu className='h-3 w-3' />
                  {t("ai.cpuCompatible")}
                </>
              ) : (
                <>
                  <X className='h-3 w-3' />
                  {t("common.unsupported")}
                </>
              )}
            </Badge>
            <Badge variant='outline'>{tier.model.parameters}</Badge>
            <Badge variant='outline'>{tier.model.quantization}</Badge>
            <Badge variant='outline'>{tier.model.size}</Badge>
          </div>
        </div>

        <span onClick={(e) => e.stopPropagation()}>
          <Button
            variant={status.state === "ready" ? "ghost" : "secondary"}
            size='sm'
            disabled={
              status.state === "downloading" ||
              status.state === "ready" ||
              tier.status === "unsupported"
            }
            onClick={() => {
              onSelect();
              if (status.state !== "ready") onDownload();
            }}
          >
            {status.state === "ready" ? (
              <>
                <Check className='w-4 h-4 mr-1' />
                {t("common.ready")}
              </>
            ) : status.state === "downloading" ? (
              <>
                <Download className='w-4 h-4 mr-1' />
                {`${t("common.downloading")} (${Math.round(status.progress)}%)`}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-1" />
                {t("common.download")}
              </>
            )}
          </Button>
        </span>
      </div>

      {(status.state === "downloading" || status.state === "ready") && (
        <Progress
          value={status.state === "ready" ? 100 : status.progress}
          className='h-1.5 mt-2'
        />
      )}
    </button>
  );
}

export default Artificial;
