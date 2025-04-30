import { LLMSettings } from "@/lib/defaultSettings";

export interface StoredLLMConfig {
  model: string;
  runtime: string;
  settings: LLMSettings;
}
