// ═══════════════════════════════════════════════════════════════════
// SVG ICONS — module-level constant (fixes static class field bug)...
// ═══════════════════════════════════════════════════════════════════
// Default prefix for recorded audio filenames: rec_YYYY-MM-DD_HH-MM-SS.webm
const REC_PREFIX = 'rec';

const ICONS = {
    rename: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>`,
    download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>`,
    delete: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>`,
    back: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
    <polyline points="15 18 9 12 15 6"/>
  </svg>`,
    home: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;vertical-align:middle">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
  </svg>`,
    stop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
  </svg>`,
    upload: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>`,
    folder_plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <line x1="12" y1="11" x2="12" y2="17"/>
    <line x1="9" y1="14" x2="15" y2="14"/>
  </svg>`,
    file_plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="12" y1="18" x2="12" y2="12"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </svg>`,
    play: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="5,3 19,12 5,21"/>
  </svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <rect x="5" y="3" width="4" height="18" rx="1"/>
    <rect x="15" y="3" width="4" height="18" rx="1"/>
  </svg>`,
    drag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="6" y1="5" x2="18" y2="5"/>
    <line x1="6" y1="9" x2="18" y2="9"/>
    <line x1="6" y1="13" x2="18" y2="13"/>
    <line x1="6" y1="17" x2="18" y2="17"/>
    <line x1="6" y1="21" x2="18" y2="21"/>
  </svg>`,
};


// ═══════════════════════════════════════════════════════════════════
// TEMPLATE
// ═══════════════════════════════════════════════════════════════════
const TEMPLATE = document.getElementById("template-audio-explorer");


// ═══════════════════════════════════════════════════════════════════
// TimestampUtils
// ═══════════════════════════════════════════════════════════════════
class TimestampUtils {
    /**
     * Returns a filename-safe local timestamp string from the current time.
     * Output: "2026-03-06_14-23-07"
     * MUST be called at save time, never at class-definition time.
     */
    static filenameSafe() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return [
            d.getFullYear(),
            pad(d.getMonth() + 1),
            pad(d.getDate()),
        ].join('-')
            + '_'
            + [
                pad(d.getHours()),
                pad(d.getMinutes()),
                pad(d.getSeconds()),
            ].join('-');
    }

    /**
     * Extracts a human-readable date from a rec_ filename.
     * "rec_2026-03-06_14-23-07.webm" → "06/03/2026 14:23:07"
     * Returns null for non-matching names.
     */
    static parseFromFilename(name) {
        const m = name.match(
            /^rec_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/
        );
        if (!m) return null;
        const [, yyyy, mo, dd, hh, mi, ss] = m;
        return `${dd}/${mo}/${yyyy} ${hh}:${mi}:${ss}`;
    }

    /** 83 → "1m 23s"  |  45 → "45s" */
    static formatDuration(totalSecs) {
        const m = Math.floor(totalSecs / 60);
        const s = totalSecs % 60;
        return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
}


// ═══════════════════════════════════════════════════════════════════
// InlineDialog — async prompt / confirm inside Shadow DOM
// ═══════════════════════════════════════════════════════════════════
class InlineDialog {
    constructor(sr) {
        this._sr = sr;
        this._resolve = null;

        sr.getElementById('dialog-confirm')
            .addEventListener('click', () => this._submit(true));
        sr.getElementById('dialog-cancel')
            .addEventListener('click', () => this._submit(false));
        sr.getElementById('dialog-input')
            .addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submit(true);
                if (e.key === 'Escape') this._submit(false);
            });
    }

    _submit(confirmed) {
        const value = this._sr.getElementById('dialog-input').value.trim();
        this._hide();
        if (this._resolve) this._resolve({ confirmed, value });
    }

    _show(message, withInput, placeholder, prefill) {
        const input = this._sr.getElementById('dialog-input');
        this._sr.getElementById('dialog-msg').textContent = message;
        input.style.display = withInput ? 'block' : 'none';
        input.value = prefill || '';
        input.placeholder = placeholder || '';
        this._sr.getElementById('dialog-backdrop').classList.add('open');
        if (withInput) {
            setTimeout(() => {
                input.focus();
                const dot = (prefill || '').lastIndexOf('.');
                input.setSelectionRange(0, dot > 0 ? dot : (prefill || '').length);
            }, 40);
        }
    }

    _hide() {
        this._sr.getElementById('dialog-backdrop').classList.remove('open');
    }

    /** Returns the entered string, or null if cancelled / empty */
    prompt(message, placeholder = '', prefill = '') {
        return new Promise((resolve) => {
            this._resolve = ({ confirmed, value }) =>
                resolve(confirmed && value.length ? value : null);
            this._show(message, true, placeholder, prefill);
        });
    }

    /** Returns true or false */
    confirm(message) {
        return new Promise((resolve) => {
            this._resolve = ({ confirmed }) => resolve(confirmed);
            this._show(message, false, '', '');
        });
    }
}


// ═══════════════════════════════════════════════════════════════════
// RecorderFSM  —  IDLE ↔ RECORDING
// ═══════════════════════════════════════════════════════════════════
class RecorderFSM {
    static STATES = Object.freeze({ IDLE: 'IDLE', RECORDING: 'RECORDING' });

    constructor({ onSave, onTick }) {
        this.state = RecorderFSM.STATES.IDLE;
        this._onSave = onSave;
        this._onTick = onTick;
        this._recorder = null;
        this._chunks = [];
        this._timer = null;
        this._secs = 0;
        this._stream = null;
    }

    get isRecording() { return this.state === RecorderFSM.STATES.RECORDING; }
    get stream() { return this._stream; }

    async start() {
        if (this.state !== RecorderFSM.STATES.IDLE) return;

        try {
            this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            this._stream = null;
            throw e;
        }

        try {
            this._recorder = new MediaRecorder(this._stream);
            this._chunks = [];
            this._secs = 0;

            this._recorder.ondataavailable = (e) => {
                if (e.data.size > 0) this._chunks.push(e.data);
            };

            this._recorder.onstop = async () => {
                const blob = new Blob(this._chunks, { type: 'audio/webm' });
                const duration = this._secs;
                this._releaseStream();
                await this._onSave(blob, duration);
            };

            this._recorder.start();
            this._timer = setInterval(() => {
                this._secs++;
                this._onTick(this._secs);
            }, 1000);

            this.state = RecorderFSM.STATES.RECORDING;
        } catch (e) {
            this._releaseStream();
            throw e;
        }
    }

    stop() {
        if (this.state !== RecorderFSM.STATES.RECORDING) return;
        clearInterval(this._timer);
        this._timer = null;
        this._recorder.stop();
        this.state = RecorderFSM.STATES.IDLE;
    }

    /** Hard stop — no save (used in disconnectedCallback) */
    abort() {
        if (this.state !== RecorderFSM.STATES.RECORDING) return;
        clearInterval(this._timer);
        this._timer = null;
        this._recorder.ondataavailable = null;
        this._recorder.onstop = null;
        try { this._recorder.stop(); } catch (_) { /* ignore */ }
        this._releaseStream();
        this.state = RecorderFSM.STATES.IDLE;
    }

    async toggle() {
        this.isRecording ? this.stop() : await this.start();
    }

    _releaseStream() {
        this._stream?.getTracks().forEach((t) => t.stop());
        this._stream = null;
    }
}


// ═══════════════════════════════════════════════════════════════════
// OPFSManager — all Origin Private File System operations
// ═══════════════════════════════════════════════════════════════════
// ---------------------------------------------------------------
// OPFSManager – Origin Private File System helper (with JSDoc)
// ---------------------------------------------------------------

/**
 * @typedef {Object} DirEntry
 * @property {string} name                 – Entry name (file or folder).
 * @property {FileSystemHandle} handle     – The native handle (file or directory).
 * @property {number} timestamp            – Epoch ms. For files it is `File.lastModified`,
 *                                          for directories it is `0` (no native timestamp).
 */

/**
 * Small hierarchy of errors thrown by {@link OPFSManager}.
 * Allows callers to inspect `code` (e.g. `ENOENT`, `EEXIST`).
 */
class OPFSError extends Error {
    /**
     * @param {string} message
     * @param {string} code
     */
    constructor(message, code) {
        super(message);
        this.name = 'OPFSError';
        this.code = code;
    }
}

/**
 * Helper class that encapsulates *all* Origin‑Private‑File‑System (OPFS) operations
 * needed by a typical file‑manager UI.
 *
 * The class must be instantiated **asynchronously** via {@link OPFSManager.create}
 * (or `new …; await .init()` if you prefer the two‑step pattern).
 *
 * Example:
 * ```js
 * const mgr = await OPFSManager.create();          // ← ready to use
 * const entries = await mgr.listEntries();         // sorted newest → oldest
 * await mgr.enterDir('subfolder');
 * await mgr.saveBlob('note.txt', new Blob(['Hello']));
 * ```
 */
class OPFSManager {
    /** @private */
    constructor() {
        /** @type {FileSystemDirectoryHandle|null} */
        this._currentDir = null;
        /** @type {FileSystemDirectoryHandle[]} */
        this._stack = [];

        /** @type {Promise<void>} internal lock used to serialize mutating ops */
        this._busy = Promise.resolve();
    }

    // -----------------------------------------------------------------
    //  read‑only view helpers
    // -----------------------------------------------------------------

    /** @returns {FileSystemDirectoryHandle|null} */
    get currentDir() {
        return this._currentDir;
    }

    /** @returns {number} Number of directories stored in the navigation stack */
    get stackDepth() {
        return this._stack.length;
    }

    /**
     * Human‑readable breadcrumb, e.g. `" / racine / images / 2024"`.
     * The root is labelled *racine* by default (feel free to change the string).
     *
     * @returns {string}
     */
    get breadcrumbPath() {
        return ' / ' + this._stack.map((h) => h.name || 'racine').join(' / ');
    }

    // -----------------------------------------------------------------
    //  internal helpers
    // -----------------------------------------------------------------

    /** @private throws if the manager has not been initialised yet */
    _ensureReady() {
        if (!this._currentDir) {
            throw new OPFSError('OPFSManager not initialised – call await OPFSManager.create()', 'EINIT');
        }
    }

    /**
     * Wrap a mutating async operation so that only one runs at a time.
     * Prevents race‑conditions such as two concurrent `renameEntry` calls.
     *
     * @template T
     * @param {() => Promise<T>} fn
     * @returns {Promise<T>}
     */
    async _queue(fn) {
        // Serialises calls by chaining onto the previous promise.
        const run = async () => {
            this._busy = this._busy.then(fn, fn);
            return this._busy;
        };
        return run();
    }

    // -----------------------------------------------------------------
    //  public API
    // -----------------------------------------------------------------

    /**
     * Initialise the manager.  Called internally by {@link OPFSManager.create}.
     * Exposes the root OPFS directory as the first element of the navigation stack.
     *
     * @returns {Promise<void>}
     */
    async init() {
        this._currentDir = await navigator.storage.getDirectory();
        this._stack = [this._currentDir];
    }

    /**
     * Factory that returns a ready‑to‑use OPFSManager instance.
     *
     * ```js
     * const mgr = await OPFSManager.create();
     * ```
     *
     * @returns {Promise<OPFSManager>}
     */
    static async create() {
        const mgr = new OPFSManager();
        await mgr.init();
        return mgr;
    }

    /**
     * List the entries of the **current** directory.
     *
     * The returned array is **sorted** so that the newest items (largest `timestamp`)
     * appear first.  Within the same timestamp entries are sorted alphabetically.
     *
     * @returns {Promise<DirEntry[]>}
     */
    async listEntries() {
        this._ensureReady();

        /** @type {DirEntry[]} */
        const entries = [];

        // Gather entries and, when possible, fetch the file's lastModified timestamp.
        for await (const [name, handle] of this._currentDir.entries()) {
            let ts = 0; // directories have no native timestamp

            if (handle.kind === 'file') {
                try {
                    const file = await handle.getFile(); // File implements Blob → has lastModified
                    ts = file.lastModified;
                } catch (e) {
                    // If reading the file fails we keep timestamp = 0 and just warn.
                    console.warn(`[OPFS] Could not read timestamp for file "${name}":`, e);
                }
            }

            entries.push({ name, handle, timestamp: ts });
        }

        // Sort newest → oldest, tie‑breaker alphabetical
        entries.sort((a, b) => {
            const diff = b.timestamp - a.timestamp;
            if (diff !== 0) return diff;
            return a.name.localeCompare(b.name);
        });

        return entries;
    }

    /**
     * Change the current directory to the sub‑folder `name`.
     *
     * @param {string} name
     * @param {{create?:boolean}} [options] – Pass `{create:true}` to automatically create the folder.
     * @returns {Promise<void>}
     */
    async enterDir(name, { create = false } = {}) {
        this._ensureReady();
        const d = await this._currentDir.getDirectoryHandle(name, { create });
        this._stack.push(d);
        this._currentDir = d;
    }

    /**
     * Move one level up in the navigation stack (unless we are already at the root).
     */
    goUp() {
        this._ensureReady();
        if (this._stack.length <= 1) return;
        this._stack.pop();
        this._currentDir = this._stack[this._stack.length - 1];
    }

    /**
     * Store a `Blob` (or `File`) under the given name inside the current directory.
     *
     * @param {string} filename
     * @param {Blob} blob
     * @returns {Promise<void>}
     */
    async saveBlob(filename, blob) {
        this._ensureReady();
        const handle = await this._currentDir.getFileHandle(filename, { create: true });
        const writer = await handle.createWritable();
        try {
            await writer.write(blob);
        } finally {
            await writer.close();
        }
    }

    /** @param {File} file */
    async uploadFile(file) {
        await this.saveBlob(file.name, file);
    }

    /**
     * Create an **empty** file (0 bytes) with the supplied name.
     *
     * @param {string} name
     * @returns {Promise<void>}
     */
    async createFile(name) {
        this._ensureReady();
        const handle = await this._currentDir.getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.close(); // closing without writing creates a zero‑byte file
    }

    /**
     * Create a sub‑directory.
     *
     * @param {string} name
     * @returns {Promise<void>}
     */
    async createFolder(name) {
        this._ensureReady();
        await this._currentDir.getDirectoryHandle(name, { create: true });
    }

    /**
     * Remove a file or directory (recursively).
     *
     * @param {string} name
     * @param {{recursive?:boolean}} [options] – Set `recursive:false` to fail when the target is a non‑empty folder.
     * @returns {Promise<void>}
     */
    async deleteEntry(name, { recursive = true } = {}) {
        this._ensureReady();
        await this._currentDir.removeEntry(name, { recursive });
    }

    /**
     * Rename a file or folder.
     *
     * Because OPFS does **not** have a native rename operation we implement
     * *copy‑then‑delete* with a safe rollback:
     *
     * 1. copy source → target,
     * 2. on success delete the source,
     * 3. on failure delete any partially‑created target,
     *
     * The method works for both files and directories.
     *
     * @param {string} oldName
     * @param {string} newName
     * @returns {Promise<void>}
     * @throws {OPFSError} if the source does not exist, or the target already exists.
     */
    async renameEntry(oldName, newName) {
        this._ensureReady();

        if (oldName === newName) return; // nothing to do

        // -----------------------------------------------------------------
        // 1️⃣ Resolve source handle + verify that target does NOT exist
        // -----------------------------------------------------------------
        let srcHandle;
        try {
            srcHandle = await this._currentDir.getFileHandle(oldName);
        } catch (_) {
            try {
                srcHandle = await this._currentDir.getDirectoryHandle(oldName);
            } catch (_) {
                throw new OPFSError(`Source "${oldName}" does not exist`, 'ENOENT');
            }
        }

        // Target must not exist, otherwise we would silently overwrite.
        const targetExists = await (async () => {
            try {
                await this._currentDir.getFileHandle(newName);
                return true;
            } catch (_) {
                try {
                    await this._currentDir.getDirectoryHandle(newName);
                    return true;
                } catch (_) {
                    return false;
                }
            }
        })();

        if (targetExists) {
            throw new OPFSError(`Target "${newName}" already exists`, 'EEXIST');
        }

        // -----------------------------------------------------------------
        // 2️⃣ Perform the copy (wrapped in the queue to avoid concurrent mutations)
        // -----------------------------------------------------------------
        await this._queue(async () => {
            try {
                if (srcHandle.kind === 'file') {
                    // ---- file copy -------------------------------------------------
                    const file = await srcHandle.getFile();
                    const destFile = await this._currentDir.getFileHandle(newName, { create: true });
                    const writer = await destFile.createWritable();
                    try {
                        await writer.write(file);
                    } finally {
                        await writer.close();
                    }
                } else {
                    // ---- directory copy -------------------------------------------
                    const destDir = await this._currentDir.getDirectoryHandle(newName, { create: true });
                    await OPFSManager._copyDirIterative(srcHandle, destDir);
                }

                // ---- 3️⃣ source delete (only after copy succeeded) -------------
                await this._currentDir.removeEntry(oldName, { recursive: true });
            } catch (e) {
                // ----------- 4️⃣ Cleanup partially‑created target ----------------
                try {
                    await this._currentDir.removeEntry(newName, { recursive: true });
                } catch (_) {
                    // ignore – the target may not have been created at all
                }
                // Re‑throw the original error so the caller can react.
                throw e;
            }
        });
    }

    /**
     * Internal helper that copies a directory **iteratively**.
     *
     * The algorithm walks the source tree breadth‑first, copies files with a
     * limited concurrency (default 4) and creates sub‑folders as needed.
     *
     * @private
     * @param {FileSystemDirectoryHandle} src
     * @param {FileSystemDirectoryHandle} dest
     * @param {number} [maxParallel=4] – maximum number of simultaneous file writes.
     * @returns {Promise<void>}
     */
    static async _copyDirIterative(src, dest, maxParallel = 4) {
        /** @type {{src:FileSystemDirectoryHandle, dest:FileSystemDirectoryHandle}[]} */
        const queue = [{ src, dest }];

        while (queue.length) {
            const { src: curSrc, dest: curDest } = queue.shift();

            /** @type {Promise<void>[]} */
            const fileWriteTasks = [];

            for await (const [name, handle] of curSrc.entries()) {
                if (handle.kind === 'file') {
                    // Prepare a copy task for the file
                    const task = (async () => {
                        const file = await handle.getFile();
                        const newFile = await curDest.getFileHandle(name, { create: true });
                        const writer = await newFile.createWritable();
                        try {
                            await writer.write(file);
                        } finally {
                            await writer.close();
                        }
                    })();

                    fileWriteTasks.push(task);

                    // Throttle – wait for a batch before launching more
                    if (fileWriteTasks.length >= maxParallel) {
                        await Promise.all(fileWriteTasks);
                        fileWriteTasks.length = 0;
                    }
                } else {
                    // Directory: create destination sub‑folder then enqueue it
                    const subDest = await curDest.getDirectoryHandle(name, { create: true });
                    queue.push({ src: handle, dest: subDest });
                }
            }

            // Flush any remaining file writes for the current folder
            if (fileWriteTasks.length) {
                await Promise.all(fileWriteTasks);
            }
        }
    }

    /**
     * Retrieve a `File` object for an entry in the current directory.
     *
     * @param {string} name
     * @returns {Promise<File>}
     */
    async getFile(name) {
        this._ensureReady();
        const handle = await this._currentDir.getFileHandle(name);
        return handle.getFile();
    }

    /**
     * **Optional** convenience: return a readable stream for a file.
     * Useful when you want to process very large files without loading them fully
     * into memory.
     *
     * @param {string} name
     * @returns {Promise<ReadableStream<Uint8Array>>}
     */
    async getFileStream(name) {
        const file = await this.getFile(name);
        // `File` implements the Blob interface, which already has `.stream()`.
        return file.stream();
    }
}

// ---------------------------------------------------------------
// Export (if you are using modules)
// ---------------------------------------------------------------
// export { OPFSManager, OPFSError };


// ═══════════════════════════════════════════════════════════════════
// ObjectURLRegistry — prevents object URL memory leaks
// ═══════════════════════════════════════════════════════════════════
class ObjectURLRegistry {
    constructor() { this._urls = new Set(); }

    create(blob) {
        const url = URL.createObjectURL(blob);
        this._urls.add(url);
        return url;
    }

    revoke(url) {
        if (!url) return;
        URL.revokeObjectURL(url);
        this._urls.delete(url);
    }

    revokeAll() {
        this._urls.forEach((u) => URL.revokeObjectURL(u));
        this._urls.clear();
    }
}


// ═══════════════════════════════════════════════════════════════════
// InlinePlayer — inserts a player row above the clicked file row
// Only one player is open at a time; clicking play on another closes
// the previous one automatically.
// ═══════════════════════════════════════════════════════════════════
class InlinePlayer {
    constructor(urlRegistry) {
        this._urlRegistry = urlRegistry;
        this._activeRow = null;   // the current <li class="player-row">
        this._audio = null;   // the hidden <audio> element
        this._activeUrl = null;
        this._raf = null;
    }

    /** Open (or toggle off) the player for a given file row */
    async toggle(anchorLi, name, getFileFn) {
        // If already playing this file → close
        if (this._activeRow && this._activeRow.dataset.file === name) {
            this._close();
            return;
        }
        // Close any previously open player
        this._close();

        // Fetch file and create object URL
        let file;
        try { file = await getFileFn(name); }
        catch (e) { console.error('InlinePlayer: could not load file', e); return; }

        this._activeUrl = this._urlRegistry.create(file);

        // Build player row
        const row = document.createElement('li');
        row.className = 'player-row';
        row.dataset.file = name;

        const inner = document.createElement('div');
        inner.className = 'player-inner';

        // Play/pause button
        const playBtn = document.createElement('button');
        playBtn.className = 'player-play';
        playBtn.innerHTML = ICONS.play;

        // Progress bar — 20px tall hit area with inner 4px visual track
        const progress = document.createElement('div');
        progress.className = 'player-progress';
        const track = document.createElement('div');
        track.className = 'player-progress-track';
        const fill = document.createElement('div');
        fill.className = 'player-progress-fill';
        track.appendChild(fill);
        progress.appendChild(track);

        // Time display
        const timeEl = document.createElement('span');
        timeEl.className = 'player-time';
        timeEl.textContent = '0:00 / 0:00';

        inner.appendChild(playBtn);
        inner.appendChild(progress);
        inner.appendChild(timeEl);
        row.appendChild(inner);

        // Hidden audio element
        const audio = new Audio(this._activeUrl);
        this._audio = audio;
        this._activeRow = row;

        // ── Helpers ──────────────────────────────────────────────────
        const fmt = (s) => {
            const m = Math.floor(s / 60);
            const ss = Math.floor(s % 60).toString().padStart(2, '0');
            return `${m}:${ss}`;
        };

        const updateUI = () => {
            const pct = audio.duration
                ? (audio.currentTime / audio.duration) * 100
                : 0;
            fill.style.width = pct + '%';
            timeEl.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || 0)}`;
        };

        const tick = () => {
            updateUI();
            if (!audio.paused) this._raf = requestAnimationFrame(tick);
        };

        // ── Events ───────────────────────────────────────────────────
        playBtn.addEventListener('click', () => {
            if (audio.paused) {
                audio.play();
            } else {
                audio.pause();
            }
        });

        audio.addEventListener('play', () => {
            playBtn.innerHTML = ICONS.pause;
            playBtn.classList.add('playing');
            this._raf = requestAnimationFrame(tick);
        });

        audio.addEventListener('pause', () => {
            playBtn.innerHTML = ICONS.play;
            playBtn.classList.remove('playing');
            cancelAnimationFrame(this._raf);
            updateUI();
        });

        audio.addEventListener('ended', () => {
            playBtn.innerHTML = ICONS.play;
            playBtn.classList.remove('playing');
            cancelAnimationFrame(this._raf);
            fill.style.width = '0%';
            audio.currentTime = 0;
            updateUI();
        });

        audio.addEventListener('loadedmetadata', updateUI);

        // Seek on click or touch
        const seek = (clientX) => {
            if (!audio.duration) return;
            const rect = progress.getBoundingClientRect();
            audio.currentTime = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * audio.duration;
            updateUI();
        };
        progress.addEventListener('click', (e) => seek(e.clientX));
        progress.addEventListener('touchstart', (e) => {
            e.preventDefault();
            seek(e.touches[0].clientX);
        }, { passive: false });
        progress.addEventListener('touchmove', (e) => {
            e.preventDefault();
            seek(e.touches[0].clientX);
        }, { passive: false });

        // Insert player row ABOVE the anchor file row
        anchorLi.parentNode.insertBefore(row, anchorLi);

        // Auto-play
        audio.play().catch(() => { });
    }

    _close() {
        if (this._audio) {
            this._audio.pause();
            this._audio.src = '';
            this._audio = null;
        }
        cancelAnimationFrame(this._raf);
        this._raf = null;
        if (this._activeUrl) {
            this._urlRegistry.revoke(this._activeUrl);
            this._activeUrl = null;
        }
        if (this._activeRow) {
            this._activeRow.remove();
            this._activeRow = null;
        }
    }

    destroy() { this._close(); }
}


