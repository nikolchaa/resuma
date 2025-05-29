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

Rewrite the entry to make it more concise, clear, and directly relevant to the job description. Focus on skills, tools, and tasks mentioned in both the entry and the job description. Retain original dates and locations exactly as they are—do not modify them. Do not invent or add any new information not present in the original entry. Return the enhanced entry as a JSON object only.`;

  const result = await callLLM(prompt);
  return result.trim();
};
