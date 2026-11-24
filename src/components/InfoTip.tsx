import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  /** The explanation shown on hover or focus. */
  text: string;
  /** Optional short tag before the icon, e.g. a technical name: "(ctx_size)". */
  tag?: string;
};

/** A muted ⓘ next to a setting's label that explains it on hover. */
export const InfoTip = ({ text, tag }: Props) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex items-center gap-1 text-muted-foreground cursor-help' tabIndex={0} aria-label={text}>
          {tag && <>({tag})</>} <Info className='h-4 w-4' />
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
