import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { DB_PATH } from "./constants.js";


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
            message_id TEXT NOT NULL,
            row_id INTEGER NOT NULL,
            key TEXT NOT NULL,
            is_delta BOOLEAN NOT NULL,
            user_id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            readable_time TEXT NOT NULL,
            PRIMARY KEY (message_id, row_id)
        );

        CREATE TABLE IF NOT EXISTS colour (
            user_id TEXT PRIMARY KEY,
            hex_code INTEGER
        );

        CREATE TABLE IF NOT EXISTS vote (
            user_id TEXT PRIMARY KEY,
            timestamp INTEGER
        );

        CREATE TABLE IF NOT EXISTS image_hash (
            hash TEXT PRIMARY KEY,
            key TEXT
        );

        CREATE TABLE IF NOT EXISTS canvas_count (
            id INTEGER PRIMARY KEY CHECK (id = 0),
            count INTEGER NOT NULL
        );

        INSERT OR IGNORE INTO canvas_count (id, count) VALUES (0, 0);
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
    row_id: number;
    key: string;
    is_delta: boolean;
    user_id: string;
    timestamp: number;
    readable_time: string;
}

// --- Functions ---

/**
 * Appends a pixel update event to the timelapse log.
 */

const insertTimelapseStmt = db.prepare(`
    INSERT INTO timelapse (message_id, row_id, key, is_delta, user_id, timestamp, readable_time)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const selectMaxRowIdStmt = db.prepare(`
    SELECT MAX(row_id) as max_row_id FROM timelapse
    WHERE message_id = ?
`);

const selectRecentDeltasStmt = db.prepare(`
    SELECT is_delta FROM timelapse
    WHERE message_id = ?
    ORDER BY row_id DESC
    LIMIT 10
`);

const appendPixelUpdateTx = db.transaction(
    (
        messageId: string,
        fkey: string,
        dkey: string | null | undefined,
        userId: string,
    ) => {
        const ts = Math.floor(Date.now() / 1000);

        const readable = new Date(ts * 1000)
            .toISOString()
            .replace("T", " ")
            .substring(0, 19);

        // Determine row_id
        const maxRowIdResult = selectMaxRowIdStmt.get(messageId) as
            | { max_row_id: number | null }
            | undefined;
        const rowId = (maxRowIdResult?.max_row_id ?? -1) + 1;

        let keyToStore: string;
        let isDelta: boolean;

        if (rowId === 0 || !dkey) {
            keyToStore = fkey;
            isDelta = false;
        } else {
            const rows = selectRecentDeltasStmt.all(messageId) as {
                is_delta: number;
            }[];

            let consecutiveDeltaCount = 0;
            for (const row of rows) {
                if (row.is_delta) {
                    consecutiveDeltaCount++;
                } else {
                    break;
                }
            }

            if (consecutiveDeltaCount >= 10) {
                keyToStore = fkey;
                isDelta = false;
            } else {
                keyToStore = dkey;
                isDelta = true;
            }
        }

        insertTimelapseStmt.run(
            messageId,
            rowId,
            keyToStore,
            isDelta ? 1 : 0,
            userId,
            ts,
            readable,
        );
    },
);
export function appendPixelUpdate(
    messageId: string,
    fkey: string,
    dkey: string | null | undefined,
    userId: string,
) {
    appendPixelUpdateTx(messageId, fkey, dkey, userId);
}

/**
 * Retrieves the full history of a canvas.
 * Equivalent to get_canvas_history().
 */
const selectCanvasHistoryStmt = db.prepare(`
    SELECT row_id, key, is_delta, user_id, timestamp, readable_time
    FROM timelapse
    WHERE message_id = ?
    ORDER BY row_id
`);
//param: messageId, remove latest row
const deleteLatestRowStmt = db.prepare(`
    DELETE FROM timelapse
    WHERE row_id = (
        SELECT MAX(row_id)
        FROM timelapse
        WHERE message_id = ?
    )
`);

export function undoPixelUpdate(messageId: string): string | null {
    let rows = getCanvasHistory(messageId);

    if (rows.length === 0) {
        return null;
    }

    if (rows.length === 1) {
        return rows[0]!.key;
    }

    deleteLatestRowStmt.run(messageId);
    //delete latest rows
    rows.pop();

    const snapshotIndex = rows.findLastIndex((row) => row.is_delta === false);

    if (snapshotIndex === -1) {
        return null;
    }

    let key = rows[snapshotIndex]!.key;
    for (let deltas = snapshotIndex + 1; deltas < rows.length; deltas++) {
        const delta = rows[deltas]?.key.split(",");
        for (const pixel of delta!) {
            const [numStr, colour] = pixel.split(":");
            const num = Number(numStr);
            key = key.slice(0, num * 6) + colour + key.slice(num * 6 + 6);
        }
    }
    return key;
}

export function getCanvasHistory(messageId: string): CanvasHistoryRow[] {
    const rows = selectCanvasHistoryStmt.all(messageId) as (Omit<
        CanvasHistoryRow,
        "is_delta"
    > & { is_delta: number })[];
    return rows.map((row) => ({
        ...row,
        is_delta: row.is_delta === 1,
    }));
}

// Returns colour as 6-char hex string like "ff00aa"
const selectUserColourStmt = db.prepare(`
    SELECT hex_code FROM colour WHERE user_id = ?
`);

const insertUserColourStmt = db.prepare(`
    INSERT INTO colour (user_id, hex_code)
    VALUES (?, ?)
`);

export function getUserColour(userId: string): string {
    let row = selectUserColourStmt.get(userId) as
        | { hex_code: number }
        | undefined;

    if (!row) {
        const defaultValue = 0;
        insertUserColourStmt.run(userId, defaultValue);
        row = { hex_code: defaultValue };
    }

    return row.hex_code.toString(16).padStart(6, "0");
}

// Updates user colour using hex string like "ff00aa"
const upsertUserColourStmt = db.prepare(`
    INSERT INTO colour (user_id, hex_code)
    VALUES (?, ?)
    ON CONFLICT(user_id)
    DO UPDATE SET hex_code = excluded.hex_code
`);

export function postUserColour(userId: string, hexCode: string): void {
    const intValue = parseInt(hexCode, 16);

    upsertUserColourStmt.run(userId, intValue);
}

// Get current canvas count
const selectCanvasCountStmt = db.prepare(`
    SELECT count FROM canvas_count WHERE id = 0
`);

export function getCanvasCount(): number {
    const row = selectCanvasCountStmt.get() as { count: number } | undefined;
    return row?.count ?? 0;
}

// Increment canvas count
const incrementCanvasCountStmt = db.prepare(`
    INSERT INTO canvas_count (id, count)
    VALUES (0, 1)
    ON CONFLICT(id)
    DO UPDATE SET count = count + 1
`);

export function appendCanvasCount(): void {
    incrementCanvasCountStmt.run();
}

/**
 * Hashes an image key and stores it, preventing duplicates.
 * Equivalent to post_image_hash().
 */
const insertImageHashStmt = db.prepare(`
    INSERT OR IGNORE INTO image_hash (hash, key)
    VALUES (?, ?)
`);

export function postImageHash(key: string, size: number): string {
    const combinedKey = `${size}-${key}`;
    const hash = crypto.createHash("sha256").update(combinedKey).digest("hex");

    insertImageHashStmt.run(hash, combinedKey);

    return hash;
}

/**
 * Retrieves an image key from its hash.
 * Equivalent to get_image_hash().
 */
const selectImageHashStmt = db.prepare(`
    SELECT key FROM image_hash WHERE hash = ?
`);

export function getImageHash(hash: string): [number, string] | null {
    const row = selectImageHashStmt.get(hash) as { key: string } | undefined;

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
const selectVoteStmt = db.prepare(`
    SELECT timestamp FROM vote WHERE user_id = ?
`);

export function hasVotedDb(userId: string): boolean {
    const row = selectVoteStmt.get(userId) as { timestamp: number } | undefined;

    if (!row) {
        return false;
    }

    const lastVoteTs = row.timestamp;
    const currentTs = Math.floor(Date.now() / 1000);

    // 12 hours = 43200 seconds
    return currentTs - lastVoteTs < 43200;
}
