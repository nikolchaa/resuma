//! Turns the "Auto offload" GPU-layers setting into a real `--gpu-layers`
//! count.
//!
//! The setting is stored as `-1`, but the bundled llama.cpp (b5588) reads
//! `--gpu-layers -1` as "keep the default", and that default is 0 layers on
//! CUDA, Vulkan and HIP builds (only Metal builds default to all layers). So
//! passing `-1` through ran every request on the CPU. Here "auto" asks the
//! runtime which devices it can use (`llama-cli --list-devices`) and sizes
//! the offload from the device memory, the model file size and the KV cache
//! for the configured context.

use std::path::Path;

use crate::gguf::{self, ModelShape};

const MIB: f64 = 1024.0 * 1024.0;

/// llama-cli's own context size when `--ctx-size` is not passed.
const LLAMA_CLI_DEFAULT_CTX: u64 = 4096;

/// What llama.cpp clamps to "every layer" when the layer count is unknown.
const ALL_LAYERS: u32 = 999;

/// One accelerator as `llama-cli --list-devices` reports it.
#[derive(Debug, Clone, PartialEq)]
pub struct Device {
    pub name: String,
    pub total_mib: u64,
    pub free_mib: u64,
}

/// Parses `llama-cli --list-devices` output:
///
/// ```text
/// Available devices:
///   Vulkan0: NVIDIA GeForce RTX 4060 Laptop GPU (7957 MiB, 7957 MiB free)
/// ```
///
/// A build whose GPU backend failed to load prints the header and no
/// devices.
pub fn parse_devices(output: &str) -> Vec<Device> {
    let mut in_list = false;
    let mut devices = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        if line.starts_with("Available devices") {
            in_list = true;
            continue;
        }
        if in_list {
            if let Some(device) = parse_device_line(line) {
                devices.push(device);
            }
        }
    }

    devices
}

fn parse_device_line(line: &str) -> Option<Device> {
    let body = line.strip_suffix(" MiB free)")?;
    // Descriptions may contain parentheses themselves; memory is the last pair.
    let open = body.rfind(" (")?;
    let (head, memory) = (&body[..open], &body[open + 2..]);
    let (total, free) = memory.split_once(" MiB, ")?;
    let (name, _description) = head.split_once(':')?;

    Some(Device {
        name: name.trim().to_string(),
        total_mib: total.trim().parse().ok()?,
        free_mib: free.trim().parse().ok()?,
    })
}

/// f16 K and V caches for `ctx` tokens, which is what llama.cpp allocates
/// next to each offloaded layer by default. Falls back to a generous share
/// of the weights when the GGUF lacks attention metadata.
fn kv_cache_mib(shape: &ModelShape, ctx: u64, weights_mib: f64) -> f64 {
    let heads = shape.head_count as u64;
    if shape.block_count == 0 || shape.embedding_length == 0 || heads == 0 {
        return weights_mib * 0.25 * (ctx as f64 / LLAMA_CLI_DEFAULT_CTX as f64);
    }

    let kv_heads = if shape.head_count_kv > 0 {
        shape.head_count_kv as u64
    } else {
        heads
    };
    let key = if shape.key_length > 0 {
        shape.key_length as u64
    } else {
        shape.embedding_length as u64 / heads
    };
    let value = if shape.value_length > 0 {
        shape.value_length as u64
    } else {
        key
    };

    let bytes = ctx * shape.block_count as u64 * kv_heads * (key + value) * 2;
    bytes as f64 / MIB
}

