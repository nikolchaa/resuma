import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "./store";
import { SettingsType } from "@/contexts/OnboardingContext";
import { isAiDisabled } from "./resolveProvider";

type LLMSettings = SettingsType["llm"];

// === Internal: LLM Core ===

/** The request was stopped (see AiRequest.cancel). */
export class AiCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "AiCancelledError";
  }
}

export const isAiCancelled = (error: unknown): boolean =>
  error instanceof AiCancelledError || String((error as Error)?.message ?? error) === "cancelled";

export type AiRequest = {
  promise: Promise<string>;
  /** Stops the request: a queued one never starts, a running one is killed or dropped. */
  cancel: () => void;
};

export type PromptOptions = {
  /**
   * Skip the model's thinking step where that's possible (local Qwen3
   * models): much faster for short, mechanical tasks.
   */
  noThink?: boolean;
};

// Local llama.cpp runs one request at a time: two at once would load the
// model twice and compete for the same GPU memory.
let localQueue: Promise<unknown> = Promise.resolve();

const isLocal = (llm: LLMSettings | undefined) => (llm?.provider ?? "local") === "local";

/** Starts a prompt on the configured provider (fails when AI is off). */
export function startPrompt(prompt: string, opts: PromptOptions = {}): AiRequest {
  const requestId = crypto.randomUUID();
  let cancelled = false;

  const execute = async (llmSettings: LLMSettings): Promise<string> => {
    if (cancelled) throw new AiCancelledError();
    const text =
      opts.noThink && isLocal(llmSettings) && /qwen3/i.test(llmSettings?.model ?? "")
        ? `${prompt}\n/no_think`
        : prompt;
    try {
      return await invoke<string>("call_llm", { prompt: text, llmSettings, requestId });
    } catch (error) {
      if (cancelled || isAiCancelled(error)) throw new AiCancelledError();
      console.error("LLM error:", error);
      throw error;
    }
  };

  const promise = (async () => {
    const settings = await getSettings();
    const llmSettings: LLMSettings = settings.llm;
    if (isAiDisabled(llmSettings?.provider)) {
      throw new Error("AI features are turned off (No AI provider).");
    }
    if (!isLocal(llmSettings)) return execute(llmSettings);
    const turn = localQueue.then(
      () => execute(llmSettings),
      () => execute(llmSettings)
    );
    localQueue = turn.catch(() => undefined);
    return turn;
  })();

  return {
    promise,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      invoke("cancel_llm", { requestId }).catch(() => undefined);
    },
  };
}

const callLLM = (prompt: string, opts?: PromptOptions): Promise<string> => startPrompt(prompt, opts).promise;

/** Sends a raw prompt to the configured provider (throws when AI is off). */
export const runPrompt = (prompt: string): Promise<string> => callLLM(prompt);

// === AI Task-Specific Helpers ===

export const runTextEnhancement = async (
  text: string,
  jobDesc: string,
  contextType: "experience" | "project" | "award" = "experience"
): Promise<string> => {
  let prompt = "";

  if (contextType === "experience") {
    prompt = `Job Description:
${jobDesc}

Text:
${text}

Your task: Rewrite the above text to make it clearer, more concise, and directly relevant to the job description. It should be written from the perspective of an ex-employee, highlighting achievements and responsibilities in a professional tone. Focus on improving the grammar, sentence structure, and relevance. If the text is already clear and relevant, leave it mostly unchanged. Do NOT add any unrelated details or fabricate new information. Return the rewritten text only, without any additional comments or formatting.`;
  } else if (contextType === "project") {
    prompt = `Job Description:
${jobDesc}

Project Description:
${text}

Your task: Rewrite the above project description to make it clearer, more concise, and directly relevant to the job description. Write it from the perspective of a contributor or team member. Focus on highlighting the goals, challenges, solutions, and outcomes. Ensure proper grammar, sentence structure, and relevance. If the description is already clear and relevant, leave it mostly unchanged. Do NOT add any unrelated details or fabricate new information. Return the rewritten text only, without any additional comments or formatting.`;
  } else if (contextType === "award") {
    prompt = `Job Description:
${jobDesc}

Award Description:
${text}

Your task: Rewrite the above award description to make it clearer, more concise, and directly relevant to the job description. Write it from the perspective of a recipient, emphasizing why this award was given and how it relates to professional skills or achievements. Ensure proper grammar, sentence structure, and relevance. If the description is already clear and relevant, leave it mostly unchanged. Do NOT add any unrelated details or fabricate new information. Return the rewritten text only, without any additional comments or formatting.`;
  }

  try {
    const result = await callLLM(prompt);
    return result.trim();
  } catch (error) {
    console.error("[Text Enhancement Error]:", error);
    throw error;
  }
};
