import { invoke } from "@tauri-apps/api/core";

export interface HfSearchResult {
  repo: string;
  author: string;
  likes: number;
  downloads: number;
  lastModified: string;
  files: string[];
}

export interface HfFileEntry {
  path: string;
  sizeBytes: number;
}

/** One downloadable model build: a single .gguf file or a full shard set. */
export interface GgufVariant {
  key: string;
  label: string;
  quant: string | null;
  urls: string[];
  sizeBytes: number;
  partCount: number;
}

export const searchHuggingFaceModels = (query: string) =>
  invoke<HfSearchResult[]>("search_huggingface_models", { query });

export const fetchHuggingFaceFiles = (repo: string) =>
  invoke<HfFileEntry[]>("get_huggingface_files", { repo });

/**
 * Local model ids double as download folder names, so they are restricted to
 * filesystem-safe characters. Every consumer treats ids as opaque strings.
 */
export const sanitizeAssetName = (input: string) => {
  const cleaned = input
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.slice(0, 120) || "model";
};

export const resolveUrl = (repo: string, path: string) =>
  `https://huggingface.co/${repo}/resolve/main/${path}`;

/** "-00001-of-00003" shard membership. */
const SHARD_RE = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;

const QUANT_RE =
  /(mxfp4[a-z0-9_]*|iq[1-4][a-z0-9_]*|q[2-8][a-z0-9_]*|bf16|fp16|f16|fp32|f32)/i;

const PREFERRED_QUANTS = [
  "Q4_K_M",
  "Q4_K_S",
  "IQ4_XS",
  "Q4_0",
  "Q5_K_M",
  "Q5_K_S",
  "Q6_K",
  "Q3_K_M",
  "Q3_K_L",
  "Q2_K",
  "Q8_0",
  "BF16",
  "F16",
  "F32",
];

export function extractQuant(filePath: string): string | null {
  const segments = filePath.replace(/\.gguf$/i, "").split("/");
  const stem = segments[segments.length - 1] ?? "";

  let last: RegExpExecArray | null = null;
  const re = new RegExp(QUANT_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(stem)) !== null) last = match;

  if (!last) return null;
  return last[0].toUpperCase();
}

/**
 * Pulls a "30B"-style parameter label out of a repo or file name, e.g.
 * "Qwen3-Coder-30B-A3B-Instruct" -> "30B". MoE names carry both total and
 * active sizes ("30B-A3B"); the largest wins because memory footprint is
 * driven by total weights. Returns null when nothing plausible matches.
 */
export function extractParameters(text: string): string | null {
  const stem = text.replace(/\.gguf$/i, "");

  let best: number | null = null;
  const re = /(\d+(?:\.\d+)?)\s*[b](?![a-z0-9])/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(stem)) !== null) {
    const value = parseFloat(match[1]);
    if (Number.isFinite(value) && (best === null || value > best)) {
      best = value;
    }
  }

  return best === null ? null : `${best}B`;
}

export function buildVariants(
  repo: string,
  files: HfFileEntry[]
): GgufVariant[] {
  const singles: GgufVariant[] = [];
  const shardGroups = new Map<string, HfFileEntry[]>();

  for (const file of files) {
    const match = SHARD_RE.exec(file.path);

    if (match) {
      const [, base, , totalCount] = match;
      const key = `${base.toLowerCase()}::${totalCount}`;
      const group = shardGroups.get(key) ?? [];
      group.push(file);
      shardGroups.set(key, group);
    } else {
      const quant = extractQuant(file.path);
      const fallback =
        file.path.replace(/\.gguf$/i, "").split("/").pop() ?? "model";
      singles.push({
        key: file.path,
        label: quant ?? fallback,
        quant,
        urls: [resolveUrl(repo, file.path)],
        sizeBytes: file.sizeBytes,
        partCount: 1,
      });
    }
  }

  const sharded: GgufVariant[] = [];

  for (const [key, parts] of shardGroups) {
    const expected = Number(key.split("::")[1]);

    // Sharded GGUFs only load when every part is present.
    if (parts.length !== expected) continue;

    const ordered = [...parts].sort((a, b) => a.path.localeCompare(b.path));
    const firstBase = ordered[0].path.match(SHARD_RE)?.[1] ?? key;
    const quant = extractQuant(firstBase);
    const knownSizes = ordered.map((p) => p.sizeBytes);

    sharded.push({
      key: `shards:${firstBase}`,
      label: quant ?? firstBase.split("/").pop() ?? firstBase,
      quant,
      urls: ordered.map((p) => resolveUrl(repo, p.path)),
      sizeBytes: knownSizes.some((s) => s === 0)
        ? 0
        : knownSizes.reduce((sum, s) => sum + s, 0),
      partCount: ordered.length,
    });
  }

  const quantRank = (variant: GgufVariant) => {
    if (!variant.quant) return PREFERRED_QUANTS.length;
    const index = PREFERRED_QUANTS.indexOf(variant.quant.toUpperCase());
    return index === -1 ? PREFERRED_QUANTS.length : index;
  };

  return [...singles, ...sharded].sort(
    (a, b) =>
      quantRank(a) - quantRank(b) ||
      (b.sizeBytes || Infinity) - (a.sizeBytes || Infinity)
  );
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${bytes} B`;
}
