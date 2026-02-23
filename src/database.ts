import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// --- Setup ---

const DB_PATH = "data/data.db";

// Ensure the data directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// --- Initialization ---

/**
 * Initializes the database schema and sets PRAGMAs for performance.
 * This is the TypeScript equivalent of init_db().
 */
function initDb() {
    // Allow reads during writes and set a busy timeout.
    // This is a more idiomatic way to handle locking than the Python's retry loop.
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000"); // Wait 5 seconds for locks to be released

    const schema = `
        CREATE TABLE IF NOT EXISTS timelapse (
            guild_id TEXT,
            channel_id TEXT,
            message_id TEXT,
            key TEXT,
            user_id TEXT,
            timestamp INTEGER,
            readable_time TEXT
        );

        CREATE TABLE IF NOT EXISTS colour (
            user_id TEXT PRIMARY KEY,
            hex_code INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_timelapse_lookup
        ON timelapse (guild_id, channel_id, message_id, timestamp);

        CREATE TABLE IF NOT EXISTS vote (
            user_id TEXT PRIMARY KEY,
            timestamp INTEGER
        );

        CREATE TABLE IF NOT EXISTS image_hash (
            hash TEXT PRIMARY KEY,
            key TEXT
        );
    `;
    db.exec(schema);
}

// Run initialization on module load
initDb();

// --- Ensure proper shutdown ---
process.on("exit", () => {
    db.close();
    console.log("Database closed on exit.");
});

process.on("SIGINT", () => {
    db.close();
    console.log("Database closed on SIGINT.");
    process.exit();
});

process.on("SIGTERM", () => {
    db.close();
    console.log("Database closed on SIGTERM.");
    process.exit();
});

// --- Type Definitions ---

export interface CanvasHistoryRow {
    key: string;
    user_id: string;
    timestamp: number;
    readable_time: string;
}

// --- Functions ---

/**
 * Appends a pixel update event to the timelapse log.
 * Equivalent to append_pixel_update().
 */
export function appendPixelUpdate(
    guildId: string,
    channelId: string,
    messageId: string,
    key: string,
    userId: string,
): void {
    const ts = Math.floor(Date.now() / 1000);
    const readable = new Date(ts * 1000)
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);

    const stmt = db.prepare(`
        INSERT INTO timelapse (
            guild_id, channel_id, message_id, key, user_id, timestamp, readable_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(guildId, channelId, messageId, key, userId, ts, readable);
}

/**
 * Retrieves the full history of a canvas.
 * Equivalent to get_canvas_history().
 */
export function getCanvasHistory(
    guildId: string,
    channelId: string,
    messageId: string,
): CanvasHistoryRow[] {
    const stmt = db.prepare(`
        SELECT key, user_id, timestamp, readable_time
        FROM timelapse
        WHERE guild_id = ? AND channel_id = ? AND message_id = ?
        ORDER BY timestamp
    `);
    return stmt.all(guildId, channelId, messageId) as CanvasHistoryRow[];
}

// Returns colour as 6-char hex string like "ff00aa"
export function getUserColour(userId: string): string {
    const selectStmt = db.prepare(
        "SELECT hex_code FROM colour WHERE user_id = ?",
    );

    let row = selectStmt.get(userId) as { hex_code: number } | undefined;

    if (!row) {
        const defaultValue = 0;
        const insertStmt = db.prepare(
            "INSERT INTO colour (user_id, hex_code) VALUES (?, ?)",
        );
        insertStmt.run(userId, defaultValue);
        row = { hex_code: defaultValue };
    }

    return row.hex_code.toString(16).padStart(6, "0");
}

// Updates user colour using hex string like "ff00aa"
export function postUserColour(userId: string, hexCode: string): void {
    const intValue = parseInt(hexCode, 16);

    const stmt = db.prepare(`
        INSERT INTO colour (user_id, hex_code)
        VALUES (?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET hex_code = excluded.hex_code
    `);

    stmt.run(userId, intValue);
}

// Returns canvas count as number
export function getCanvasCount(): number {
    const selectStmt = db.prepare(
        "SELECT hex_code FROM colour WHERE user_id = 'count'",
    );

    let row = selectStmt.get() as { hex_code: number } | undefined;

    if (!row) {
        const insertStmt = db.prepare(
            "INSERT INTO colour (user_id, hex_code) VALUES ('count', 0)",
        );
        insertStmt.run();
        return 0;
    }

    return row.hex_code;
}

// Increments canvas count by 1
export function appendCanvasCount(): void {
    const stmt = db.prepare(`
        INSERT INTO colour (user_id, hex_code)
        VALUES ('count', 1)
        ON CONFLICT(user_id)
        DO UPDATE SET hex_code = hex_code + 1
    `);

    stmt.run();
}

/**
 * Hashes an image key and stores it, preventing duplicates.
 * Equivalent to post_image_hash().
 */
export function postImageHash(key: string, size: number): string {
    const combinedKey = `${size}-${key}`;
    const hash = crypto.createHash("sha256").update(combinedKey).digest("hex");

    const stmt = db.prepare(`
        INSERT OR IGNORE INTO image_hash (hash, key)
        VALUES (?, ?)
    `);
    stmt.run(hash, combinedKey);

    return hash;
}

/**
 * Retrieves an image key from its hash.
 * Equivalent to get_image_hash().
 */
export function getImageHash(hash: string): [number, string] | null {
    const stmt = db.prepare("SELECT key FROM image_hash WHERE hash = ?");
    const row = stmt.get(hash) as { key: string } | undefined;

    if (!row || !row.key) {
        return null;
    }

    const firstHyphenIndex = row.key.indexOf("-");
    if (firstHyphenIndex === -1) return null;

    const sizeStr = row.key.substring(0, firstHyphenIndex);
    const key = row.key.substring(firstHyphenIndex + 1);
    const size = parseInt(sizeStr, 10);

    return isNaN(size) ? null : [size, key];
}

/**
 * Checks if a user has voted in the last 12 hours.
 * Equivalent to has_voted_db().
 */
export function hasVotedDb(userId: string): boolean {
    const stmt = db.prepare("SELECT timestamp FROM vote WHERE user_id = ?");
    const row = stmt.get(userId) as { timestamp: number } | undefined;

    if (!row) {
        return false;
    }

    const lastVoteTs = row.timestamp;
    const currentTs = Math.floor(Date.now() / 1000);

    // 12 hours = 43200 seconds
    return currentTs - lastVoteTs < 43200;
}
