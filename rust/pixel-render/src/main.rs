// Replaces hexStringToCanvas() in src/web/services/image.ts
use std::env;
use std::io;
use std::process;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 3 {
        eprintln!("Usage: pixel-render <hex_code> <size>");
        process::exit(1);
    }

    let hex_code = &args[1];
    let size: usize = args[2].parse().unwrap_or_else(|_| {
        eprintln!("Error: size must be a number, got '{}'", args[2]);
        process::exit(1);
    });

    if !matches!(size, 5 | 10 | 15 | 20 | 25) {
        eprintln!("Error: size must be 5, 10, 15, 20, or 25. Got {}", size);
        process::exit(1);
    }

    if let Err(e) = render(hex_code, size) {
        eprintln!("Render error: {}", e);
        process::exit(1);
    }
}

fn render(hex_code: &str, size: usize) -> Result<(), Box<dyn std::error::Error>> {
    let expected_len = size * size * 6;
    if hex_code.len() != expected_len {
        return Err(format!(
            "hex_code length {} doesn't match expected {} for size {}",
            hex_code.len(),
            expected_len,
            size
        ).into());
    }

    let scale = if size == 5 { 100 } else { 50 };
    let dim = size * scale;
    let mut pixels: Vec<u8> = vec![0xFF; dim * dim * 3];
    let hex_bytes = hex_code.as_bytes();

    for py in 0..size {
        for px in 0..size {
            let hex_offset = (py * size + px) * 6;

            let r = parse_hex_byte(hex_bytes[hex_offset],     hex_bytes[hex_offset + 1])?;
            let g = parse_hex_byte(hex_bytes[hex_offset + 2], hex_bytes[hex_offset + 3])?;
            let b = parse_hex_byte(hex_bytes[hex_offset + 4], hex_bytes[hex_offset + 5])?;

            for oy in 0..scale {
                for ox in 0..scale {
                    let sx = px * scale + ox;
                    let sy = py * scale + oy;
                    let i = (sy * dim + sx) * 3;

                    pixels[i]     = r;
                    pixels[i + 1] = g;
                    pixels[i + 2] = b;
                }
            }
        }
    }

    let stdout = io::stdout();
    let writer = io::BufWriter::new(stdout.lock());
    let mut encoder = png::Encoder::new(writer, dim as u32, dim as u32);

    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Best);
    encoder.set_filter(png::FilterType::Sub);

    let mut png_writer = encoder.write_header()?;
    png_writer.write_image_data(&pixels)?;

    Ok(())
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
        return Err(format!(
            "Invalid hex characters: '{}' '{}'",
            hi as char,
            lo as char
        ));
    }

    Ok((high << 4) | low)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hex_byte_valid() {
        assert_eq!(parse_hex_byte(b'f', b'f').unwrap(), 255);
        assert_eq!(parse_hex_byte(b'0', b'0').unwrap(), 0);
        assert_eq!(parse_hex_byte(b'a', b'b').unwrap(), 0xAB);
        assert_eq!(parse_hex_byte(b'F', b'F').unwrap(), 255);
    }

    #[test]
    fn test_parse_hex_byte_invalid() {
        assert!(parse_hex_byte(b'z', b'0').is_err());
        assert!(parse_hex_byte(b'0', b'!').is_err());
    }

    #[test]
    fn test_render_produces_output() {
        let hex = "ff0000".repeat(25);
        assert!(render(&hex, 5).is_ok());
    }

    #[test]
    fn test_render_rejects_wrong_length() {
        assert!(render("ff0000", 5).is_err());
    }
}