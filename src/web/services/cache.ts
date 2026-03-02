import * as fs from "fs";
import * as path from "path";

// ---- TTL Memory Cache ----
// Mirrors: TTLCache(maxsize=200, ttl=600)

type CacheEntry = {
    data: Buffer;
    expiresAt: number;
};

const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 600_000; // 10 minutes

const memoryCache = new Map<string, CacheEntry>();

function memGet(key: string): Buffer | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        memoryCache.delete(key);
        return null;
    }

    return entry.data;
}

function memSet(key: string, data: Buffer): void {
    // Evict oldest entry if at capacity
    if (memoryCache.size >= CACHE_MAX_SIZE && !memoryCache.has(key)) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey) memoryCache.delete(oldestKey);
    }

    memoryCache.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

// ---- Public API ----

/**
 * Check RAM cache first, then disk. If found on disk, promote to RAM.
 * Mirrors: get_cached_image()
 */
export function getCachedImage(
    cacheDir: string,
    imgHash: string,
): Buffer | null {
    const cacheKey = `${cacheDir}_${imgHash}`;

    // 1. RAM cache
    const cached = memGet(cacheKey);
    if (cached) return cached;

    // 2. Disk cache
    const filePath = path.join(cacheDir, `${imgHash}.png`);
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        memSet(cacheKey, data);
        return data;
    }

    return null;
}

/**
 * Store in both RAM and disk.
 * Mirrors: store_image_in_cache()
 */
export function storeImageInCache(
    cacheDir: string,
    imgHash: string,
    data: Buffer,
): void {
    const cacheKey = `${cacheDir}_${imgHash}`;

    // RAM — store a copy so callers can't mutate the cached buffer
    memSet(cacheKey, Buffer.from(data));

    // Disk
    fs.mkdirSync(cacheDir, { recursive: true });
    const filePath = path.join(cacheDir, `${imgHash}.png`);
    try {
        fs.writeFileSync(filePath, data);
    } catch (err) {
        console.error(`Failed to store image ${imgHash} on disk: ${err}`);
    }
}
