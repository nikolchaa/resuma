import providers from "@/data/providers.json";

/** Wire format spoken by a provider. Several providers share one flavor. */
export type ApiFlavor = "llamacpp" | "openai" | "anthropic" | "gemini" | "ollama";

/**
 * `bundled` is the downloaded llama.cpp runtime, `server` a model host running
 * on the user's machine or network, `cloud` a hosted API.
 */
export type ProviderKind = "bundled" | "server" | "cloud" | "custom";

export interface ProviderEntry {
  id: string;
  label: string;
  kind: ProviderKind;
  api: ApiFlavor;
  baseUrl: string;
  requiresKey: boolean;
  editableBaseUrl: boolean;
  editableApi: boolean;
  keyUrl: string;
}

export interface RemoteSettings {
  api: ApiFlavor;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export const LOCAL_PROVIDER_ID = "local";

export const providerList = providers as ProviderEntry[];

export const remoteProviders = providerList.filter(
  (provider) => provider.kind !== "bundled"
);

/** Flavors a custom endpoint can be pointed at. */
export const apiFlavors: Exclude<ApiFlavor, "llamacpp">[] = [
  "openai",
  "anthropic",
  "gemini",
  "ollama",
];

export function getProvider(id: string | undefined): ProviderEntry {
  return (
    providerList.find((provider) => provider.id === id) ??
    providerList.find((provider) => provider.id === LOCAL_PROVIDER_ID)!
  );
}

export function isLocalProvider(id: string | undefined): boolean {
  return getProvider(id).kind === "bundled";
}

/** Fresh remote config for a provider, used when switching providers. */
export function defaultRemoteSettings(
  provider: ProviderEntry,
  previous?: Partial<RemoteSettings>
): RemoteSettings {
  return {
    api: provider.api === "llamacpp" ? "openai" : provider.api,
    baseUrl: provider.baseUrl,
    model: "",
    temperature: previous?.temperature ?? 0.7,
    maxTokens: previous?.maxTokens ?? 4096,
  };
}

/**
 * A provider is usable once it has a model and, for cloud APIs, a stored key.
 * The base URL is only ever blank for a custom endpoint the user hasn't filled in.
 */
export function isRemoteConfigured(
  provider: ProviderEntry,
  remote: RemoteSettings,
  hasKey: boolean
): boolean {
  if (!remote.baseUrl.trim() || !remote.model.trim()) return false;
  if (provider.requiresKey && !hasKey) return false;
  return true;
}
