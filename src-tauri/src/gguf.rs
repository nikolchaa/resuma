use serde::Serialize;
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

/// Reads little-endian scalars while walking GGUF metadata.
struct Reader<R: Read> {
    inner: R,
}

impl<R: Read> Reader<R> {
    fn new(inner: R) -> Self {
        Self { inner }
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        let mut buf = [0u8; 1];
        self.inner
            .read_exact(&mut buf)
            .map_err(|e| format!("GGUF truncated: {e}"))?;
        Ok(buf[0])
    }

    /// Skips `n` bytes on disk without buffering them.
    fn skip(&mut self, n: u64) -> Result<(), String> {
        std::io::copy(
            &mut self.inner.by_ref().take(n),
            &mut std::io::sink(),
        )
        .map_err(|e| format!("GGUF truncated: {e}"))?;
        Ok(())
    }

    fn read_scalar_u32(&mut self) -> Result<u32, String> {
        let mut buf = [0u8; 4];
        self.inner
            .read_exact(&mut buf)
            .map_err(|e| format!("GGUF truncated: {e}"))?;
        Ok(u32::from_le_bytes(buf))
    }

    fn read_scalar_u64(&mut self) -> Result<u64, String> {
        let mut buf = [0u8; 8];
        self.inner
            .read_exact(&mut buf)
            .map_err(|e| format!("GGUF truncated: {e}"))?;
        Ok(u64::from_le_bytes(buf))
    }

    fn read_scalar_u16(&mut self) -> Result<u16, String> {
        let mut buf = [0u8; 2];
        self.inner
            .read_exact(&mut buf)
            .map_err(|e| format!("GGUF truncated: {e}"))?;
        Ok(u16::from_le_bytes(buf))
    }
}

/// GGUF metadata value types, matching the canonical enum in gguf.cpp:
/// UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT32, BOOL, STRING, ARRAY,
/// UINT64 (10), INT64 (11), FLOAT64 (12).
#[derive(Debug, Clone, Copy, PartialEq)]
enum ValueType {
    U8,
    I8,
    U16,
    I16,
    U32,
    I32,
    F32,
    Bool,
    Str,
    Arr,
    U64,
    I64,
    F64,
}

fn parse_value_type(raw: u32) -> Result<ValueType, String> {
    Ok(match raw {
        0 => ValueType::U8,
        1 => ValueType::I8,
        2 => ValueType::U16,
        3 => ValueType::I16,
        4 => ValueType::U32,
        5 => ValueType::I32,
        6 => ValueType::F32,
        7 => ValueType::Bool,
        8 => ValueType::Str,
        9 => ValueType::Arr,
        10 => ValueType::U64,
        11 => ValueType::I64,
        12 => ValueType::F64,
        other => return Err(format!("Unknown GGUF value type {other}")),
    })
}

/// All GGUF versions >= 2 store string lengths and pair counts as u64; only
/// the abandoned v1 used u32. llama.cpp itself refuses v1 now, but staying
/// tolerant costs nothing.
fn read_string<R: Read>(
    reader: &mut Reader<R>,
    v1_counts: bool,
) -> Result<String, String> {
    let len = if v1_counts {
        reader.read_scalar_u32()? as u64
    } else {
        reader.read_scalar_u64()?
    };

    // Keys/values are tiny; anything absurd means corruption or a bad walk.
    if len > 1024 * 1024 {
        return Err("Unreasonable GGUF string length".to_string());
    }

    let mut buf = vec![0u8; len as usize];
    reader
        .inner
        .read_exact(&mut buf)
        .map_err(|e| format!("GGUF truncated: {e}"))?;
    String::from_utf8(buf).map_err(|_| "Invalid UTF-8 in GGUF string".to_string())
}

fn skip_value<R: Read>(
    reader: &mut Reader<R>,
    value_type: ValueType,
    v1_counts: bool,
    depth: u8,
) -> Result<(), String> {
    if depth > 4 {
        return Err("GGUF arrays nested too deeply".to_string());
    }

    match value_type {
        ValueType::U8 | ValueType::I8 | ValueType::Bool => reader.skip(1),
        ValueType::U16 | ValueType::I16 => reader.skip(2),
        ValueType::U32 | ValueType::I32 | ValueType::F32 => reader.skip(4),
        ValueType::U64 | ValueType::I64 | ValueType::F64 => reader.skip(8),
        ValueType::Str => read_string(reader, v1_counts).map(|_| ()),
        ValueType::Arr => {
            let elem_raw = reader.read_scalar_u32()?;
            let elem = parse_value_type(elem_raw)?;
            let count = if v1_counts {
                reader.read_scalar_u32()? as u64
            } else {
                reader.read_scalar_u64()?
            };
            for _ in 0..count {
                skip_value(reader, elem, v1_counts, depth + 1)?;
            }
            Ok(())
        }
    }
}

