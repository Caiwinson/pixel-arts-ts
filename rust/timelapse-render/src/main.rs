// ============================================================
//  timelapse-render
//  Replaces generateTimelapseVideo() in
//  src/bot/ui/interactions/closed.ts
//
//  Usage:
//    timelapse-render <output_path> < history.json
//
//  Reads canvas history rows as JSON from stdin, renders each
//  frame into a raw RGB buffer, and pipes the frames directly
//  into ffmpeg's stdin to produce an mp4 file.
//
//  The TypeScript side calls it like:
//    const proc = spawn("timelapse-render", [previewPath]);
//    proc.stdin.write(JSON.stringify(history));
//    proc.stdin.end();
// ============================================================

// Standard library imports
use std::env;
use std::io::{self, BufReader, Read, Write};
use std::process::{self, Command, Stdio};

// Third-party: serde_json lets us parse JSON from stdin
use serde::Deserialize;

// ============================================================
//  DATA TYPES
//  These mirror the CanvasHistoryRow interface in database.ts
// ============================================================

// `#[derive(Deserialize)]` automatically generates code to parse
// this struct from JSON. Without it we'd have to write the parsing
// manually. It's like TypeScript's `z.object({...})` in Zod.
//
// `#[allow(dead_code)]` silences warnings for fields we receive
// from JSON but don't use in the render logic.
#[derive(Deserialize)]
struct HistoryRow {
    // row_id isn't used in rendering but is part of the JSON payload
    #[allow(dead_code)]
    row_id: u32,

    // The canvas state: either a full hex string (is_delta=false)
    // or a delta string like "4:ff0000,12:ffffff" (is_delta=true)
    key: String,

    // Whether this row is a delta (partial update) or a full frame
    is_delta: bool,
}

// ============================================================
//  ENTRY POINT
// ============================================================

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        eprintln!("Usage: timelapse-render <output_path>");
        eprintln!("History JSON is read from stdin.");
        process::exit(1);
    }

    let output_path = &args[1];

    // ---- Read all of stdin into a String ----
    // The TypeScript side writes JSON.stringify(history) to our stdin.
    // We need to read it all before parsing.
    //
    // `BufReader` wraps stdin with buffering for efficiency.
    // `read_to_string` reads until EOF into a String.
    let mut input = String::new();
    BufReader::new(io::stdin())
        .read_to_string(&mut input)
        .unwrap_or_else(|e| {
            eprintln!("Failed to read stdin: {}", e);
            process::exit(1);
        });

    // ---- Parse JSON ----
    // `serde_json::from_str` is like JSON.parse().
    // The `: Vec<HistoryRow>` annotation tells serde what type to produce.
    let history: Vec<HistoryRow> = serde_json::from_str(&input).unwrap_or_else(|e| {
        eprintln!("Failed to parse history JSON: {}", e);
        process::exit(1);
    });

    if history.is_empty() {
        eprintln!("Error: history is empty");
        process::exit(1);
    }

    if let Err(e) = render(&history, output_path) {
        eprintln!("Render error: {}", e);
        process::exit(1);
    }
}

// ============================================================
//  RENDER
//  Mirrors generateTimelapseVideo() exactly
// ============================================================