// ═══════════════════════════════════════════════════════════════════
// FileListRenderer — breadcrumb + file list DOM rendering
// Uses module-level ICONS constant (no static class fields)
// ═══════════════════════════════════════════════════════════════════
class FileListRenderer {

    constructor(sr, { onNavigateUp, onEnterDir, onPlayFile, onDownload, onDelete, onRename }) {
        this._sr = sr;
        this._onNavigateUp = onNavigateUp;
        this._onEnterDir = onEnterDir;
        this._onPlayFile = onPlayFile;
        this._onDownload = onDownload;
        this._onDelete = onDelete;
        this._onRename = onRename;
    }

    static _ext(name) {
        const i = name.lastIndexOf('.');
        return i > 0 ? name.slice(i + 1).toLowerCase() : '';
    }

    static _fileIcon(name) {
        const ext = FileListRenderer._ext(name);
        const color = ['mp3', 'webm', 'wav', 'ogg'].includes(ext) ? '#a78bfa' : '#9ca3af';
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>`;
    }

    static _dirIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>`;
    }

    // ── Breadcrumb ──────────────────────────────────────────────────
    renderBreadcrumb(stackDepth, breadcrumbPath) {
        const bc = this._sr.getElementById('breadcrumb');
        bc.innerHTML = '';

        if (stackDepth > 1) {
            const btn = document.createElement('button');
            btn.className = 'btn-icon';
            btn.title = 'Dossier parent';
            btn.innerHTML = ICONS.back;
            btn.addEventListener('click', () => this._onNavigateUp());
            bc.appendChild(btn);
        }

        const home = document.createElement('span');
        home.innerHTML = ICONS.home;
        bc.appendChild(home);

        const path = document.createElement('span');
        path.textContent = breadcrumbPath;
        bc.appendChild(path);
    }

