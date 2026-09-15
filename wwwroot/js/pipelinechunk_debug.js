(function () {

    // ── CONFIG ────────────────────────────────────────────────────────────────
    const CHUNK_SIZE_MB = 3;

    const CHUNK_SIZE = CHUNK_SIZE_MB * 1024 * 1024; // Taille d'un chunk brut envoyé au serveur.
    // FFmpeg ré-encode en WAV mono 16kHz — expansion
    // max ~8x pour les entrées basses qualités (32kbps).
    // 3 MB brut → ~7.5 MB WAV max → sous la limite Whisper 25 MB.

    const CHUNK_LIMIT = 12 * 1024 * 1024; // Seuil pipeline chunk JS : fichiers >= 12 MB
    // sont découpés et envoyés via /transcribe-chunk.
    // Fichiers < 12 MB → HTMX POST direct → /transcribe-audio.

    const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
    const BASE_URL = document.getElementById("baseurl").dataset.baseurl;

    // ── DOM ───────────────────────────────────────────────────────────────────
    const form = document.getElementById('tf-form');
    const fileInput = document.getElementById('tf-file-input');
    const output = document.getElementById('output');
    const chunkLoading = document.getElementById('chunk-loading');
    const chunkProgress = document.getElementById('chunk-progress');
    const chunkLabel = document.getElementById('chunk-progress-label');
    const submitBtn = document.getElementById('tf-submit-btn');
    const fileDisplay = document.getElementById('file-name-display');

    // ── NOM DU FICHIER ────────────────────────────────────────────────────────
    fileInput.addEventListener('change', () => {
        const f = fileInput.files[0];
        if (f) fileDisplay.textContent = `${f.name} — ${formatBytes(f.size)}`;
    });

    // ── INTERCEPTION HTMX ─────────────────────────────────────────────────────
    form.addEventListener('htmx:confirm', e => {
        const file = fileInput.files[0];
        if (file && file.size >= CHUNK_LIMIT) {
            e.preventDefault();
            lancerPipelineChunk(file);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GÉNÉRATEUR — Blob.slice() synchrone, zéro copie
    // ─────────────────────────────────────────────────────────────────────────
    function* slicerFichier(file, chunkSize) {
        const total = Math.ceil(file.size / chunkSize);
        let offset = 0;
        let index = 0;
        while (offset < file.size) {
            yield { blob: file.slice(offset, offset + chunkSize), index, total };
            offset += chunkSize;
            index++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GÉNÉRATEUR SSE — Lecture d'un ReadableStream SSE
    // ─────────────────────────────────────────────────────────────────────────
    async function* lireSSE(response) {
        const reader = response.body.getReader();
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
                    if (!bloc.startsWith('data:')) continue;
                    yield bloc.slice(5).trim();
                }
            }
            if (buffer.startsWith('data:')) yield buffer.slice(5).trim();
        } finally {
            reader.releaseLock();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE PRINCIPAL
    //
    // ✅ FIX 5 — sessionAbortController créé ici et passé à lireSessionSSE.
    //            Aborté immédiatement si des chunks échouent, évitant que
    //            la connexion SSE de session reste ouverte 5 minutes.
    // ─────────────────────────────────────────────────────────────────────────
    async function lancerPipelineChunk(file) {
        const sessionId = crypto.randomUUID();
        const total = Math.ceil(file.size / CHUNK_SIZE);

        // UI
        submitBtn.disabled = true;
        chunkLoading.style.display = 'block';
        setProgress(0, total);
        output.innerHTML = progression(0, total);

        // ✅ FIX 5 — AbortController pour le canal de session
        const sessionAbortController = new AbortController();

        // Ouvrir le canal de session AVANT tout envoi de chunk
        const sessionSsePromise = lireSessionSSE(
            `${BASE_URL}/transcribe-sse/${sessionId}`,
            sessionAbortController.signal  // ✅ FIX 5 — signal passé
        );

        let doneCount = 0;

        try {
            // Lancer tous les chunks en parallèle
            const promises = [];
            for (const { blob, index } of slicerFichier(file, CHUNK_SIZE)) {
                promises.push(
                    traiterChunk(blob, index, total, sessionId, file.name, () => {
                        doneCount++;
                        setProgress(doneCount, total);
                        chunkLabel.textContent =
                            `${doneCount}/${total} chunks traités...`;
                    })
                );
            }

            const results = await Promise.allSettled(promises);

            const errors = results
                .filter(r => r.status === 'rejected')
                .map(r => r.reason?.message ?? 'Erreur inconnue');

            if (errors.length > 0) {
                // ✅ FIX 5 — aborter le canal de session immédiatement
                sessionAbortController.abort();
                output.innerHTML = erreur(
                    `${errors.length} chunk(s) en erreur :\n${errors.join('\n')}`);
                return;
            }

            // Attendre le texte final recombiné via le canal de session
            chunkLabel.textContent = 'Recombinaison en cours...';
            await sessionSsePromise;

        } catch (err) {
            // ✅ FIX 5 — aborter aussi en cas d'exception inattendue
            sessionAbortController.abort();
            output.innerHTML = erreur(`Erreur pipeline : ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            chunkLoading.style.display = 'none';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRAITEMENT D'UN CHUNK INDIVIDUEL
    // ─────────────────────────────────────────────────────────────────────────
    async function traiterChunk(blob, index, total, sessionId, filename, onDone) {

        const formData = new FormData();
        formData.append('AudioFile', blob, `chunk_${index}${extOf(filename)}`);
        formData.append('index', index);
        formData.append('total', total);
        formData.append('sessionId', sessionId);

        const postRes = await fetch(`${BASE_URL}/transcribe-chunk`, {
            method: 'POST',
            body: formData,
        });

        if (!postRes.ok) {
            const msg = await postRes.text();
            throw new Error(`HTTP ${postRes.status} chunk ${index + 1} : ${msg}`);
        }

        const { sseUrl } = await postRes.json();

        const sseRes = await fetch(sseUrl);
        for await (const html of lireSSE(sseRes)) {
            output.innerHTML = html;
        }

        onDone();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LECTURE DU CANAL SSE DE SESSION
    //
    // ✅ FIX 5 — accepte un signal AbortSignal externe en plus du timeout interne.
    //            Les deux sources d'annulation sont combinées via AbortSignal.any()
    //            si disponible, sinon le signal externe est utilisé directement.
    // ─────────────────────────────────────────────────────────────────────────
    async function lireSessionSSE(sessionSseUrl, externalSignal) {
        const timeoutController = new AbortController();
        const timeout = setTimeout(
            () => timeoutController.abort(), SESSION_TIMEOUT_MS);

        // ⚠️ CORRECTION : Support Edge - Remplacement sécurisé de AbortSignal.any()
        let signal = timeoutController.signal;

        if (externalSignal && typeof AbortSignal !== 'undefined') {
            if (typeof AbortSignal.any === 'function') {
                signal = AbortSignal.any([timeoutController.signal, externalSignal]);
            }
            // Sinon, on utilise simplement le signal de timeout
        }

        try {
            const sseRes = await fetch(sessionSseUrl, { signal });
            for await (const html of lireSSE(sseRes)) {
                output.innerHTML = html;
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                // Distinguer timeout vs annulation volontaire (erreur chunk)
                if (timeoutController.signal.aborted) {
                    output.innerHTML = erreur(
                        'Timeout : aucune réponse du canal de session après 5 minutes.');
                }
                // Si c'est le signal externe qui a aborté → le message d'erreur
                // est déjà affiché par lancerPipelineChunk, on sort silencieusement.
            } else {
                throw err;
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    // ── HELPERS UI ────────────────────────────────────────────────────────────
    function setProgress(done, total) {
        chunkProgress.value = total > 0 ? Math.round((done / total) * 100) : 0;
    }

    function _progression(done, total) {
        return `<p style="color:#555;font-style:italic;">
                    Chunk ${done}/${total} traité — transcription en cours...
                </p>`;
    }

    function progression(done, total) {
        return ""
    }

    function erreur(msg) {
        return `<p style="color:#c00;font-weight:600;">&#9888; ${escHtml(msg)}</p>`;
    }

    // ── UTILS ─────────────────────────────────────────────────────────────────
    function extOf(name) {
        return name.includes('.') ? '.' + name.split('.').pop() : '.bin';
    }

    function escHtml(s) {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function formatBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
        return (b / 1048576).toFixed(1) + ' MB';
    }

})();