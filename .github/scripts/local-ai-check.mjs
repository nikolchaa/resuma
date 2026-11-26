// Prepares a local AI request on a CI runner, the way the app would: picks
// the CPU llama.cpp build for this platform and architecture from
// runtimes.json, extracts it into a runtimes folder, and puts the light
// starter model where the app keeps models, plus the job matching model.
// The Rust tests `real_local_request` and `real_rerank` then make one real
// request each.
import { execFileSync } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const platform = { win32: "windows", darwin: "macos", linux: "linux" }[process.platform];
const arch = { x64: "x64", arm64: "arm64" }[process.arch];
const runtimes = JSON.parse(readFileSync(new URL("../../src/data/runtimes.json", import.meta.url), "utf8"));

// The build the app runs without a GPU (on Apple silicon, the Metal build).
const runtime =
  runtimes.find((r) => r.platform === platform && r.arch === arch && r.backend === "cpu" && r.name.includes("cpu")) ??
  runtimes.find((r) => r.platform === platform && r.arch === arch && r.backend === "cpu");
if (!runtime) throw new Error(`No CPU runtime for ${platform}/${arch} in runtimes.json`);

const MODEL_ID = "Qwen3-0.6B-Q8_0";
const MODEL_URL = "https://huggingface.co/lmstudio-community/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf";

// Where the app keeps its data (dirs-next data_dir() + the app identifier).
const dataDir =
  platform === "windows"
    ? process.env.APPDATA
    : platform === "macos"
      ? join(homedir(), "Library", "Application Support")
      : process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const appData = join(dataDir, "com.resuma.app");

async function download(url, file) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

const runtimesDir = join(tmpdir(), "resuma-runtimes");
const runtimeDir = join(runtimesDir, runtime.name);
rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(runtimeDir, { recursive: true });
for (const url of [runtime.download, ...(runtime.extraDownloads ?? [])]) {
  const archive = join(tmpdir(), url.split("/").pop());
  console.log(`Downloading ${url}`);
  await download(url, archive);
  // bsdtar (Windows, macOS) reads zip and tar.gz; Linux builds are tar.gz.
  // On Windows, Windows' own tar: Git's GNU tar reads "C:" as a remote host.
  const tar = platform === "windows" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  execFileSync(tar, ["-xf", archive, "-C", runtimeDir], { stdio: "inherit" });
}

const modelDir = join(appData, "models", MODEL_ID.replace(/\./g, "_"));
mkdirSync(modelDir, { recursive: true });
console.log(`Downloading ${MODEL_URL}`);
await download(MODEL_URL, join(modelDir, MODEL_URL.split("/").pop()));

// The job matching model, for the Rust test `real_rerank`.
const RERANKER_ID = "qwen3-reranker-0_6b-q8_0";
const RERANKER_URL = "https://huggingface.co/ggml-org/Qwen3-Reranker-0.6B-Q8_0-GGUF/resolve/main/qwen3-reranker-0.6b-q8_0.gguf";
const rerankersDir = join(tmpdir(), "resuma-rerankers");
mkdirSync(join(rerankersDir, RERANKER_ID), { recursive: true });
console.log(`Downloading ${RERANKER_URL}`);
await download(RERANKER_URL, join(rerankersDir, RERANKER_ID, RERANKER_URL.split("/").pop()));

const env =
  `RESUMA_TEST_RUNTIMES_DIR=${runtimesDir}\nRESUMA_TEST_RUNTIME=${runtime.name}\nRESUMA_TEST_MODEL=${MODEL_ID}\n` +
  `RESUMA_TEST_RERANKERS_DIR=${rerankersDir}\nRESUMA_TEST_RERANKER=${RERANKER_ID}\n`;
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, env);
console.log(`Runtime ${runtime.name} (${platform}/${arch}), ${MODEL_ID} and ${RERANKER_ID} are ready.\n${env}`);