    // ── File list ───────────────────────────────────────────────────
    renderEntries(entries, currentDir) {
        const list = this._sr.getElementById('file-list');

        // Remove file rows but keep notification rows pinned at top
        Array.from(list.querySelectorAll('li:not(.notif)')).forEach((li) => li.remove());

        if (!entries.length) {
            const li = document.createElement('li');
            li.className = 'empty';
            li.textContent = '— répertoire vide —';
            list.appendChild(li);
            return;
        }

        for (const { name, handle } of entries) {
            list.appendChild(this._buildRow(name, handle, currentDir));
        }
    }

    _buildRow(name, handle, currentDir) {
        const isFile = handle.kind === 'file';
        const ext = FileListRenderer._ext(name);
        const li = document.createElement('li');

        // ── Drag support for audio files ──────────────────────────────
        if (isFile && ['webm', 'mp3', 'wav', 'ogg'].includes(ext)) {
            li.setAttribute('draggable', 'true');

            li.addEventListener('mousedown', async () => {
                try {
                    const fh = await currentDir.getFileHandle(name);
                    window.__opfsDragFile = await fh.getFile();
                } catch (err) { console.error('Drag prefetch failed:', err); }
            });

            li.addEventListener('dragstart', (e) => {
                if (!window.__opfsDragFile) return;
                e.dataTransfer.setData('application/opfs-file', name);
                e.dataTransfer.effectAllowed = 'copy';
            });

            li.addEventListener('dragend', () => { window.__opfsDragFile = null; });
        }

        const isAudio = isFile && ['webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(ext);

        // ── Info section (icon + name + badges) ───────────────────────
        const info = document.createElement('div');
        info.className = 'item-info';
        info.addEventListener('click', () => {
            if (!isFile) this._onEnterDir(name);
            // audio files are handled by the play button — no click on row
        });

        // Icon — for audio files show a play button instead of file icon
        const iconWrap = document.createElement('div');
        iconWrap.className = 'item-icon';
        if (isAudio) {
            const playIconBtn = document.createElement('button');
            playIconBtn.className = 'btn-icon';
            playIconBtn.title = 'Écouter';
            playIconBtn.style.color = '#a78bfa';
            playIconBtn.innerHTML = ICONS.play;
            playIconBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onPlayFile(name, li);
            });
            iconWrap.appendChild(playIconBtn);
        } else {
            iconWrap.innerHTML = isFile
                ? FileListRenderer._fileIcon(name)
                : FileListRenderer._dirIcon();
        }
        info.appendChild(iconWrap);