/// Decodes block_count candidates; every writer emits unsigned small ints, but
/// signed variants are accepted defensively. Float/string/array tags never
/// carry this metric and are rejected rather than guessed at.
fn decode_block_count<R: Read>(
    reader: &mut Reader<R>,
    value_type: ValueType,
) -> Result<Option<u32>, String> {
    let out = match value_type {
        ValueType::U8 => Some(reader.read_u8()? as u32),
        ValueType::I8 => Some(reader.read_u8()? as i8 as i32 as u32),
        ValueType::U16 => Some(reader.read_scalar_u16()? as u32),
        ValueType::I16 => Some(reader.read_scalar_u16()? as i16 as i32 as u32),
        ValueType::U32 | ValueType::I32 => Some(reader.read_scalar_u32()?),
        ValueType::U64 | ValueType::I64 => Some(reader.read_scalar_u64()? as u32),
        _ => None,
    };
    Ok(out)
}

/// What one installed GGUF declares about its depth.
///
/// `block_count` includes everything llama.cpp builds as `blk.N` tensors -
/// hybrid models ship their Multi-Token-Prediction draft module as an extra
/// final block (Qwen3.5/3.8-family files read 33 for what HF metadata calls
/// 32 layers), so gpu-layers targeting should follow this number verbatim.
/// `nextn_layers` isolates the MTP part so the UI can annotate it.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerInfo {
    pub block_count: u32,
    pub nextn_layers: u32,
}

impl Default for LayerInfo {
    fn default() -> Self {
        Self {
            block_count: 0,
            nextn_layers: 0,
        }
    }
}

/// Walks the KV section collecting `.block_count` and
/// `.nextn_predictive_layers`. Returns zeroed info when the stream cannot be
/// parsed; the fallible core is exposed for tests so desyncs are diagnosable
/// instead of silently reading as zero.
pub fn extract_layer_info<R: Read>(inner: R) -> LayerInfo {
    parse_layer_info(inner).unwrap_or_default()
}

/// Loadable depth for consumers that only care about the total block count.
pub fn extract_layer_count<R: Read>(inner: R) -> u32 {
    parse_layer_info(inner)
        .map(|info| info.block_count)
        .unwrap_or(0)
}

fn parse_layer_info<R: Read>(inner: R) -> Result<LayerInfo, String> {
    let mut reader = Reader::new(inner);

    let mut magic = [0u8; 4];
    reader.inner.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if &magic != b"GGUF" {
        return Err("Bad GGUF magic".to_string());
    }

    let version = reader.read_scalar_u32()?;
    if !(1..=3).contains(&version) {
        return Err(format!("Unsupported GGUF version {version}"));
    }
    let v1_counts = version == 1;

    let tensor_count = if v1_counts {
        reader.read_scalar_u32()? as u64
    } else {
        reader.read_scalar_u64()?
    };
    // Corrupt tensor counts would send the walk nowhere useful regardless -
    // every real model stays far below this.
    if tensor_count > 100_000 {
        return Err(format!("Implausible tensor count {tensor_count}"));
    }

    let kv_count = if v1_counts {
        reader.read_scalar_u32()? as u64
    } else {
        reader.read_scalar_u64()?
    };
    if kv_count > 10_000 {
        return Err(format!("Implausible kv count {kv_count}"));
    }

    let mut info = LayerInfo::default();

    for index in 0..kv_count {
        let key = read_string(&mut reader, v1_counts)
            .map_err(|e| format!("kv[{index}] key: {e}"))?;

        let raw_type = reader
            .read_scalar_u32()
            .map_err(|e| format!("kv[{index}] type: {e}"))?;
        let value_type =
            parse_value_type(raw_type).map_err(|e| format!("kv[{index}]: {e}"))?;

        let want_block = key.ends_with(".block_count");

        // Exporters disagree on the metric's spelling ("predict" vs
        // "predictive"); hybrid models use nextn for their MTP draft module.
        let want_nextn =
            key.ends_with(".nextn_predict_layers") || key.ends_with(".nextn_predictive_layers");

        if want_block || want_nextn {
            // Consumes exactly this KV's value bytes, keeping the walk in
            // sync whether or not we store the result.
            let value = decode_block_count(&mut reader, value_type)?
                .ok_or_else(|| format!("Non-integer value for '{key}'"))?;

            if want_block && info.block_count == 0 {
                info.block_count = value;
            } else if want_nextn {
                info.nextn_layers = value;
            }
            // Keep walking either way - the other metric may sit further
            // down the list (converters do not guarantee ordering).
        } else {
            skip_value(&mut reader, value_type, v1_counts, 0)
                .map_err(|e| format!("kv[{index}] '{key}' value: {e}"))?;
        }

        if info.block_count > 0 && info.nextn_layers > 0 {
            break;
        }
    }

    Ok(info)
}

