/**
 * render.js — remplace Components/TranscriptionResult.razor
 *
 * Le serveur n'envoie plus de HTML : il pousse un objet JSON sur le canal SSE.
 *   { "message": "...", "isError": false, "isProcessing": true }
 *
 * Ce module transforme cet objet en DOM. Aucun style en ligne : tout vit
 * dans css/transcription.css.
 */
window.TranscriptionRender = (function () {

    const OUTPUT_ID = 'output';

    function output() {
        return document.getElementById(OUTPUT_ID);
    }

    function clear(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    function spinner(bars) {
        const s = document.createElement('div');
        s.className = 'tf-spinner';
        for (let i = 0; i < (bars || 4); i++) s.appendChild(document.createElement('span'));
        return s;
    }

    // ── État : erreur ─────────────────────────────────────────────────────
    function viewError(message) {
        const box = document.createElement('div');
        box.className = 'tf-error-container';

        const p = document.createElement('p');
        p.className = 'tf-error';

        const icon = document.createElement('span');
        icon.className = 'tf-error-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '\u26A0\uFE0F';

        const text = document.createElement('span');
        text.textContent = message;

        p.append(icon, text);
        box.appendChild(p);
        return box;
    }

    // ── État : traitement en cours ────────────────────────────────────────
    // L'étape est déduite du message, comme le faisait le composant Razor.
    const STEPS = [
        { match: 'initialisation', mod: 'init' },
        { match: 'conversion', mod: 'convert' },
        { match: 'transcription', mod: 'transcribe' },
        { match: 'finalisation', mod: 'finalize' },
        { match: 'mise en forme', mod: 'format' }
    ];

    function stepModifier(message) {
        const lower = (message || '').toLowerCase();
        const found = STEPS.find(s => lower.includes(s.match));
        return found ? found.mod : 'default';
    }

    function viewProcessing(message) {
        const box = document.createElement('div');
        box.className = 'tf-loading-status';

        const p = document.createElement('p');
        p.className = 'tf-step tf-step--' + stepModifier(message);
        p.textContent = message;

        box.append(spinner(4), p);
        return box;
    }

    // ── État : résultat final ─────────────────────────────────────────────
    function viewResult(message) {
        const box = document.createElement('div');
        box.className = 'tf-result-ready';

        const head = document.createElement('div');
        head.className = 'tf-result-head';

        const title = document.createElement('h3');
        title.className = 'tf-output-label';
        title.innerHTML =
            '<svg class="tf-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" ' +
            'd="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 ' +
            '5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>';
        title.append(document.createTextNode('Transcription terminée'));

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'tf-copy-btn';
        copy.dataset.action = 'copy-transcription';
        copy.textContent = 'Copier le texte';

        head.append(title, copy);

        const text = document.createElement('div');
        text.className = 'tf-result-text';
        text.id = 'final-text';
        // Le serveur renvoie du texte brut ; les sauts de ligne sont conservés
        // par la règle CSS white-space: pre-wrap.
        text.textContent = message;

        box.append(head, text);
        return box;
    }

    // ── Point d'entrée ────────────────────────────────────────────────────
    /*
     * En mode découpé, le canal de session et les canaux de morceaux écrivent
     * dans la même zone. Si le texte recombiné arrive pendant qu'un morceau
     * pousse encore sa progression, il serait écrasé. Ce verrou fige donc
     * l'affichage dès qu'un état final (résultat ou erreur) est rendu ;
     * reset() le relâche au lancement suivant.
     */
    let verrouille = false;

    function reset() {
        verrouille = false;
    }

    function render(state) {
        const el = output();
        if (!el) return;

        const message = state.message ?? '';
        const final = !state.isProcessing;

        if (verrouille && !final) return;

        let node;
        if (state.isError) node = viewError(message);
        else if (state.isProcessing) node = viewProcessing(message);
        else node = viewResult(message);

        clear(el);
        el.appendChild(node);

        if (final) verrouille = true;
    }

    function renderError(message) {
        render({ message, isError: true, isProcessing: false });
    }

    function renderPlaceholder(message) {
        const el = output();
        if (!el) return;
        clear(el);
        const p = document.createElement('p');
        p.className = 'tf-placeholder';
        p.textContent = message;
        el.appendChild(p);
    }

    // Repli : si le serveur pousse encore du HTML (ancienne version Razor),
    // on l'injecte tel quel plutôt que de casser l'affichage.
    function renderRawHtml(html) {
        if (verrouille) return;
        const el = output();
        if (el) el.innerHTML = html;
    }

    // ── Copie dans le presse-papier (délégation, un seul écouteur) ─────────
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="copy-transcription"]');
        if (!btn) return;

        const target = document.getElementById('final-text');
        if (!target) return;

        try {
            await navigator.clipboard.writeText(target.innerText);
            const original = btn.textContent;
            btn.textContent = 'Copié';
            btn.classList.add('is-copied');
            setTimeout(() => {
                btn.textContent = original;
                btn.classList.remove('is-copied');
            }, 2000);
        } catch {
            btn.textContent = 'Copie impossible';
            setTimeout(() => { btn.textContent = 'Copier le texte'; }, 2000);
        }
    });

    return { render, reset, renderError, renderPlaceholder, renderRawHtml };
})();