        // Name
        const nameEl = document.createElement('span');
        nameEl.className = 'item-name';
        nameEl.textContent = name;
        info.appendChild(nameEl);

        // Badges — appended to info AFTER name
        const badges = document.createElement('div');
        badges.className = 'item-badges';

        if (isFile && ext) {
            const extBadge = document.createElement('span');
            extBadge.className = 'item-badge';
            extBadge.textContent = ext;
            badges.appendChild(extBadge);
        }

        // Timestamp badge — only for rec_YYYY-MM-DD_HH-MM-SS.webm files
        const ts = TimestampUtils.parseFromFilename(name);
        if (ts) {
            const tsBadge = document.createElement('span');
            tsBadge.className = 'item-badge item-badge--ts';
            tsBadge.textContent = ts;
            tsBadge.title = "Date d'enregistrement";
            badges.appendChild(tsBadge);
        }

        info.appendChild(badges);

        // ── Action buttons ────────────────────────────────────────────
        const actions = document.createElement('div');
        actions.className = 'item-actions';

        // ✏️ Rename — files AND folders
        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn-icon';
        renameBtn.title = 'Renommer';
        renameBtn.innerHTML = ICONS.rename;   // ← uses module-level constant
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._onRename(name);
        });
        actions.appendChild(renameBtn);

        // ⬇️ Download — files only
        if (isFile) {
            const dlBtn = document.createElement('button');
            dlBtn.className = 'btn-icon';
            dlBtn.title = 'Télécharger';
            dlBtn.innerHTML = ICONS.download;   // ← uses module-level constant
            dlBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._onDownload(name);
            });
            actions.appendChild(dlBtn);
        }

        // 🗑️ Delete — files and folders
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-icon btn-danger';
        delBtn.title = 'Supprimer';
        delBtn.innerHTML = ICONS.delete;     // ← uses module-level constant
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._onDelete(name);
        });
        actions.appendChild(delBtn);

        // ── Drag handle (files only) — inserted as first child ────────
        if (isFile) {
            const dragHandle = document.createElement('div');
            dragHandle.className = 'item-drag';
            dragHandle.title = 'Déplacer';
            dragHandle.innerHTML = ICONS.drag;
            li.appendChild(dragHandle);
            li.appendChild(info);
            li.appendChild(actions);
            li.insertBefore(dragHandle, li.firstChild);
        } else {
            li.appendChild(info);
            li.appendChild(actions);
        }

        return li;
    }
}


