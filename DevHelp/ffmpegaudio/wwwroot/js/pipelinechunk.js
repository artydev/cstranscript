(function () {

    // ── CONFIG ────────────────────────────────────────────────────────────────
    const CHUNK_SIZE_MB = 10;
    const CHUNK_SIZE = CHUNK_SIZE_MB * 1024 * 1024;  // 10 MB raw — FFmpeg re-encode côté serveur
    const CHUNK_LIMIT = 12 * 1024 * 1024;             // seuil bascule HTMX → pipeline JS (< IIS 15 MB)
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
    // Fichier >= 12 MB → pipeline chunk JS
    // Fichier <  12 MB → HTMX continue (POST direct, en dessous de la limite IIS)
    form.addEventListener('htmx:confirm', e => {
        const file = fileInput.files[0];
        if (file && file.size >= CHUNK_LIMIT) {
            e.preventDefault();
            lancerPipelineChunk(file);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GÉNÉRATEUR — Blob.slice() synchrone, zéro copie
    //
    // Découpe le fichier en chunks bruts sans jamais charger le fichier entier
    // en mémoire. Le re-encodage (mono 16 kHz WAV) est délégué à FFmpeg
    // côté serveur. total est calculé en amont depuis file.size — pas besoin
    // de matérialiser les chunks pour le connaître.
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
    //
    // Yield chaque payload data: reçu sur le flux.
    // Le finally garantit releaseLock() même en cas d'exception ou de break.
    // Flush du buffer résiduel si le flux se termine sans \n\n final.
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
    // Deux canaux SSE coexistent :
    //  • sseUrl (par chunk)  — court-lived, progression en temps réel
    //  • sessionSseUrl       — long-lived, texte final recombine
    //
    // Les chunks sont envoyés un par un (séquentiel) — un seul fetch en vol
    // à la fois, naturellement rate-limité par l'await du SSE chunk.
    // ─────────────────────────────────────────────────────────────────────────
    async function lancerPipelineChunk(file) {
        const sessionId = crypto.randomUUID();

        submitBtn.disabled = true;
        chunkLoading.style.display = 'block';
        setProgress(0, 0);
        output.innerHTML = progression(0, '?');

        let sessionSsePromise = null;

        try {
            for (const { blob, index, total } of slicerFichier(file, CHUNK_SIZE)) {

                // Premier chunk — on connaît total, on initialise la progression
                if (index === 0) {
                    setProgress(0, total);
                    output.innerHTML = progression(0, total);
                }

                chunkLabel.textContent = `Envoi chunk ${index + 1}/${total}...`;

                // ── 1. POST du chunk brut (FFmpeg re-encode côté serveur) ─────
                const formData = new FormData();
                formData.append('AudioFile', blob, `chunk_${index}${extOf(file.name)}`);
                formData.append('index', index);
                formData.append('total', total);
                formData.append('sessionId', sessionId);

                const postRes = await fetch(`${BASE_URL}/transcribe-chunk`, {
                    method: 'POST',
                    body: formData,
                });

                if (!postRes.ok) {
                    const msg = await postRes.text();
                    output.innerHTML = erreur(`HTTP ${postRes.status} chunk ${index + 1} : ${msg}`);
                    continue;
                }

                const { sseUrl, sessionSseUrl } = await postRes.json();

                // ── 2. Ouvrir le canal de session une seule fois (index === 0) ─
                if (index === 0) {
                    sessionSsePromise = lireSessionSSE(sessionSseUrl);
                }

                // ── 3. Écouter le SSE de ce chunk (progression temps réel) ────
                chunkLabel.textContent = `Transcription chunk ${index + 1}/${total}...`;
                const sseRes = await fetch(sseUrl);

                for await (const html of lireSSE(sseRes)) {
                    output.innerHTML = html;
                }

                setProgress(index + 1, total);

                if (index < total - 1)
                    output.innerHTML = progression(index + 1, total);
            }

            // ── 4. Attendre le texte final recombiné via le canal de session ──
            if (sessionSsePromise !== null) {
                chunkLabel.textContent = 'Recombinaison en cours...';
                await sessionSsePromise;
            }

        } catch (err) {
            output.innerHTML = erreur(`Erreur pipeline : ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            chunkLoading.style.display = 'none';
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LECTURE DU CANAL SSE DE SESSION
    // ─────────────────────────────────────────────────────────────────────────
    async function lireSessionSSE(sessionSseUrl) {
        const sseRes = await fetch(sessionSseUrl);
        for await (const html of lireSSE(sseRes)) {
            output.innerHTML = html;
        }
    }

    // ── HELPERS UI ────────────────────────────────────────────────────────────
    function setProgress(done, total) {
        chunkProgress.value = total > 0 ? Math.round((done / total) * 100) : 0;
    }

    function progression(done, total) {
        return `<p style="color:#555;font-style:italic;">
                    Chunk ${done}/${total} traité — transcription en cours...
                </p>`;
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