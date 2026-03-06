// ============================================================
//  pixel-render
//  Replaces hexStringToCanvas() in src/web/services/image.ts
//
//  Usage:
//    pixel-render <hex_code> <size>
//
//  It reads a hex string like "ff0000ffffff00ff00..." and a canvas
//  size (5, 10, 15, 20, or 25), then writes a PNG to stdout.
//
//  The TypeScript side calls it like this:
//    const proc = spawn("pixel-render", [code, String(size)]);
//    proc.stdout  →  PNG bytes (pipe straight to response or cache)
// ============================================================

// `use` is like `import` in TypeScript.
// `std::env`    → reading command-line arguments
// `std::io`     → writing bytes to stdout
// `std::process`→ exiting with an error code
use std::env;
use std::io;
use std::process;

// ============================================================
//  ENTRY POINT
// ============================================================

fn main() {
    // `env::args()` gives us an iterator over CLI arguments.
    // `.collect::<Vec<String>>()` turns it into a Vec (like an array).
    //
    // args[0] is always the program name itself, so:
    //   args[1] = hex code
    //   args[2] = size
    let args: Vec<String> = env::args().collect();

    if args.len() != 3 {
        // `eprintln!` prints to stderr (not stdout), so it won't corrupt
        // the PNG bytes we write to stdout.
        eprintln!("Usage: pixel-render <hex_code> <size>");
        eprintln!("Example: pixel-render ff0000ffffff... 5");
        process::exit(1);
    }

    let hex_code = &args[1];
    // `.parse::<usize>()` converts a string to a number.
    // `.unwrap_or_else(|_| ...)` means "if parsing fails, run this closure".
    let size: usize = args[2].parse().unwrap_or_else(|_| {
        eprintln!("Error: size must be a number, got '{}'", args[2]);
        process::exit(1);
    });

    // Validate size — only 5, 10, 15, 20, 25 are valid canvas sizes.
    if !matches!(size, 5 | 10 | 15 | 20 | 25) {
        eprintln!("Error: size must be 5, 10, 15, 20, or 25. Got {}", size);
        process::exit(1);
    }

    // Run the render. If it returns an error, print it and exit.
    if let Err(e) = render(hex_code, size) {
        eprintln!("Render error: {}", e);
        process::exit(1);
    }
}

// ============================================================
//  RENDER FUNCTION
//  This is the Rust equivalent of hexStringToCanvas() in image.ts
// ============================================================

// `-> Result<(), Box<dyn std::error::Error>>`
// Means: this function either succeeds (returning nothing useful, i.e. `()`)
// or returns any kind of error. This is Rust's way of handling errors
// without exceptions — callers must check the result.
fn render(hex_code: &str, size: usize) -> Result<(), Box<dyn std::error::Error>> {
    // Validate length here (not just in main) so tests and library callers
    // get a clean Err instead of an index-out-of-bounds panic.
    let expected_len = size * size * 6;
    if hex_code.len() != expected_len {
        // `.into()` converts String → Box<dyn Error>
        return Err(format!(
            "hex_code length {} doesn't match expected {} for size {}",
            hex_code.len(),
            expected_len,
            size
        ).into());
    }

    // Mirror the TypeScript scale logic exactly:
    //   size 5  → 100px per cell → 500×500 image
    //   others  →  50px per cell → 500/750/1000/1250
    let scale = if size == 5 { 100 } else { 50 };
    let dim = size * scale; // total image width and height in pixels

    // Allocate a flat buffer for all pixels in RGB format.
    //
    // `vec![value; count]` creates a Vec filled with `value` repeated `count` times.
    // `0xFF` = 255, so this fills everything with white (R=255, G=255, B=255).
    //
    // Why RGB and not RGBA? The PNG encoder will write an RGB PNG,
    // which is smaller and matches what the TS canvas produced
    // (it also drew a white background to strip alpha).
    //
    // Layout: [R, G, B,  R, G, B,  R, G, B, ...]
    //          pixel 0        pixel 1       pixel 2
    let mut pixels: Vec<u8> = vec![0xFF; dim * dim * 3];

    // Convert the hex string to lowercase bytes once upfront.
    // `.as_bytes()` gives us a `&[u8]` — a slice of raw bytes.
    // This avoids repeated UTF-8 parsing inside the loop.
    let hex_bytes = hex_code.as_bytes();

    // Iterate over every cell in the canvas grid.
    for py in 0..size {       // py = pixel-art Y (0..size means 0,1,2,...,size-1)
        for px in 0..size {   // px = pixel-art X
            // Each cell occupies 6 chars in hex_code: "RRGGBB"
            let hex_offset = (py * size + px) * 6;

            // Parse the 6 hex chars into R, G, B bytes.
            // This is the hot path — doing it with a fast lookup table
            // instead of format parsing is the main speedup over JS.
            let r = parse_hex_byte(hex_bytes[hex_offset],     hex_bytes[hex_offset + 1])?;
            let g = parse_hex_byte(hex_bytes[hex_offset + 2], hex_bytes[hex_offset + 3])?;
            let b = parse_hex_byte(hex_bytes[hex_offset + 4], hex_bytes[hex_offset + 5])?;

            // Fill every output pixel covered by this cell.
            // One canvas cell = `scale × scale` output pixels.
            for oy in 0..scale {           // oy = output pixel Y within the cell
                for ox in 0..scale {       // ox = output pixel X within the cell
                    let sx = px * scale + ox;  // absolute X in the output image
                    let sy = py * scale + oy;  // absolute Y in the output image

                    // In a flat array, pixel at (sx, sy) starts at index:
                    //   (sy * width + sx) * 3
                    // Times 3 because each pixel has 3 bytes (R, G, B).
                    let i = (sy * dim + sx) * 3;

                    pixels[i]     = r;
                    pixels[i + 1] = g;
                    pixels[i + 2] = b;
                }
            }
        }
    }

    // ---- Encode to PNG and write to stdout ----

    // Lock stdout. This gives us a buffered writer which is much faster
    // than calling `write` many times on an unbuffered handle.
    let stdout = io::stdout();
    let writer = io::BufWriter::new(stdout.lock());

    // Create a PNG encoder.
    //   width and height must be u32 (32-bit unsigned integer).
    //   `as u32` is an explicit cast — Rust never casts implicitly.
    let mut encoder = png::Encoder::new(writer, dim as u32, dim as u32);

    // ColorType::Rgb = 3 bytes per pixel (no alpha channel).
    // BitDepth::Eight = each channel is 8 bits (0–255).
    encoder.set_color(png::ColorType::Rgb);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Best);
    encoder.set_filter(png::FilterType::Sub);

    // `write_header()` outputs the PNG header and returns a writer
    // for the image data.
    let mut png_writer = encoder.write_header()?;

    // Write all pixel data at once. `?` propagates any IO error
    // back to the caller (main), which will print it and exit.
    png_writer.write_image_data(&pixels)?;

    Ok(()) // Success — the `()` is Rust's "void" / "nothing to return"
}