// ═══════════════════════════════════════════════════════════════════
// WaveformVisualizer — real-time bar waveform via Web Audio API
// ═══════════════════════════════════════════════════════════════════
class WaveformVisualizer {
    constructor(canvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._rafId = null;
        this._analyser = null;
        this._audioCtx = null;
        this._dataArr = null;
        // Colour tokens read from CSS vars at first draw
        this._colBar = null;
        this._colBg = null;
    }

    /** Wire up to a live MediaStream and start drawing */
    start(stream) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = this._audioCtx.createMediaStreamSource(stream);
        this._analyser = this._audioCtx.createAnalyser();
        this._analyser.fftSize = 256;
        this._analyser.smoothingTimeConstant = 0.78;
        source.connect(this._analyser);

        this._dataArr = new Uint8Array(this._analyser.frequencyBinCount);
        this._resolveColors();
        this._loop();
    }

    /** Stop animation and release Web Audio resources */
    stop() {
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        try { this._audioCtx?.close(); } catch (_) { }
        this._analyser = null;
        this._audioCtx = null;
        this._dataArr = null;
        // Clear canvas to flat idle line
        this._drawIdle();
    }

    _resolveColors() {
        // Pull CSS variables from the host element's computed style
        const host = this._canvas.getRootNode().host;
        const cs = getComputedStyle(host);
        this._colBg = cs.getPropertyValue('--bg').trim() || '#eae7e1';
        // Use the red accent for the bars while recording
        this._colBar = cs.getPropertyValue('--red').trim() || '#dc2626';
        this._colMid = cs.getPropertyValue('--border').trim() || '#d6d0c8';
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = this._canvas.offsetWidth;
        const h = this._canvas.offsetHeight;
        if (this._canvas.width !== w * dpr || this._canvas.height !== h * dpr) {
            this._canvas.width = w * dpr;
            this._canvas.height = h * dpr;
            this._ctx.scale(dpr, dpr);
        }
        return { w, h };
    }

    _loop() {
        this._rafId = requestAnimationFrame(() => this._loop());
        if (!this._analyser) return;

        this._analyser.getByteFrequencyData(this._dataArr);
        const { w, h } = this._resize();
        const ctx = this._ctx;

        // Background
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = this._colBg;
        ctx.fillRect(0, 0, w, h);

        // Bars
        const barCount = 80;
        const gap = 2;
        const barW = (w - gap * (barCount - 1)) / barCount;
        const binStep = Math.floor(this._dataArr.length / barCount);
        const midY = h / 2;

        for (let i = 0; i < barCount; i++) {
            // Average a small bin window for smoother look
            let sum = 0;
            for (let j = 0; j < binStep; j++) {
                sum += this._dataArr[i * binStep + j] || 0;
            }
            const amplitude = sum / binStep / 255;          // 0–1
            const barH = Math.max(2, amplitude * (h - 8)); // min 2px

            const x = i * (barW + gap);

            // Gradient per bar: bright center → dimmer edges
            const grad = ctx.createLinearGradient(0, midY - barH / 2, 0, midY + barH / 2);
            grad.addColorStop(0, this._colBar + 'aa');
            grad.addColorStop(0.5, this._colBar);
            grad.addColorStop(1, this._colBar + 'aa');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(x, midY - barH / 2, barW, barH, barW / 2);
            ctx.fill();
        }

        // Centre line (visible when silent)
        ctx.fillStyle = this._colMid;
        ctx.fillRect(0, midY - 0.5, w, 1);
    }

    _drawIdle() {
        const { w, h } = this._resize();
        const ctx = this._ctx;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = this._colBg || '#eae7e1';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = this._colMid || '#d6d0c8';
        ctx.fillRect(0, h / 2 - 0.5, w, 1);
    }
}


