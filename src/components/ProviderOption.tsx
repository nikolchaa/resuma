import type { ComponentType, SVGProps } from "react";
import { Ban, Cpu, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProviderEntry } from "@/lib/resolveProvider";

// Provider logos are bundled local SVGs (LobeHub Icons, MIT - see
// THIRD_PARTY.md); nothing is fetched at runtime. They use `currentColor`, so
// they follow the text colour in light and dark themes.
import AnthropicLogo from "@/assets/providers/anthropic.svg?react";
import OpenAILogo from "@/assets/providers/openai.svg?react";
import GeminiLogo from "@/assets/providers/gemini.svg?react";
import DeepSeekLogo from "@/assets/providers/deepseek.svg?react";
import KimiLogo from "@/assets/providers/kimi.svg?react";
import LMStudioLogo from "@/assets/providers/lmstudio.svg?react";
import OllamaLogo from "@/assets/providers/ollama.svg?react";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const PROVIDER_ICONS: Record<string, Icon> = {
  local: Cpu,
  ollama: OllamaLogo,
  lmstudio: LMStudioLogo,
  anthropic: AnthropicLogo,
  openai: OpenAILogo,
  gemini: GeminiLogo,
  deepseek: DeepSeekLogo,
  kimi: KimiLogo,
  custom: Plug,
  none: Ban,
};

/** Logo + name (+ kind badge) for one entry of the AI provider dropdown. */
export const ProviderOption = ({ provider }: { provider: ProviderEntry }) => {
  const { t } = useLanguage();
  const Logo = PROVIDER_ICONS[provider.id] ?? Plug;
  const label =
    provider.kind === "none"
      ? t("ai.provider.none", provider.label)
      : provider.label;

  return (
    <span className='flex items-center gap-2'>
      <Logo aria-hidden='true' className='size-4 shrink-0 text-current' />
      <span>{label}</span>
      {provider.kind !== "none" && (
        <Badge variant='outline'>{t(`ai.provider.kind.${provider.kind}`)}</Badge>
      )}
    </span>
  );
};
