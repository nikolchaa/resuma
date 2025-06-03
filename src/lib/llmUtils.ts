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

Evaluate whether this entry is relevant to the job description based strictly on skills, tools, or tasks mentioned. Ignore dates, years of experience, and time-based requirements. For education entries, relevance means the field of study aligns with the job, even if courses don't match. For skill categories or groups, keep the entry if at least one item is even slightly relevant.

Respond ONLY with "yes" or "no" — no explanations, no formatting.

If the job description is empty or you're unsure, assume the entry IS relevant.`;

  try {
    const result = await callLLM(prompt);
    return result.trim().toLowerCase();
  } catch (error) {
    console.error("[Cleanup Error]:", error);
    throw error;
  }
};

export const runResumeEnhancement = async (
  entry: any,
  jobDesc: string
): Promise<string> => {
  const prompt = `Job Description:
${jobDesc}

Entry:
${JSON.stringify(entry, null, 2)}

Modify the description and notes fields to make them clearer, more concise, and directly relevant to the job description. You can add new notes, but do not remove any existing notes. Keep all other fields the same (dates, locations, etc.). Do not add new information not related to the job description. Return the updated entry as a JSON object only, no codeblock formatting. If the job description is not provided or you're not 100% sure, assume the entry is perfect as is.`;

  let result = await callLLM(prompt);
  result = result.trim();

  const codeBlockRegex = /^```(?:json)?\n?([\s\S]*?)\n?```$/i;
  const match = result.match(codeBlockRegex);
  if (match) result = match[1].trim();

  try {
    return JSON.parse(result);
  } catch (err) {
    console.error("LLM returned invalid JSON:", result);
    throw new Error("LLM enhancement response is not valid JSON.");
  }
};