// ═══════════════════════════════════════════════════════════════════
// DropZoneController — document-level OPFS drag-and-drop (singleton)
// ═══════════════════════════════════════════════════════════════════
class DropZoneController {
    static _initialised = false;

    static init() {
        if (DropZoneController._initialised) return;
        DropZoneController._initialised = true;
        document.addEventListener('dragover', DropZoneController._onDragOver);
        document.addEventListener('dragleave', DropZoneController._onDragLeave);
        document.addEventListener('drop', DropZoneController._onDrop);
        document.addEventListener('opfs-file-dropped', DropZoneController._onOpfsFileDropped);
    }

    static _onDragOver(e) {
        const zone = e.target.closest('.tf-drop');
        if (!zone || !e.dataTransfer.types.includes('application/opfs-file')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        zone.classList.add('tf-drop--active');
    }

    static _onDragLeave(e) {
        const zone = e.target.closest('.tf-drop');
        if (!zone || zone.contains(e.relatedTarget)) return;
        zone.classList.remove('tf-drop--active');
    }

    static _onDrop(e) {
        const zone = e.target.closest('.tf-drop');
        if (!zone || !e.dataTransfer.types.includes('application/opfs-file')) return;
        e.preventDefault();
        zone.classList.remove('tf-drop--active');
        const fileName = e.dataTransfer.getData('application/opfs-file');
        const file = window.__opfsDragFile;
        if (fileName && file) {
            zone.dispatchEvent(new CustomEvent('opfs-file-dropped', {
                bubbles: true,
                detail: { file, name: fileName },
            }));
            window.__opfsDragFile = null;
        }
    }

    static _onOpfsFileDropped(e) {
        const { file, name } = e.detail;
        const input = document.querySelector('.tf-drop input[type="file"]');
        if (!input) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        const display = document.getElementById('file-name-display');
        if (display) display.textContent = name;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
}


// ═══════════════════════════════════════════════════════════════════
// AudioExplorer — Custom Element: orchestrates all subsystems
// ═══════════════════════════════════════════════════════════════════
class AudioExplorer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

        // Inject SVG icons into toolbar buttons (avoids static-field issues)
        this._injectIcons();

        // Instantiate subsystems
        this._urlRegistry = new ObjectURLRegistry();
        this._opfs = new OPFSManager();
        this._dialog = new InlineDialog(this.shadowRoot);
        this._player = new InlinePlayer(this._urlRegistry);
        this._renderer = new FileListRenderer(this.shadowRoot, {
            onNavigateUp: () => this._navigateUp(),
            onEnterDir: (n) => this._enterDir(n),
            onPlayFile: (n, li) => this._playFile(n, li),
            onDownload: (n) => this._downloadFile(n),
            onDelete: (n) => this._deleteEntry(n),
            onRename: (n) => this._renameEntry(n),
        });

        this._recorder = new RecorderFSM({
            // TimestampUtils.filenameSafe() called HERE at save-time
            onSave: async (blob, duration) => {
                try {
                    const filename = `${REC_PREFIX}_${TimestampUtils.filenameSafe()}.webm`;
                    await this._opfs.saveBlob(filename, blob);
                    await this._render();
                    this._notify(
                        `✓ Sauvegardé : ${filename}  (${TimestampUtils.formatDuration(duration)})`,
                        'green'
                    );
                } catch (e) {
                    console.error('Save recording failed:', e);
                    this._notify('⚠ Impossible de sauvegarder : ' + e.message, 'red');
                }
            },
            onTick: (secs) => this._updateTimer(secs),
        });

        this._bindToolbarEvents();

        // Waveform visualizer
        this._waveform = new WaveformVisualizer(
            this.shadowRoot.getElementById('waveform-canvas')
        );

        this._opfs.init()
            .then(() => this._render())
            .catch((e) => this._notify('⚠ Erreur OPFS : ' + e.message, 'red'));

        // Auto-compute top offset so the shell never overflows the page bottom
        this._updateOffset();
        this._resizeObs = new ResizeObserver(() => this._updateOffset());
        this._resizeObs.observe(document.documentElement);
    }