// ============================================================
//  HEX PARSING — the fast lookup table approach
// ============================================================

// This converts two ASCII hex characters into one byte.
// For example: ('f', 'f') → 255,  ('0', '0') → 0,  ('a', 'b') → 171
//
// In JS you'd write: parseInt(hex.slice(n, n+2), 16)
// That's slow because it parses a string. Here we use a lookup table:
// one array of 256 entries where the index is the ASCII value of a hex char.
//
// `#[inline]` tells the compiler to paste this function's code directly
// at each call site instead of making a function call — important in hot loops.
#[inline]
fn parse_hex_byte(hi: u8, lo: u8) -> Result<u8, String> {
    // The lookup table maps ASCII bytes → their hex value (0–15),
    // or 255 as a sentinel meaning "invalid character".
    //
    // `static` = lives for the whole program (like a global constant).
    // `[u8; 256]` = array of 256 u8 values.
    static HEX_TABLE: [u8; 256] = {
        // This block runs at compile time to build the table.
        // `const` blocks let you do computation at compile time in Rust.
        let mut table = [255u8; 256]; // fill everything with 255 (= invalid)
        // '0'=48 through '9'=57
        let mut i = 0u8;
        while i < 10 {
            table[(b'0' + i) as usize] = i;
            i += 1;
        }
        // 'a'=97 through 'f'=102
        i = 0;
        while i < 6 {
            table[(b'a' + i) as usize] = 10 + i;
            i += 1;
        }
        // 'A'=65 through 'F'=70 (support uppercase too, just in case)
        i = 0;
        while i < 6 {
            table[(b'A' + i) as usize] = 10 + i;
            i += 1;
        }
        table
    };

    let high = HEX_TABLE[hi as usize];
    let low  = HEX_TABLE[lo as usize];

    // If either nibble is 255, the character was invalid.
    if high == 255 || low == 255 {
        return Err(format!(
            "Invalid hex characters: '{}' '{}'",
            hi as char,
            lo as char
        ));
    }

    // Combine: high nibble shifted left 4 bits, OR'd with low nibble.
    // Example: 'a'=10, 'b'=11 → (10 << 4) | 11 = 160 | 11 = 171 = 0xAB
    Ok((high << 4) | low)
}

// ============================================================
//  TESTS
//  Run with: cargo test
// ============================================================

#[cfg(test)] // This block is only compiled when running `cargo test`
mod tests {
    use super::*; // Import everything from the parent module

    #[test]
    fn test_parse_hex_byte_valid() {
        assert_eq!(parse_hex_byte(b'f', b'f').unwrap(), 255);
        assert_eq!(parse_hex_byte(b'0', b'0').unwrap(), 0);
        assert_eq!(parse_hex_byte(b'a', b'b').unwrap(), 0xAB);
        assert_eq!(parse_hex_byte(b'F', b'F').unwrap(), 255); // uppercase
    }

    #[test]
    fn test_parse_hex_byte_invalid() {
        assert!(parse_hex_byte(b'z', b'0').is_err());
        assert!(parse_hex_byte(b'0', b'!').is_err());
    }

    #[test]
    fn test_render_produces_output() {
        // A 5×5 all-red canvas: "ff0000" repeated 25 times
        let hex = "ff0000".repeat(25);
        // render() writes to stdout, which we can't easily capture in a unit test.
        // Instead, just verify it doesn't return an error.
        // For a fuller integration test, use the shell test in README.
        assert!(render(&hex, 5).is_ok());
    }

    #[test]
    fn test_render_rejects_wrong_length() {
        // Wrong length for size=5 (needs 150 chars, giving 6)
        assert!(render("ff0000", 5).is_err());
    }
}