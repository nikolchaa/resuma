import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "./store";
import { SettingsType } from "@/contexts/OnboardingContext";

type LLMSettings = SettingsType["llm"];

// === Internal: LLM Core ===
const callLLM = async (prompt: string): Promise<string> => {
  try {
    const settings = await getSettings();
    const llmSettings: LLMSettings = settings.llm;

    const result = await invoke<string>("call_llm", {
      prompt,
      llmSettings,
    });

    return result;
  } catch (error) {
    console.error("LLM error:", error);
    throw error;
  }
};

// === AI Task-Specific Helpers ===

export const runResumeCleanup = async (
  entry: any,
  jobDesc: string
): Promise<string> => {
  const prompt = `Job Description:
${jobDesc}

Entry:
${JSON.stringify(entry, null, 2)}

Is this entry relevant to the job description? Ignore dates, years of experience, and time-related requirements completely. Only assess based on the skills, tools, and tasks mentioned. If it's a school, courses don't have to match the job description, as long as it's in the same field of expertise, it should be present. Respond only with "yes" or "no".`;

  const result = await callLLM(prompt);
  return result.trim().toLowerCase();
};

export const runResumeEnhancement = async (
  entry: any,
  jobDesc: string
): Promise<string> => {
  const prompt = `Job Description:
${jobDesc}

Entry:
${JSON.stringify(entry, null, 2)}

Rewrite the description and notes fields to make them clearer, more concise, and directly relevant to the job description. You can add new notes, but do not remove any existing notes. Keep all other fields the same (dates, locations, etc.). Do not add new information not related to the job description. Return the updated entry as a JSON object only, no codeblock formatting.`;

  const result = await callLLM(prompt);
  return result.trim();
};
