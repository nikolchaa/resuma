import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteApiKey,
  getKeystoreStatus,
  hasApiKey,
  KeystoreStatus,
  listRemoteModels,
  RemoteModel,
  setApiKey,
} from "@/lib/apiKeys";
import {
  ApiFlavor,
  apiFlavors,
  ProviderEntry,
  RemoteSettings,
} from "@/lib/resolveProvider";
import { showError, showSuccess } from "@/lib/toastUtils";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  provider: ProviderEntry;
  remote: RemoteSettings;
  onChange: (patch: Partial<RemoteSettings>) => void;
  /** Lets the parent gate its "continue"/"apply" action on a stored key. */
  onKeyStatusChange?: (hasKey: boolean) => void;
};

/**
 * Configuration for every provider that is reached over HTTP - cloud APIs and
 * local hosts alike. Keys are written straight to the OS credential store and
 * are never held in app state beyond the un-saved draft.
 */
export const RemoteProviderSetup = ({
  provider,
  remote,
  onChange,
  onKeyStatusChange,
}: Props) => {
  const { t } = useLanguage();

  const [keyDraft, setKeyDraft] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyStored, setKeyStored] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  const [keystore, setKeystore] = useState<KeystoreStatus | null>(null);
  const [models, setModels] = useState<RemoteModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [manualModel, setManualModel] = useState(false);

  /** Discards responses from a provider/URL the user has already moved on from. */
  const requestRef = useRef(0);

  const baseUrl = remote.baseUrl.trim();

  const updateKeyStored = useCallback(
    (stored: boolean) => {
      setKeyStored(stored);
      onKeyStatusChange?.(stored);
    },
    [onKeyStatusChange],
  );

  const fetchModels = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!baseUrl) return;

      const request = ++requestRef.current;
      setLoadingModels(true);

      try {
        const result = await listRemoteModels(provider.id, remote.api, baseUrl);
        if (request !== requestRef.current) return;

        setModels(result);

        // Nothing to pick from: fall back to typing the id by hand.
        if (result.length === 0) setManualModel(true);

        if (!options?.silent) {
          showSuccess(
            t("ai.provider.modelsLoaded"),
            `${result.length} ${t("ai.provider.modelsFound")}`,
          );
        }
      } catch (error) {
        if (request !== requestRef.current) return;

        setModels([]);
        setManualModel(true);
        if (!options?.silent) {
          showError(
            t("ai.provider.modelsFailed"),
            typeof error === "string" ? error : (error as Error).message,
          );
        }
      } finally {
        if (request === requestRef.current) setLoadingModels(false);
      }
    },
    [baseUrl, provider.id, remote.api, t],
  );

  useEffect(() => {
    getKeystoreStatus()
      .then(setKeystore)
      .catch(() => setKeystore(null));
  }, []);

  // Reset per-provider state whenever the selected provider changes.
  useEffect(() => {
    let active = true;

    requestRef.current += 1;
    setKeyDraft("");
    setKeyVisible(false);
    setModels([]);
    setManualModel(false);
    setLoadingModels(false);

    hasApiKey(provider.id)
      .then((stored) => {
        if (!active) return;
        updateKeyStored(stored);
      })
      .catch(() => active && updateKeyStored(false));

    return () => {
      active = false;
    };
  }, [provider.id, updateKeyStored]);

  // Load the model list as soon as the provider can actually be reached.
  // Debounced, because the base URL is a free-text field for local hosts.
  useEffect(() => {
    if (!baseUrl) return;
    if (provider.requiresKey && !keyStored) return;

    const timeout = setTimeout(() => fetchModels({ silent: true }), 600);
    return () => clearTimeout(timeout);
  }, [baseUrl, keyStored, provider.requiresKey, fetchModels]);

  const handleSaveKey = async () => {
    setSavingKey(true);
    try {
      await setApiKey(provider.id, keyDraft);
      setKeyDraft("");
      setKeyVisible(false);
      updateKeyStored(true);
      showSuccess(t("ai.provider.keySaved"), provider.label);
    } catch (error) {
      showError(
        t("ai.provider.keySaveFailed"),
        typeof error === "string" ? error : (error as Error).message,
      );
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearKey = async () => {
    try {
      await deleteApiKey(provider.id);
      setKeyDraft("");
      setModels([]);
      updateKeyStored(false);
      showSuccess(t("ai.provider.keyCleared"), provider.label);
    } catch (error) {
      showError(
        t("ai.provider.keyClearFailed"),
        typeof error === "string" ? error : (error as Error).message,
      );
    }
  };

  const showKeyField = provider.requiresKey || provider.kind === "custom";

  // A custom endpoint is treated as third-party: we cannot know where it points.
  const isThirdParty = provider.kind === "cloud" || provider.kind === "custom";

  return (
    <div className='flex flex-col gap-4'>
      {/* What leaving the device actually means for this provider */}
      {isThirdParty ? (
        <div className='flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-3'>
          <CircleAlert className='h-4 w-4 shrink-0 text-yellow-500 mt-0.5' />
          <p className='text-xs text-muted-foreground'>
            <span className='text-yellow-500'>
              {t("ai.provider.disclosure.title")}
            </span>{" "}
            {t("ai.provider.disclosure.cloud").replace(
              "{provider}",
              provider.label,
            )}
          </p>
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>
          {t("ai.provider.disclosure.server")}
        </p>
      )}

      {/* API flavor - only a custom endpoint needs to declare what it speaks */}
      {provider.editableApi && (
        <div className='flex items-center justify-between h-9'>
          <Label className='w-1/3'>{t("ai.provider.api")}</Label>
          <Select
            value={remote.api}
            onValueChange={(value) => {
              onChange({ api: value as ApiFlavor, model: "" });
              setModels([]);
            }}
          >
            <SelectTrigger className='w-2/3 text-right'>
              <SelectValue placeholder={t("ai.provider.api.select")} />
            </SelectTrigger>
            <SelectContent>
              {apiFlavors.map((flavor) => (
                <SelectItem key={flavor} value={flavor}>
                  {t(`ai.provider.api.${flavor}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Base URL */}
      {provider.editableBaseUrl ? (
        <div className='flex items-center justify-between h-9'>
          <Label className='w-1/3'>{t("ai.provider.baseUrl")}</Label>
          <Input
            value={remote.baseUrl}
            placeholder={provider.baseUrl || "http://localhost:11434"}
            onChange={(e) => onChange({ baseUrl: e.target.value })}
            className='w-2/3 text-right'
          />
        </div>
      ) : (
        <div className='flex items-center justify-between h-9'>
          <Label className='w-1/3'>{t("ai.provider.baseUrl")}</Label>
          <span className='w-2/3 text-right text-sm text-muted-foreground truncate'>
            {provider.baseUrl}
          </span>
        </div>
      )}

      {/* API key */}
      {showKeyField && (
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-2'>
            <Label className='flex items-center gap-2'>
              {t("ai.provider.apiKey")}
              <Badge variant='outline'>
                {keyStored ? (
                  <>
                    <Check className='h-3.5 w-3.5' />{" "}
                    {t("ai.provider.keyStored")}
                  </>
                ) : (
                  <>
                    <X className='h-3.5 w-3.5' /> {t("ai.provider.keyMissing")}
                  </>
                )}
              </Badge>
            </Label>
            <div className='flex w-full gap-2'>
              <Input
                type={keyVisible ? "text" : "password"}
                value={keyDraft}
                placeholder={
                  keyStored
                    ? t("ai.provider.keyPlaceholderStored")
                    : t("ai.provider.keyPlaceholder")
                }
                onChange={(e) => setKeyDraft(e.target.value)}
                className='flex-grow'
              />
              <Button
                variant='ghost'
                size='sm'
                type='button'
                onClick={() => setKeyVisible((prev) => !prev)}
              >
                {keyVisible ? (
                  <EyeOff className='h-4 w-4' />
                ) : (
                  <Eye className='h-4 w-4' />
                )}
              </Button>
              <Button
                size='sm'
                disabled={!keyDraft.trim() || savingKey}
                onClick={handleSaveKey}
              >
                {savingKey ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  t("common.save")
                )}
              </Button>
              {keyStored && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='text-destructive'
                  onClick={handleClearKey}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              )}
            </div>
          </div>

          {keystore && !keystore.secure && (
            <p className='text-xs text-yellow-500 flex gap-1.5'>
              <CircleAlert className='h-4 w-4 shrink-0' />
              <span>
                {t("ai.provider.keyStorageFallback")}
                {keystore.location && (
                  <span className='text-muted-foreground'>
                    {" "}
                    {keystore.location}
                  </span>
                )}
              </span>
            </p>
          )}

          <p className='text-xs text-muted-foreground'>
            {keystore?.secure === false
              ? t("ai.provider.keyStorageFallbackHint")
              : t("ai.provider.keyStorage")}
            {provider.keyUrl && (
              <>
                {" "}
                <a
                  href={provider.keyUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='underline inline-flex items-center gap-1'
                >
                  {t("ai.provider.getKey")}
                  <ExternalLink className='h-3 w-3' />
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {/* Model */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>{t("ai.model")}</Label>
        <div className='flex w-2/3 gap-2'>
          {manualModel || models.length === 0 ? (
            <Input
              value={remote.model}
              placeholder={t("ai.provider.modelPlaceholder")}
              onChange={(e) => onChange({ model: e.target.value })}
              className='flex-grow text-right'
            />
          ) : (
            <Select
              value={remote.model}
              onValueChange={(value) => onChange({ model: value })}
            >
              <SelectTrigger className='flex-grow text-right'>
                <SelectValue placeholder={t("ai.model.select")} />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant='outline'
            size='sm'
            disabled={loadingModels || !baseUrl}
            onClick={() => fetchModels()}
            title={t("ai.provider.refreshModels")}
          >
            {loadingModels ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4' />
            )}
          </Button>
        </div>
      </div>

      {models.length > 0 && (
        <div className='flex justify-end'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setManualModel((prev) => !prev)}
          >
            {manualModel
              ? t("ai.provider.pickFromList")
              : t("ai.provider.enterManually")}
          </Button>
        </div>
      )}

      {/* Temperature */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>{t("ai.provider.temperature")}</Label>
        <Input
          type='number'
          min={0}
          max={2}
          step={0.1}
          value={remote.temperature}
          onChange={(e) =>
            onChange({
              temperature: Math.min(2, Math.max(0, Number(e.target.value))),
            })
          }
          className='w-2/3 text-right'
        />
      </div>

      {/* Max tokens */}
      <div className='flex items-center justify-between h-9'>
        <Label className='w-1/3'>{t("ai.provider.maxTokens")}</Label>
        <Input
          type='number'
          min={256}
          max={32768}
          value={remote.maxTokens}
          onChange={(e) =>
            onChange({
              maxTokens: Math.min(32768, Math.max(256, Number(e.target.value))),
            })
          }
          className='w-2/3 text-right'
        />
      </div>
    </div>
  );
};