    _updateOffset() {
        const top = this.getBoundingClientRect().top + window.scrollY;
        const shell = this.shadowRoot.querySelector('.shell');
        if (shell) {
            // Reserve top offset + 1rem bottom gap
            shell.style.maxHeight = `calc(100dvh - ${Math.round(top)}px - 1rem)`;
        }
    }

    disconnectedCallback() {
        this._recorder.abort();
        this._waveform?.stop();
        this._player?.destroy();
        this._resizeObs?.disconnect();
        this._urlRegistry.revokeAll();
    }

    // ── Inject SVG icons into named slots ─────────────────────────────
    _injectIcons() {
        const sr = this.shadowRoot;
        const set = (id, svg) => {
            const el = sr.getElementById(id);
            if (el) el.innerHTML = svg;
        };
        set('rec-icon', ICONS.mic);
        set('icon-upload', ICONS.upload);
        set('icon-folder-plus', ICONS.folder_plus);
    }

    // ── Toolbar ────────────────────────────────────────────────────────
    _bindToolbarEvents() {
        const sr = this.shadowRoot;
        sr.getElementById('rec-btn')
            .addEventListener('click', () => this._toggleRecording());
        sr.getElementById('upload-btn')
            .addEventListener('click', () => sr.getElementById('file-input').click());
        sr.getElementById('file-input')
            .addEventListener('change', (e) => this._handleUpload(e));
        sr.getElementById('newfolder-btn')
            .addEventListener('click', () => this._createNewFolder());
    }

    // ── Render ─────────────────────────────────────────────────────────
    async _render() {
        // Close any open player before re-rendering the list
        this._player?._close();
        try {
            const entries = await this._opfs.listEntries();
            this._renderer.renderBreadcrumb(this._opfs.stackDepth, this._opfs.breadcrumbPath);
            this._renderer.renderEntries(entries, this._opfs.currentDir);
        } catch (e) {
            console.error('Render error:', e);
            this._notify('⚠ Impossible de lire le répertoire : ' + e.message, 'red');
        }
    }

