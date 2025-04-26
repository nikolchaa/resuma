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
  ChevronDown,
  ChevronUp,
  Download,
  Info,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdaptiveSettings } from "@/lib/defaultSettings";
import { getRuntimes } from "@/lib/resolveRuntime";
import {
  RuntimeEntry,
  selectRecommendedRuntime,
} from "@/lib/selectRecommendedRuntime";

const Artificial = () => {
  const navigate = useNavigate();
  const system = useSystem();
  const [runtime, setRuntime] = useState<RuntimeEntry | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);

  const cpu = system?.cpu?.model;
  const gpu = system?.gpu?.model;
  const gpuVram = system?.gpu?.vramMb;
  const ram = system?.ram?.sizeMb ? Math.round(system.ram.sizeMb / 1024) : null;

  const defaultSettings = getAdaptiveSettings({
    ramGb: ram,
    gpuVramMb: gpuVram,
    gpuManufacturer: system?.gpu?.manufacturer ?? null,
  });

  useEffect(() => {
    setRuntime(() => selectRecommendedRuntime(getRuntimes(system)));

    console.log(runtime);
  }, [system]);

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
            <span className='font-medium'>mistral-7b-instruct.gguf</span>
            <Button variant='secondary' size='sm'>
              <Download className='w-4 h-4 mr-1' />
              Download
            </Button>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge variant='outline'>Quantized</Badge>
            <Badge variant='outline'>7B</Badge>
            <Badge variant='outline'>Instruct</Badge>
          </div>
          <Progress value={0} className='h-2 mt-2' />
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
              ) : (
                "Detecting..."
              )}
            </span>
            <Button variant='secondary' size='sm'>
              <Download className='w-4 h-4 mr-1' />
              Download
            </Button>
          </div>
          <Progress value={0} className='h-2 mt-2' />
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

        {/* Advanced Fields */}
        {showAdvanced && (
          <div className='flex flex-col gap-4'>
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
                className='w-36 text-right'
              />
            </div>
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
                className='w-36 text-right'
              />
            </div>
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
                className='w-36 text-right'
              />
            </div>
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
                className='w-36 text-right'
              />
            </div>
            <div className='flex items-center justify-between h-9'>
              <Label>
                Flash Attention{" "}
                {renderParamTooltip(
                  "flash_attn",
                  "Enables Flash Attention for faster generation if supported."
                )}
              </Label>
              <Switch defaultChecked={defaultSettings.flashAttn} />
            </div>
            <div className='flex items-center justify-between h-9'>
              <Label>
                Memory Lock{" "}
                {renderParamTooltip(
                  "mlock",
                  "Locks model in memory to avoid swapping (more stable)."
                )}
              </Label>
              <Switch defaultChecked={defaultSettings.mlock} />
            </div>
            <div className='flex items-center justify-between h-9'>
              <Label>
                Disable MMAP{" "}
                {renderParamTooltip(
                  "no_mmap",
                  "Avoids memory-mapping the model file. May fix load errors on some systems."
                )}
              </Label>
              <Switch defaultChecked={defaultSettings.noMmap} />
            </div>
          </div>
        )}

        {/* Continue */}
        <div className='flex justify-end'>
          <Button disabled onClick={() => navigate("/onboarding/step3")}>
            Continue <ArrowRight className='h-4' />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Artificial;
