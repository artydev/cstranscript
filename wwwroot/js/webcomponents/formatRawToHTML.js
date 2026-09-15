

function formatRawTextToHTML(rawText) {
    // 1️⃣ Normalize whitespace
    let text = rawText.replace(/\s+/g, " ").trim();

    // 2️⃣ Fix missing punctuation between sentences
    text = text.replace(
        /([a-zàâéèêëïîôùûç])\s([A-ZÀÂÉÈÊËÏÎÔÙÛÇ])/g,
        "$1. $2"
    );

    // 3️⃣ Detect chapters and mark them
    text = text.replace(/(Chapitre\s+\d+)/gi, "\n\n## $1\n\n");

    // 4️⃣ Split into sentences using compromise
    const doc = nlp(text);
    const sentences = doc.sentences().out("array");

    // 5️⃣ Smart paragraph grouping
    const paragraphs = [];
    let current = [];

    sentences.forEach((s, i) => {
        current.push(s);

        // Break paragraph if keyword is at start, or every 4 sentences, or last sentence
        if (/^(Cependant|Mais|Enfin)/.test(s) || current.length >= 4 || i === sentences.length - 1) {
            paragraphs.push(current.join(" "));
            current = [];
        }
    });

    // 6️⃣ Convert to HTML
    const html = paragraphs
        .map(p => {
            if (p.startsWith("##")) {
                return `<h2>${p.replace("##", "").trim()}</h2>`;
            }
            return `<p>${p}</p>`;
        })
        .join("\n");

    return html;
}
