/**
 * app.js — remplace HTMX, l'extension htmx-sse et pipelinechunk.js.
 *
 * Deux chemins d'envoi :
 *   fichier  < 12 Mo : POST /transcribe-audio  (un seul envoi)
 *   fichier >= 12 Mo : Blob.slice() -> n POST /transcribe-chunk en parallèle,
 *                      recombinaison côté serveur, texte final poussé sur le
 *                      canal SSE de session.
 *
 * Le suivi temps réel passe par fetch + lecture manuelle du flux SSE
 * (et non EventSource, qui se reconnecte tout seul en fin de flux).
 */
(function () {
    'use strict';

    // ── Configuration ─────────────────────────────────────────────────────
    const CHUNK_SIZE_MB = 3;
    const CHUNK_SIZE = CHUNK_SIZE_MB * 1024 * 1024;
    const CHUNK_LIMIT = 12 * 1024 * 1024;   // seuil de bascule vers la découpe
    const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

    /**
     * Base de l'API.
     * <meta name="api-base" content="/transcript"> gagne si elle est renseignée.
     * Sinon on déduit du chemin : /index.html -> "", /transcript/ -> "/transcript".
     */
    const API_BASE = (function () {
        const meta = document.querySelector('meta[name="api-base"]');
        const forced = meta && meta.content.trim();
        if (forced) return forced.replace(/\/+$/, '');
        return location.pathname.replace(/\/[^/]*$/, '').replace(/\/+$/, '');
    })();

    const url = (path) => `${API_BASE}${path}`;

    // ── DOM ───────────────────────────────────────────────────────────────
    const form = document.getElementById('tf-form');
    const fileInput = document.getElementById('tf-file-input');
    const dropZone = document.getElementById('tf-drop');
    const submitBtn = document.getElementById('tf-submit-btn');
    const fileDisplay = document.getElementById('file-name-display');
    const uploadLoading = document.getElementById('upload-loading');
    const chunkLoading = document.getElementById('chunk-loading');
    const chunkProgress = document.getElementById('chunk-progress');
    const chunkLabel = document.getElementById('chunk-progress-label');

    const view = window.TranscriptionRender;

    // ── Sélection du fichier ──────────────────────────────────────────────
    fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (!f) {
            fileDisplay.textContent = '';
            setState(null);
            return;
        }
        fileDisplay.textContent = `${f.name} — ${formatBytes(f.size)}`;
        setState('file-state-ready');
    });

    // Glisser-déposer sur la zone
    ['dragenter', 'dragover'].forEach(evt =>
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.add('is-dragover');
        }));

    ['dragleave', 'drop'].forEach(evt =>
        dropZone.addEventListener(evt, e => {
            e.preventDefault();
            dropZone.classList.remove('is-dragover');
        }));

    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // ── Soumission ────────────────────────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            view.renderError('Sélectionnez un fichier audio avant de lancer la transcription.');
            return;
        }

        view.reset();
        submitBtn.disabled = true;
        setState('file-state-uploading');

        try {
            if (file.size >= CHUNK_LIMIT) {
                await envoyerParMorceaux(file);
            } else {
                await envoyerFichierComplet(file);
            }
        } catch (err) {
            setState('file-state-error');
            view.renderError(err.message);
        } finally {
            submitBtn.disabled = false;
            show(uploadLoading, false);
            show(chunkLoading, false);
        }
    });

    // ──────────────────────────────────────────────────────────────────────
    //  CHEMIN 1 — fichier complet
    // ──────────────────────────────────────────────────────────────────────
    async function envoyerFichierComplet(file) {
        show(uploadLoading, true);

        const body = new FormData();
        body.append('AudioFile', file, file.name);

        const res = await fetch(url('/transcribe-audio'), { method: 'POST', body });
        if (!res.ok) {
            throw new Error(`Envoi refusé (HTTP ${res.status}) : ${await res.text()}`);
        }

        const sseUrl = await extraireSseUrl(res);
        show(uploadLoading, false);
        setState('file-state-queued');

        view.render({
            message: 'Fichier reçu. Connexion au flux de traitement…',
            isProcessing: true,
            isError: false
        });

        await consommerSse(sseUrl);
    }

    // ──────────────────────────────────────────────────────────────────────
    //  CHEMIN 2 — découpe en morceaux
    // ──────────────────────────────────────────────────────────────────────
    async function envoyerParMorceaux(file) {
        const sessionId = crypto.randomUUID();
        const total = Math.ceil(file.size / CHUNK_SIZE);

        show(chunkLoading, true);
        setProgress(0, total);
        chunkLabel.textContent = `0/${total} morceaux traités…`;

        // Le canal de session doit être ouvert AVANT le premier envoi.
        const sessionAbort = new AbortController();
        const sessionDone = lireCanalSession(
            url(`/transcribe-sse/${sessionId}`), sessionAbort.signal);

        let done = 0;
        const tasks = [];

        for (const { blob, index } of decouper(file, CHUNK_SIZE)) {
            tasks.push(traiterMorceau(blob, index, total, sessionId, file.name, () => {
                done++;
                setProgress(done, total);
                chunkLabel.textContent = `${done}/${total} morceaux traités…`;
            }));
        }

        const results = await Promise.allSettled(tasks);
        const errors = results
            .filter(r => r.status === 'rejected')
            .map(r => r.reason?.message ?? 'Erreur inconnue');

        if (errors.length > 0) {
            sessionAbort.abort();               // ne pas laisser le canal ouvert 5 min
            throw new Error(
                `${errors.length} morceau(x) en échec :\n${errors.join('\n')}`);
        }

        setState('file-state-queued');
        chunkLabel.textContent = 'Recombinaison en cours…';
        await sessionDone;
    }

    function* decouper(file, taille) {
        const total = Math.ceil(file.size / taille);
        let offset = 0, index = 0;
        while (offset < file.size) {
            yield { blob: file.slice(offset, offset + taille), index, total };
            offset += taille;
            index++;
        }
    }

    async function traiterMorceau(blob, index, total, sessionId, filename, onDone) {
        const body = new FormData();
        body.append('AudioFile', blob, `chunk_${index}${extensionDe(filename)}`);
        body.append('index', index);
        body.append('total', total);
        body.append('sessionId', sessionId);

        const res = await fetch(url('/transcribe-chunk'), { method: 'POST', body });
        if (!res.ok) {
            throw new Error(
                `morceau ${index + 1} — HTTP ${res.status} : ${await res.text()}`);
        }

        const { sseUrl } = await res.json();
        await consommerSse(sseUrl);
        onDone();
    }

    async function lireCanalSession(sessionUrl, externalSignal) {
        const timeoutCtl = new AbortController();
        const timer = setTimeout(() => timeoutCtl.abort(), SESSION_TIMEOUT_MS);

        const signal = typeof AbortSignal.any === 'function'
            ? AbortSignal.any([timeoutCtl.signal, externalSignal])
            : externalSignal;

        try {
            await consommerSse(sessionUrl, { signal });
        } catch (err) {
            if (err.name !== 'AbortError') throw err;
            // Timeout : on le signale. Abandon volontaire (morceau en échec) :
            // le message d'erreur est déjà affiché par l'appelant.
            if (timeoutCtl.signal.aborted) {
                view.renderError(
                    'Aucune réponse du serveur après 5 minutes. Relancez la transcription.');
            }
        } finally {
            clearTimeout(timer);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    //  SSE — lecture du flux et rendu
    // ──────────────────────────────────────────────────────────────────────
    async function consommerSse(sseUrl, options = {}) {
        const res = await fetch(sseUrl, {
            headers: { Accept: 'text/event-stream' },
            signal: options.signal
        });

        if (!res.ok || !res.body) {
            throw new Error(`Flux de suivi indisponible (HTTP ${res.status}).`);
        }

        for await (const payload of lireEvenements(res.body)) {
            afficher(payload);
        }
    }

    async function* lireEvenements(stream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const blocs = buffer.split('\n\n');
                buffer = blocs.pop();

                for (const bloc of blocs) {
                    const data = extraireData(bloc);
                    if (data !== null) yield data;
                }
            }
            const reste = extraireData(buffer);
            if (reste !== null) yield reste;
        } finally {
            reader.releaseLock();
        }
    }

    // Un bloc SSE peut contenir plusieurs lignes `data:` à concaténer.
    function extraireData(bloc) {
        const lignes = bloc.split('\n')
            .filter(l => l.startsWith('data:'))
            .map(l => l.slice(5).trimStart());
        return lignes.length ? lignes.join('\n') : null;
    }

    /**
     * Le serveur doit pousser du JSON : { message, isError, isProcessing }.
     * Tant que le backend Razor n'est pas migré, on accepte encore du HTML.
     */
    function afficher(payload) {
        const trimmed = payload.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('{')) {
            try {
                view.render(JSON.parse(trimmed));
                return;
            } catch { /* charge utile mal formée : on tombe dans le repli */ }
        }
        view.renderRawHtml(trimmed);
    }

    // ── Compatibilité ascendante avec les réponses HTML ───────────────────
    // Le backend actuel renvoie le composant SseBridge rendu. On y lit
    // l'attribut sse-connect. Une fois le backend migré, il renvoie
    // simplement { "sseUrl": "..." }.
    async function extraireSseUrl(res) {
        const type = res.headers.get('content-type') || '';
        const texte = await res.text();

        if (type.includes('application/json')) {
            const data = JSON.parse(texte);
            if (data.sseUrl) return data.sseUrl;
        }

        const trouve = texte.match(/sse-connect="([^"]+)"/);
        if (trouve) return trouve[1];

        throw new Error("Le serveur n'a pas renvoyé d'URL de suivi.");
    }

    // ── Indicateurs d'état ────────────────────────────────────────────────
    const STATES = [
        'file-state-ready',
        'file-state-uploading',
        'file-state-queued',
        'file-state-error'
    ];

    function setState(state) {
        if (!fileDisplay) return;
        fileDisplay.classList.remove(...STATES);
        if (state) fileDisplay.classList.add(state);
    }

    function show(el, visible) {
        if (el) el.classList.toggle('is-active', visible);
    }

    function setProgress(done, total) {
        chunkProgress.value = total > 0 ? Math.round((done / total) * 100) : 0;
    }

    // ── Utilitaires ───────────────────────────────────────────────────────
    function extensionDe(name) {
        return name.includes('.') ? '.' + name.split('.').pop() : '.bin';
    }

    function formatBytes(b) {
        if (b < 1024) return `${b} o`;
        if (b < 1048576) return `${(b / 1024).toFixed(1)} Ko`;
        return `${(b / 1048576).toFixed(1)} Mo`;
    }
})();