    // ── Navigation ─────────────────────────────────────────────────────
    async _enterDir(name) {
        try {
            await this._opfs.enterDir(name);
            await this._render();
        } catch (e) {
            this._notify("⚠ Impossible d'ouvrir : " + e.message, 'red');
        }
    }

    _navigateUp() {
        this._opfs.goUp();
        this._render();
    }

    // ── Recording ──────────────────────────────────────────────────────
    async _toggleRecording() {
        const sr = this.shadowRoot;
        const btn = sr.getElementById('rec-btn');
        const status = sr.getElementById('rec-status');
        const label = sr.getElementById('rec-label');
        const iconEl = sr.getElementById('rec-icon');
        const wavWrap = sr.getElementById('waveform-wrap');

        try {
            await this._recorder.toggle();
        } catch (e) {
            this._notify('⚠ Erreur microphone : ' + e.message, 'red');
            return;
        }

        if (this._recorder.isRecording) {
            status.classList.add('active');
            btn.className = 'btn-stop';
            label.textContent = 'Arrêter';
            iconEl.innerHTML = ICONS.stop;
            // Show canvas and start visualizer on the live stream
            wavWrap.classList.add('active');
            this._waveform.start(this._recorder.stream);
        } else {
            status.classList.remove('active');
            btn.className = 'btn-record';
            label.textContent = 'Lancer la captation ';
            iconEl.innerHTML = ICONS.mic;
            // Hide canvas and stop visualizer
            wavWrap.classList.remove('active');
            this._waveform.stop();
        }
    }

    _updateTimer(secs) {
        const mm = Math.floor(secs / 60).toString().padStart(2, '0');
        const ss = (secs % 60).toString().padStart(2, '0');
        this.shadowRoot.getElementById('timer').textContent = `${mm}:${ss}`;
    }

    // ── File operations ────────────────────────────────────────────────
    async _playFile(name, anchorLi) {
        await this._player.toggle(anchorLi, name, (n) => this._opfs.getFile(n));
    }

    async _handleUpload(e) {
        try {
            for (const f of e.target.files) {
                await this._opfs.uploadFile(f);
                this._notify(`✓ ${f.name} importé`, 'green');
            };
         
        } catch (e) {
            this._notify("⚠ Échec de l'import : " + e.message, 'red');
        } finally {
            await this._render();
        }
    }

    async _createNewFile() {
        const name = await this._dialog.prompt(
            'Nom du fichier (ex: notes.txt) :', 'fichier.txt'
        );
        if (!name) return;
        try {
            await this._opfs.createFile(name);
            await this._render();
        } catch (e) {
            this._notify('⚠ Impossible de créer : ' + e.message, 'red');
        }
    }

    async _createNewFolder() {
        const name = await this._dialog.prompt('Nom du dossier :', 'nouveau-dossier');
        if (!name) return;
        try {
            await this._opfs.createFolder(name);
            await this._render();
        } catch (e) {
            this._notify('⚠ Impossible de créer : ' + e.message, 'red');
        }
    }

    async _deleteEntry(name) {
        const ok = await this._dialog.confirm(`Supprimer "${name}" ?`);
        if (!ok) return;
        try {
            await this._opfs.deleteEntry(name);
            await this._render();
        } catch (e) {
            this._notify('⚠ Impossible de supprimer : ' + e.message, 'red');
        }
    }

    async _renameEntry(oldName) {
        // For rec_ files: split into editable prefix and locked timestamp+ext suffix.
        // Pattern: rec_YYYY-MM-DD_HH-MM-SS.webm
        //   → prefix  = "rec"  (user edits this)
        //   → suffix  = "_2026-03-06_14-23-07.webm"  (always preserved)
        const tsMatch = oldName.match(
            /^(.+?)(_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\w+)$/
        );

        let prefill, suffix;
        if (tsMatch) {
            prefill = tsMatch[1];   // e.g. "rec"
            suffix = tsMatch[2];   // e.g. "_2026-03-06_14-23-07.webm"
        } else {
            prefill = oldName;
            suffix = '';
        }

        const hint = suffix
            ? `Renommer "${oldName}" :\n(horodatage préservé automatiquement)`
            : `Renommer "${oldName}" :`;

        const userInput = await this._dialog.prompt(hint, 'nouveau-nom', prefill);
        if (!userInput) return;

        const newName = userInput + suffix;
        if (newName === oldName) return;

        try {
            await this._opfs.renameEntry(oldName, newName);
            await this._render();
        } catch (e) {
            this._notify('⚠ Impossible de renommer : ' + e.message, 'red');
        }
    }

    async _downloadFile(name) {
        try {
            const file = await this._opfs.getFile(name);
            const url = this._urlRegistry.create(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
            setTimeout(() => this._urlRegistry.revoke(url), 10_000);
        } catch (e) {
            this._notify('⚠ Échec du téléchargement : ' + e.message, 'red');
        }
    }

    // ── Notifications ──────────────────────────────────────────────────
    _notify(message, type = 'green') {
        const list = this.shadowRoot.getElementById('file-list');
        const li = document.createElement('li');
        li.className = 'notif';
        li.style.color = type === 'green' ? 'var(--green)' : 'var(--red)';
        li.style.background = type === 'green'
            ? 'rgba(22,163,74,0.07)'
            : 'rgba(220,38,38,0.07)';
        li.textContent = message;
        list.prepend(li);
        setTimeout(() => {
            li.style.transition = 'opacity 0.4s';
            li.style.opacity = '0';
            setTimeout(() => li.remove(), 400);
        }, 4600);
    }
}

function main() {


    // Initialise document-level drop zone wiring (singleton guard inside)
    DropZoneController.init();

    // Register — guard against double-registration
    if (!customElements.get('audio-explorer')) {
        customElements.define('audio-explorer', AudioExplorer);
    }

}

main()