fn extract_layer_info_from_file(path: &Path) -> LayerInfo {
    match File::open(path) {
        Ok(file) => extract_layer_info(BufReader::with_capacity(256 * 1024, file)),
        Err(_) => LayerInfo::default(),
    }
}

/// Lexicographically-first `.gguf` inside a model folder - the same pick the
/// llama.cpp loader makes, so shard one supplies the metadata for shard sets.
fn first_gguf(model_dir: &Path) -> Option<PathBuf> {
    let mut ggufs: Vec<PathBuf> = std::fs::read_dir(model_dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("gguf"))
                    .unwrap_or(false)
        })
        .collect();

    ggufs.sort();
    ggufs.into_iter().next()
}

/// Tauri command: depth metrics of an installed model, used by the UI to
/// clamp and auto-fill `--gpu-layers` and to annotate MTP-bearing models.
/// `blockCount == 0` means unknown / unreadable - never a legitimate count.
#[tauri::command]
pub async fn asset_model_layers(asset_name: String) -> Result<LayerInfo, String> {
    let base_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to find data directory".to_string())?
        .join("com.resuma.app")
        .join("models")
        .join(asset_name);

    let Some(gguf_path) = first_gguf(&base_dir) else {
        return Ok(LayerInfo::default());
    };

    Ok(extract_layer_info_from_file(&gguf_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn put_string(buf: &mut Vec<u8>, s: &str) {
        buf.extend_from_slice(&(s.len() as u64).to_le_bytes());
        buf.extend_from_slice(s.as_bytes());
    }

    fn header(version: u32, tensors: u64, kvs: u64) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(b"GGUF");
        buf.extend_from_slice(&version.to_le_bytes());
        buf.extend_from_slice(&tensors.to_le_bytes());
        buf.extend_from_slice(&kvs.to_le_bytes());
        buf
    }

    #[test]
    fn finds_block_count_after_mixed_keys() {
        let mut buf = header(3, 1, 5);

        // architecture string comes first, as in every real file
        put_string(&mut buf, "general.architecture");
        buf.extend_from_slice(&8u32.to_le_bytes()); // STRING
        put_string(&mut buf, "qwen3");

        // string array (tokenizer vocab style)
        put_string(&mut buf, "tokenizer.ggml.tokens");
        buf.extend_from_slice(&9u32.to_le_bytes()); // ARRAY
        buf.extend_from_slice(&8u32.to_le_bytes()); // elem STRING
        buf.extend_from_slice(&2u64.to_le_bytes()); // 2 elements
        put_string(&mut buf, "<unk>");
        put_string(&mut buf, "<s>");

        // f32 array
        put_string(&mut buf, "rope.freq_base");
        buf.extend_from_slice(&9u32.to_le_bytes()); // ARRAY
        buf.extend_from_slice(&6u32.to_le_bytes()); // elem FLOAT32
        buf.extend_from_slice(&3u64.to_le_bytes());
        buf.extend_from_slice(&1234567f32.to_le_bytes());
        buf.extend_from_slice(&89f32.to_le_bytes());
        buf.extend_from_slice(&101112f32.to_le_bytes());

        // int64 scalar between us and the target
        put_string(&mut buf, "other.value");
        buf.extend_from_slice(&11u32.to_le_bytes()); // INT64
        buf.extend_from_slice(&(-42i64).to_le_bytes());

        // the target key
        put_string(&mut buf, "qwen3.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes()); // UINT32
        buf.extend_from_slice(&36u32.to_le_bytes());

        assert_eq!(extract_layer_count(Cursor::new(buf)), 36);
    }

    #[test]
    fn accepts_signed_and_wide_int_tags_for_block_count() {
        // INT64-tagged (tag 11), appearing before any other key
        let mut buf = header(3, 0, 1);
        put_string(&mut buf, "llama.block_count");
        buf.extend_from_slice(&11u32.to_le_bytes());
        buf.extend_from_slice(&40i64.to_le_bytes());
        assert_eq!(extract_layer_count(Cursor::new(buf)), 40);

        // UINT16-tagged (tag 2)
        let mut buf = header(3, 0, 1);
        put_string(&mut buf, "tiny.block_count");
        buf.extend_from_slice(&2u32.to_le_bytes());
        buf.extend_from_slice(&28u16.to_le_bytes());
        assert_eq!(extract_layer_count(Cursor::new(buf)), 28);
    }

    #[test]
    fn missing_key_yields_zero() {
        let mut buf = header(3, 0, 1);
        put_string(&mut buf, "general.name");
        buf.extend_from_slice(&8u32.to_le_bytes());
        put_string(&mut buf, "Some Model");
        assert_eq!(extract_layer_count(Cursor::new(buf)), 0);
    }

    #[test]
    fn bad_magic_yields_zero() {
        let mut buf = b"GGMF".to_vec();
        buf.extend_from_slice(&3u32.to_le_bytes());
        buf.extend_from_slice(&0u64.to_le_bytes());
        buf.extend_from_slice(&0u64.to_le_bytes());
        assert_eq!(extract_layer_count(Cursor::new(buf)), 0);
    }

    #[test]
    fn v2_reads_like_v3() {
        let mut buf = header(2, 0, 1);
        put_string(&mut buf, "x.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&14u32.to_le_bytes());
        assert_eq!(extract_layer_count(Cursor::new(buf)), 14);
    }

    /// Hybrid MTP models (Qwen3.5/3.8 family) declare the draft module as an
    /// extra decoder block: HF says 32 layers, GGUF says block_count 33 with
    /// nextn_predictive_layers 1. Key order must not matter.
    /// Reproduces a real hybrid-Mamba GGUF header (Qwen3.8-9B): the draft
    /// metric is spelled `.nextn_predict_layers`, and block_count arrives
    /// first. Regression guard for key-name guessing.
    #[test]
    fn reads_actual_nextn_predict_layers_key() {
        let mut buf = header(3, 0, 3);

        put_string(&mut buf, "qwen35.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&33u32.to_le_bytes());

        put_string(&mut buf, "qwen35.nextn_predict_layers");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());

        // A pair we do not care about must be skipped cleanly after capture.
        put_string(&mut buf, "qwen35.full_attention_interval");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&4u32.to_le_bytes());

        let info = parse_layer_info(Cursor::new(buf)).unwrap();
        assert_eq!(info.block_count, 33);
        assert_eq!(info.nextn_layers, 1);
    }

    #[test]
    fn nextn_layers_are_reported_regardless_of_key_order() {
        // nextn BEFORE block_count
        let mut buf = header(3, 0, 2);
        put_string(&mut buf, "qwen35.nextn_predictive_layers");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        put_string(&mut buf, "qwen35.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&33u32.to_le_bytes());

        let info = parse_layer_info(Cursor::new(buf)).unwrap();
        assert_eq!(info.block_count, 33);
        assert_eq!(info.nextn_layers, 1);

        // nextn AFTER block_count - the loop must keep walking
        let mut buf = header(3, 0, 3);
        put_string(&mut buf, "general.name");
        buf.extend_from_slice(&8u32.to_le_bytes()); // STRING value first...
        put_string(&mut buf, "Qwen3.8");            // ...so this stays in sync
        put_string(&mut buf, "qwen35.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&33u32.to_le_bytes());
        put_string(&mut buf, "qwen35.nextn_predictive_layers");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());

        let info = parse_layer_info(Cursor::new(buf)).unwrap();
        assert_eq!(info.block_count, 33);
        assert_eq!(info.nextn_layers, 1);

        // The public wrapper still reports the loadable depth.
        let mut buf = header(3, 0, 2);
        put_string(&mut buf, "m.block_count");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&7u32.to_le_bytes());
        put_string(&mut buf, "m.nextn_predictive_layers");
        buf.extend_from_slice(&4u32.to_le_bytes());
        buf.extend_from_slice(&1u32.to_le_bytes());
        assert_eq!(extract_layer_count(Cursor::new(buf)), 7);
    }
}