fn render(history: &[HistoryRow], output_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    // Derive canvas size from the first full-frame key length.
    // Each pixel = 6 hex chars, so: size = sqrt(key.len() / 6)
    let first_full = history
        .iter()
        .find(|r| !r.is_delta)
        .ok_or("No full frame found in history")?;

    let size = (first_full.key.len() / 6) as f64;
    let size = size.sqrt() as usize;

    if size == 0 {
        return Err("Invalid canvas size derived from history".into());
    }

    // Mirror the TS video size logic:
    //   5×5  → 500px output
    //   rest → 750px output
    let video_size = if size == 5 { 500 } else { 750 };
    let scale = video_size / size;
    let width = video_size;
    let height = video_size;

    // ---- Precompute pixel map ----
    // For each canvas cell (px, py), store all the byte indices in the
    // flat RGB buffer that this cell covers.
    //
    // This avoids recomputing sx/sy/i for every cell on every frame.
    // In the TS version this was `pixelMap: number[][]`.
    //
    // `Vec<Vec<usize>>` = a Vec of Vecs of usize (like number[][] in TS).
    let mut pixel_map: Vec<Vec<usize>> = vec![Vec::new(); size * size];

    for py in 0..size {
        for px in 0..size {
            let mut indices = Vec::with_capacity(scale * scale);
            for oy in 0..scale {
                for ox in 0..scale {
                    let sx = px * scale + ox;
                    let sy = py * scale + oy;
                    let i = (sy * width + sx) * 3;
                    indices.push(i);
                }
            }
            pixel_map[py * size + px] = indices;
        }
    }

    // ---- Allocate the frame buffer ----
    // One flat Vec<u8> holding RGB bytes for the entire output frame.
    // Starts as all-black; we overwrite it per frame.
    let mut buffer: Vec<u8> = vec![0u8; width * height * 3];

    // `pixels` tracks the current hex colour of each canvas cell.
    // Starts all black, updated by full frames and deltas.
    // Each entry is 6 ASCII bytes ("rrggbb") stored as [u8; 6].
    let mut pixels: Vec<[u8; 6]> = vec![*b"000000"; size * size];

    // ---- Spawn ffmpeg ----
    // We pipe raw RGB frames into ffmpeg's stdin just like the TS version did.
    // `Command` is Rust's equivalent of Node's `spawn`.
    let mut ffmpeg = Command::new("ffmpeg")
        .args([
            "-y",                         // overwrite output file
            "-f", "rawvideo",             // input is raw pixels, no container
            "-pix_fmt", "rgb24",          // 3 bytes per pixel: R, G, B
            "-s", &format!("{}x{}", width, height),
            "-r", "1",                    // 1 frame per second (each row = 1 frame)
            "-i", "-",                    // read from stdin
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",        // required for broad player compatibility
            "-preset", "fast",
            "-crf", "18",                 // quality: lower = better, 18 is near-lossless
            output_path,
        ])
        // `Stdio::piped()` means we get a handle to write to ffmpeg's stdin.
        // This is equivalent to `ffmpeg.stdin` in Node's spawn.
        .stdin(Stdio::piped())
        .stdout(Stdio::null())  // suppress ffmpeg's stdout
        .stderr(Stdio::null())  // suppress ffmpeg's progress output
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}. Is ffmpeg installed?", e))?;

    // Unwrap the stdin handle. It's guaranteed to exist because we used Stdio::piped().
    // `as_mut()` gives us a mutable reference without consuming the Option.
    let ffmpeg_stdin = ffmpeg
        .stdin
        .as_mut()
        .ok_or("Failed to get ffmpeg stdin")?;

    // ---- Process each history row ----
    for row in history {
        let line = row.key.trim();
        if line.is_empty() {
            continue;
        }

        if !row.is_delta {
            // ---- Full frame ----
            // The key is the entire canvas state as one long hex string.
            // Split it into 6-char chunks, one per pixel.
            let key_bytes = line.as_bytes();

            if key_bytes.len() != size * size * 6 {
                // Skip malformed rows rather than crashing
                continue;
            }

            for i in 0..size * size {
                // Copy 6 bytes ("rrggbb") from the key into pixels[i]
                pixels[i].copy_from_slice(&key_bytes[i * 6..i * 6 + 6]);
            }

            // Render the full frame into the buffer
            render_full_frame(&pixels, &pixel_map, &mut buffer, size);
        } else {
            // ---- Delta frame ----
            // The key is a comma-separated list of "idx:rrggbb" entries.
            // Example: "4:ff0000,12:ffffff"
            for entry in line.split(',') {
                // Find the colon separating index from hex value
                let colon = match entry.find(':') {
                    Some(pos) => pos,
                    None => continue, // malformed entry, skip
                };

                let idx_str = &entry[..colon];
                let hex_str = &entry[colon + 1..];

                // Parse the pixel index
                let idx: usize = match idx_str.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                // Validate bounds and hex length
                if idx >= size * size || hex_str.len() != 6 {
                    continue;
                }

                // Update just this pixel's colour
                pixels[idx].copy_from_slice(hex_str.as_bytes());

                // Write only this one cell into the buffer (faster than full re-render)
                let hex = pixels[idx];
                let (r, g, b) = parse_hex_colour(&hex)?;
                write_cell_to_buffer(r, g, b, &pixel_map[idx], &mut buffer);
            }
        }

        // Write the current frame to ffmpeg.
        // `write_all` ensures all bytes are written even if the OS does it in chunks.
        ffmpeg_stdin.write_all(&buffer)?;
    }

    // Drop stdin to signal EOF to ffmpeg (it will then finish encoding)
    // Dropping the handle closes the pipe — ffmpeg sees EOF and finalises the file.
    drop(ffmpeg.stdin.take());

    // Wait for ffmpeg to finish and check its exit code
    let status = ffmpeg.wait()?;
    if !status.success() {
        return Err(format!(
            "ffmpeg exited with code {}",
            status.code().unwrap_or(-1)
        )
        .into());
    }

    Ok(())
}

// ============================================================
//  HELPERS
// ============================================================

