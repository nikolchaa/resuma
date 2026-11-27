import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  /** The explanation shown on hover or focus. */
  text: string;
  /** Optional short tag before the icon, e.g. a technical name: "(ctx_size)". */
  tag?: string;
};

/**
 * A muted ⓘ next to a setting's label that explains it on hover or focus.
 * Only the icon opens the tip, so the tip centres on it, not on the tag. It's
 * a button so that clicking it inside a <Label htmlFor> doesn't also toggle
 * the labelled control.
 */
export const InfoTip = ({ text, tag }: Props) => (
  <span className='inline-flex items-center gap-1 text-muted-foreground font-normal'>
    {tag && <span>({tag})</span>}
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          aria-label={text}
          className='inline-flex shrink-0 cursor-help rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
        >
          <Info className='size-4' />
        </button>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs'>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  </span>
);
