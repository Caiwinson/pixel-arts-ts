// Replaces generateTimelapseVideo() in src/bot/ui/interactions/closed.ts
use std::env;
use std::io::{self, BufReader, Read, Write};
use std::process::{self, Command, Stdio};
use serde::Deserialize;

#[derive(Deserialize)]
struct HistoryRow {
    #[allow(dead_code)]
    row_id: u32,
    key: String,
    is_delta: bool,
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        eprintln!("Usage: timelapse-render <output_path>");
        process::exit(1);
    }

    let output_path = &args[1];

    let mut input = String::new();
    BufReader::new(io::stdin())
        .read_to_string(&mut input)
        .unwrap_or_else(|e| {
            eprintln!("Failed to read stdin: {}", e);
            process::exit(1);
        });

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

fn render(history: &[HistoryRow], output_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let first_full = history
        .iter()
        .find(|r| !r.is_delta)
        .ok_or("No full frame found in history")?;

    let size = (first_full.key.len() / 6) as f64;
    let size = size.sqrt() as usize;

    if size == 0 {
        return Err("Invalid canvas size derived from history".into());
    }

    let video_size = if size == 5 { 500 } else { 750 };
    let scale = video_size / size;
    let width = video_size;
    let height = video_size;

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

    let mut buffer: Vec<u8> = vec![0u8; width * height * 3];
    let mut pixels: Vec<[u8; 6]> = vec![*b"000000"; size * size];

    let mut ffmpeg = Command::new("ffmpeg")
        .args([
            "-y",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", &format!("{}x{}", width, height),
            "-r", "1",
            "-i", "-",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "18",
            output_path,
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn ffmpeg: {}. Is ffmpeg installed?", e))?;

    let ffmpeg_stdin = ffmpeg
        .stdin
        .as_mut()
        .ok_or("Failed to get ffmpeg stdin")?;

    for row in history {
        let line = row.key.trim();
        if line.is_empty() {
            continue;
        }

        if !row.is_delta {
            let key_bytes = line.as_bytes();

            if key_bytes.len() != size * size * 6 {
                continue;
            }

            for i in 0..size * size {
                pixels[i].copy_from_slice(&key_bytes[i * 6..i * 6 + 6]);
            }

            render_full_frame(&pixels, &pixel_map, &mut buffer, size);
        } else {
            for entry in line.split(',') {
                let colon = match entry.find(':') {
                    Some(pos) => pos,
                    None => continue,
                };

                let idx_str = &entry[..colon];
                let hex_str = &entry[colon + 1..];

                let idx: usize = match idx_str.parse() {
                    Ok(v) => v,
                    Err(_) => continue,
                };

                if idx >= size * size || hex_str.len() != 6 {
                    continue;
                }

                pixels[idx].copy_from_slice(hex_str.as_bytes());

                let hex = pixels[idx];
                let (r, g, b) = parse_hex_colour(&hex)?;
                write_cell_to_buffer(r, g, b, &pixel_map[idx], &mut buffer);
            }
        }

        ffmpeg_stdin.write_all(&buffer)?;
    }

    drop(ffmpeg.stdin.take());

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

fn render_full_frame(
    pixels: &[[u8; 6]],
    pixel_map: &[Vec<usize>],
    buffer: &mut [u8],
    size: usize,
) {
    for py in 0..size {
        for px in 0..size {
            let cell_idx = py * size + px;
            if let Ok((r, g, b)) = parse_hex_colour(&pixels[cell_idx]) {
                write_cell_to_buffer(r, g, b, &pixel_map[cell_idx], buffer);
            }
        }
    }
}

#[inline]
fn write_cell_to_buffer(r: u8, g: u8, b: u8, indices: &[usize], buffer: &mut [u8]) {
    for &i in indices {
        buffer[i]     = r;
        buffer[i + 1] = g;
        buffer[i + 2] = b;
    }
}

#[inline]
fn parse_hex_colour(hex: &[u8; 6]) -> Result<(u8, u8, u8), String> {
    let r = parse_hex_byte(hex[0], hex[1])?;
    let g = parse_hex_byte(hex[2], hex[3])?;
    let b = parse_hex_byte(hex[4], hex[5])?;
    Ok((r, g, b))
}

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

        let all_indices: std::collections::HashSet<usize> =
            pixel_map.iter().flatten().copied().collect();
        assert_eq!(all_indices.len(), width * video_size);
    }
}