/// Render every pixel cell into the output buffer.
/// Called when we have a full frame (is_delta = false).
fn render_full_frame(
    pixels: &[[u8; 6]],
    pixel_map: &[Vec<usize>],
    buffer: &mut [u8],
    size: usize,
) {
    for py in 0..size {
        for px in 0..size {
            let cell_idx = py * size + px;
            // We can't use ? inside a void function, so we ignore parse errors
            // on individual pixels (they'd just render as black).
            if let Ok((r, g, b)) = parse_hex_colour(&pixels[cell_idx]) {
                write_cell_to_buffer(r, g, b, &pixel_map[cell_idx], buffer);
            }
        }
    }
}

/// Write a single colour into all buffer positions covered by one canvas cell.
/// `indices` is the precomputed list of byte offsets for this cell.
#[inline]
fn write_cell_to_buffer(r: u8, g: u8, b: u8, indices: &[usize], buffer: &mut [u8]) {
    for &i in indices {
        buffer[i]     = r;
        buffer[i + 1] = g;
        buffer[i + 2] = b;
    }
}

/// Parse a 6-byte ASCII hex colour like b"ff0000" into (r, g, b).
/// Uses the same lookup-table approach as pixel-render for speed.
#[inline]
fn parse_hex_colour(hex: &[u8; 6]) -> Result<(u8, u8, u8), String> {
    let r = parse_hex_byte(hex[0], hex[1])?;
    let g = parse_hex_byte(hex[2], hex[3])?;
    let b = parse_hex_byte(hex[4], hex[5])?;
    Ok((r, g, b))
}

/// Convert two ASCII hex characters into one byte value.
/// Same compile-time lookup table as pixel-render.
#[inline]
fn parse_hex_byte(hi: u8, lo: u8) -> Result<u8, String> {
    static HEX_TABLE: [u8; 256] = {
        let mut table = [255u8; 256];
        let mut i = 0u8;
        while i < 10 {
            table[(b'0' + i) as usize] = i;
            i += 1;
        }
        i = 0;
        while i < 6 {
            table[(b'a' + i) as usize] = 10 + i;
            i += 1;
        }
        i = 0;
        while i < 6 {
            table[(b'A' + i) as usize] = 10 + i;
            i += 1;
        }
        table
    };

    let high = HEX_TABLE[hi as usize];
    let low  = HEX_TABLE[lo as usize];

    if high == 255 || low == 255 {
        return Err(format!("Invalid hex chars: '{}' '{}'", hi as char, lo as char));
    }

    Ok((high << 4) | low)
}

// ============================================================
//  TESTS
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_byte() {
        assert_eq!(parse_hex_byte(b'f', b'f').unwrap(), 255);
        assert_eq!(parse_hex_byte(b'0', b'0').unwrap(), 0);
        assert_eq!(parse_hex_byte(b'f', b'0').unwrap(), 240);
        assert!(parse_hex_byte(b'z', b'0').is_err());
    }

    #[test]
    fn test_parse_hex_colour() {
        assert_eq!(parse_hex_colour(b"ff0000").unwrap(), (255, 0, 0));
        assert_eq!(parse_hex_colour(b"ffffff").unwrap(), (255, 255, 255));
        assert_eq!(parse_hex_colour(b"000000").unwrap(), (0, 0, 0));
        assert_eq!(parse_hex_colour(b"1a2b3c").unwrap(), (0x1a, 0x2b, 0x3c));
    }

    #[test]
    fn test_empty_history_fails() {
        let history: Vec<HistoryRow> = vec![];
        assert!(render(&history, "/tmp/test.mp4").is_err());
    }

    #[test]
    fn test_pixel_map_coverage() {
        // For a 5×5 canvas at scale 100, each cell should cover 100*100 = 10000 indices
        let size = 5;
        let video_size = 500;
        let scale = video_size / size;
        let width = video_size;

        let mut pixel_map: Vec<Vec<usize>> = vec![Vec::new(); size * size];
        for py in 0..size {
            for px in 0..size {
                let mut indices = Vec::new();
                for oy in 0..scale {
                    for ox in 0..scale {
                        let sx = px * scale + ox;
                        let sy = py * scale + oy;
                        indices.push((sy * width + sx) * 3);
                    }
                }
                pixel_map[py * size + px] = indices;
            }
        }

        // Every cell should have scale*scale entries
        for cell in &pixel_map {
            assert_eq!(cell.len(), scale * scale);
        }

        // Total unique indices = all pixels in the frame
        let all_indices: std::collections::HashSet<usize> =
            pixel_map.iter().flatten().copied().collect();
        assert_eq!(all_indices.len(), width * video_size); // width * height
    }
}