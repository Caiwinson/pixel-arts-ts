# ─── Stage 1: Download ffmpeg (arch-aware) ───────────────────────────────────
FROM --platform=$BUILDPLATFORM alpine:3.21 AS ffmpeg-downloader
ARG TARGETARCH

RUN apk add --no-cache curl xz tar

RUN if [ "$TARGETARCH" = "arm64" ]; then \
        FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"; \
    else \
        FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"; \
    fi && \
    curl -fsSL "$FFMPEG_URL" -o /tmp/ffmpeg.tar.xz && \
    mkdir -p /tmp/ffmpeg && \
    tar -xJf /tmp/ffmpeg.tar.xz -C /tmp/ffmpeg --strip-components=1 && \
    cp /tmp/ffmpeg/ffmpeg /usr/local/bin/ffmpeg && \
    chmod +x /usr/local/bin/ffmpeg

# ─── Stage 2: Build Rust binaries (arch-aware) ───────────────────────────────
FROM --platform=$TARGETPLATFORM rust:1.78-slim AS rust-builder

WORKDIR /rust

# Copy both crates
COPY rust/pixel-render ./pixel-render
COPY rust/timelapse-render ./timelapse-render

# Build both binaries in release mode
RUN cargo build --release --manifest-path pixel-render/Cargo.toml && \
    cargo build --release --manifest-path timelapse-render/Cargo.toml

# ─── Stage 3: Build TypeScript ────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Stage 4: Production image ────────────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app

# Copy ffmpeg binary
COPY --from=ffmpeg-downloader /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg

# Copy Rust binaries
COPY --from=rust-builder /rust/pixel-render/target/release/pixel-render /usr/local/bin/pixel-render
COPY --from=rust-builder /rust/timelapse-render/target/release/timelapse-render /usr/local/bin/timelapse-render

# Install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built JS
COPY --from=builder /app/dist ./dist

# Copy static assets
COPY public ./public
COPY static ./static

# Data directory (mounted as a volume at runtime)
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "dist/index.js"]