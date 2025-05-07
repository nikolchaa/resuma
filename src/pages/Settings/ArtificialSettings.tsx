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
import { RotateCcw, Info } from "lucide-react";
import { SettingsType } from "@/contexts/OnboardingContext";

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
          value={settings.gpuLayers}
          onChange={(e) =>
            updateSettings("llm", {
              settings: { ...settings, gpuLayers: Number(e.target.value) },
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
    </div>
  );
};