/// How many layers to offload so the model, its KV cache and llama.cpp's
/// compute buffers stay inside the free device memory.
///
/// Everything fits: all layers, output layer included (`block_count + 1`,
/// the "37/37" in llama.cpp's log for a 36-block model). Otherwise the
/// share of blocks that fits, counting each block's weights and KV cache.
/// Too little memory for even one block: 0, plain CPU execution.
pub fn plan_gpu_layers(
    free_mib: u64,
    total_mib: u64,
    model_bytes: u64,
    shape: &ModelShape,
    ctx: u64,
) -> u32 {
    let weights_mib = model_bytes as f64 / MIB;
    let kv_mib = kv_cache_mib(shape, ctx, weights_mib);

    // Compute buffers grow with the context; the driver, the desktop and
    // other apps keep a slice of VRAM that "free" does not always reflect.
    let reserve_mib = 512.0 + 0.06 * total_mib as f64 + 0.04 * ctx as f64;
    let budget_mib = free_mib as f64 - reserve_mib;
    if budget_mib <= 0.0 {
        return 0;
    }

    let blocks = shape.block_count;
    let needed_mib = weights_mib + kv_mib;

    if needed_mib <= budget_mib {
        return if blocks > 0 { blocks + 1 } else { ALL_LAYERS };
    }
    if blocks == 0 {
        // Unknown depth: a partial count cannot be sized safely.
        return 0;
    }

    // The per-block share includes the output layer's weights, which stay
    // on the CPU in a partial offload, so this errs on the small side.
    let per_block_mib = needed_mib / blocks as f64;
    ((budget_mib / per_block_mib).floor() as u32).min(blocks)
}

/// Why auto offload resolved the way it did, for the app log.
#[derive(Debug, PartialEq)]
pub enum AutoLayers {
    /// Pass this count to `--gpu-layers`.
    Count(u32),
    /// Keep llama.cpp's own default (`-1`), as before this module existed:
    /// no usable device was listed, or the runtime could not be probed.
    LlamaDefault,
}

/// The runtime ships a GPU backend, but it found no device. For CUDA this
/// is the missing `cudart`/`cuBLAS` DLLs (shipped as a separate archive) or
/// an NVIDIA driver too old for CUDA 12.
pub const CUDA_NO_DEVICE_ERROR: &str = "The NVIDIA CUDA runtime found no usable GPU, so the AI would run on the CPU only. Its CUDA libraries are probably missing: re-download the NVIDIA CUDA runtime in Settings > AI, update the NVIDIA driver, or switch the runtime to Vulkan.";

/// Resolves "auto" for one request.
pub fn resolve_auto(
    runtime: &str,
    runtime_path: &Path,
    model_dir: &Path,
    model_path: &Path,
    ctx_size: Option<u64>,
) -> Result<AutoLayers, String> {
    // Metal builds already treat -1 as "all layers" on unified memory.
    if cfg!(target_os = "macos") {
        return Ok(AutoLayers::LlamaDefault);
    }

    let output = match crate::llm::llama_command(runtime_path)
        .arg("--list-devices")
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            eprintln!("[llm] could not list devices for auto offload: {e}");
            return Ok(AutoLayers::LlamaDefault);
        }
    };

    let devices = parse_devices(&String::from_utf8_lossy(&output.stdout));
    if devices.is_empty() {
        if runtime.to_lowercase().contains("cuda") {
            return Err(CUDA_NO_DEVICE_ERROR.to_string());
        }
        return Ok(AutoLayers::LlamaDefault);
    }

    // llama.cpp splits layers across every device it lists.
    let free_mib: u64 = devices.iter().map(|d| d.free_mib).sum();
    let total_mib: u64 = devices.iter().map(|d| d.total_mib).sum();
    let model_bytes = gguf_bytes(model_dir);
    let shape = gguf::read_model_shape(model_path);
    let ctx = ctx_size.filter(|c| *c > 0).unwrap_or(LLAMA_CLI_DEFAULT_CTX);

    let layers = plan_gpu_layers(free_mib, total_mib, model_bytes, &shape, ctx);
    eprintln!(
        "[llm] auto offload: {} layers ({} device(s), {free_mib} MiB free, model {} MiB, {} blocks, ctx {ctx})",
        layers,
        devices.len(),
        model_bytes / (1024 * 1024),
        shape.block_count,
    );

    Ok(AutoLayers::Count(layers))
}

/// Total size of every GGUF in a model folder (all shards of a split model).
fn gguf_bytes(model_dir: &Path) -> u64 {
    std::fs::read_dir(model_dir)
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .map(|ext| ext.eq_ignore_ascii_case("gguf"))
                        .unwrap_or(false)
                })
                .filter_map(|entry| entry.metadata().ok())
                .filter(|meta| meta.is_file())
                .map(|meta| meta.len())
                .sum()
        })
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const GIB: u64 = 1024 * 1024 * 1024;

    /// Qwen3-8B as its GGUF describes itself.
    fn qwen3_8b() -> ModelShape {
        ModelShape {
            block_count: 36,
            embedding_length: 4096,
            head_count: 32,
            head_count_kv: 8,
            key_length: 128,
            value_length: 128,
        }
    }

    #[test]
    fn parses_vulkan_device_list() {
        let out = "Available devices:\n  Vulkan0: NVIDIA GeForce RTX 4060 Laptop GPU (7957 MiB, 7957 MiB free)\n";
        assert_eq!(
            parse_devices(out),
            vec![Device {
                name: "Vulkan0".into(),
                total_mib: 7957,
                free_mib: 7957,
            }]
        );
    }

    #[test]
    fn parses_descriptions_with_parentheses_and_several_devices() {
        let out = "load_backend: loaded CUDA backend\nAvailable devices:\n  CUDA0: NVIDIA GeForce RTX 3090 (rev 1) (24576 MiB, 23000 MiB free)\n  CUDA1: NVIDIA RTX A2000 (6144 MiB, 6000 MiB free)\n";
        let devices = parse_devices(out);
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].name, "CUDA0");
        assert_eq!(devices[0].free_mib, 23000);
        assert_eq!(devices[1].total_mib, 6144);
    }

    #[test]
    fn a_backend_that_failed_to_load_lists_nothing() {
        // What the CUDA build prints without cudart64_12.dll next to it.
        let out = "Available devices:\n";
        assert!(parse_devices(out).is_empty());
        assert!(parse_devices("").is_empty());
    }

    #[test]
    fn qwen3_8b_q4_fits_entirely_on_an_8gb_card() {
        // 5.03 GB Q4_K_M, 8192 context, RTX 4060 Laptop via Vulkan.
        let layers = plan_gpu_layers(7957, 7957, 5_027_783_488, &qwen3_8b(), 8192);
        assert_eq!(layers, 37);
    }

    #[test]
    fn a_6gb_card_gets_a_partial_offload() {
        let layers = plan_gpu_layers(5900, 6144, 5_027_783_488, &qwen3_8b(), 8192);
        assert!(layers > 0 && layers < 36, "got {layers}");
    }

    #[test]
    fn a_tiny_card_stays_on_the_cpu() {
        assert_eq!(plan_gpu_layers(1024, 1024, 5 * GIB, &qwen3_8b(), 8192), 0);
        assert_eq!(plan_gpu_layers(0, 0, 5 * GIB, &qwen3_8b(), 4096), 0);
    }

    #[test]
    fn partial_offload_never_exceeds_the_budget() {
        let shape = qwen3_8b();
        let weights_mib = 5_027_783_488f64 / MIB;
        let kv_mib = kv_cache_mib(&shape, 8192, weights_mib);
        for free in (1000..8000).step_by(250) {
            let layers = plan_gpu_layers(free, free, 5_027_783_488, &shape, 8192);
            if layers <= shape.block_count {
                let used = layers as f64 * (weights_mib + kv_mib) / shape.block_count as f64;
                let reserve = 512.0 + 0.06 * free as f64 + 0.04 * 8192.0;
                assert!(used <= free as f64 - reserve + 1e-6, "free {free}: {layers} layers");
            }
        }
    }

    #[test]
    fn kv_cache_matches_llama_cpp_for_qwen3_8b() {
        // llama.cpp logs "KV self size = 1152.00 MiB" for ctx 8192.
        let kv = kv_cache_mib(&qwen3_8b(), 8192, 0.0);
        assert!((kv - 1152.0).abs() < 0.5, "got {kv}");
    }

    #[test]
    fn unknown_depth_offloads_all_or_nothing() {
        let unknown = ModelShape::default();
        assert_eq!(plan_gpu_layers(8000, 8000, GIB, &unknown, 4096), ALL_LAYERS);
        assert_eq!(plan_gpu_layers(4000, 4000, 5 * GIB, &unknown, 4096), 0);
    }
}
