using TranscriptAudio.Components;
using HtmxRazorWhisper;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using System.Net;
using System.Net.Http.Headers;
using TranscriptAudio.Services;
using TranscriptAudio.Config;


var builder = WebApplication.CreateBuilder(args);

// 1. CONFIGURATION DES LIMITES DE FICHIERS (100 MO)
// ─────────────────────────────────────────────────────────────────────────────
const long MaxFileSize = 100 * 1024 * 1024; // 100 MO

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestBodySize = MaxFileSize + (1024 * 1024);
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = MaxFileSize + (1024 * 1024);
});

builder.Services.Configure<WhisperConfig>(builder.Configuration.GetSection("Whisper"));

builder.Services.Configure<TranscriptAudio.Config.ProxyConfig>(builder.Configuration.GetSection("Proxy"));



// 2. ENREGISTREMENT DES SERVICES (DI)
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddRazorPages();
builder.Services.AddRazorComponents();
builder.Services.AddTransient<HtmlRenderer>();


// Services métiers
builder.Services.AddSingleton<TranscriptionStatusTracker>();
builder.Services.AddSingleton<TranscriptAudio.Services.WhisperService>();

// Configuration du client API Albert (Whisper)
// http://100.78.64.201:8003/
builder.Services.AddHttpClient("Whisper", (sp, client) =>
{
    var config = sp.GetRequiredService<IOptions<WhisperConfig>>().Value;

    var urlApi = config.ApiTranscript ?? throw new InvalidOperationException("API URL manquante");
    var apiKey = config.ApiKey ?? throw new InvalidOperationException("API Key manquante");

    client.BaseAddress = new Uri(urlApi);
    client.Timeout = TimeSpan.FromMinutes(15);
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
}).ConfigurePrimaryHttpMessageHandler(sp =>
{
    var proxyCfg = sp.GetRequiredService<IOptions<ProxyConfig>>().Value;

    if (proxyCfg.UseProxy && !string.IsNullOrWhiteSpace(proxyCfg.Url))
    {
        return new HttpClientHandler
        {
            Proxy = new WebProxy(proxyCfg.Url),
            UseProxy = true
        };
    }

    return new HttpClientHandler(); // No proxy
});

var app = builder.Build();

app.UsePathBase("/transcript");

app.UseStaticFiles();
app.UseRouting();
app.MapRazorComponents<App>().DisableAntiforgery();
app.MapRazorPages();

// 4. ENDPOINTS (LOGIQUE MÉTIER)
// ─────────────────────────────────────────────────────────────────────────────

// --- GET : FLUX SSE (Push temps réel) ---
// Ce même endpoint sert les deux types de canaux SSE :
//   • /transcribe-sse/{chunkId}   → progression d'un chunk individuel
//   • /transcribe-sse/{sessionId} → texte final recombiné (canal long-lived)
app.MapGet("/transcribe-sse/{id:guid}", async (Guid id, TranscriptionStatusTracker tracker, HttpContext context) =>
{

    context.Response.StatusCode = StatusCodes.Status200OK;
    context.Response.Headers.ContentType = "text/event-stream";
    context.Response.Headers.Append("X-Accel-Buffering", "no");


    var reader = tracker.Subscribe(id);
    try
    {
        await foreach (var html in reader.ReadAllAsync(context.RequestAborted))
        {
            // Nettoyage du HTML pour le protocole SSE (pas de retours à la ligne dans data:)
            var cleanHtml = html.Replace("\n", "").Replace("\r", "");
            await context.Response.WriteAsync($"data: {cleanHtml}\n\n").ConfigureAwait(false);
            await context.Response.Body.FlushAsync().ConfigureAwait(false);
        }
    }
    finally
    {
        tracker.Unsubscribe(id);
    }
});

// --- POST : UPLOAD (Réception et mise en file d'attente) ---
app.MapPost("/transcribe-audio", async (
    HttpRequest req,
    WhisperService whisper,
    HtmlRenderer renderer, // Injecté ici
    IWebHostEnvironment env) =>
{
    var form = await req.ReadFormAsync().ConfigureAwait(false);
    var file = form.Files.GetFile("AudioFile");
    if (file == null) return Results.BadRequest("Aucun fichier reçu.");

    var id = Guid.NewGuid();
    var tempPath = Path.Combine(Path.GetTempPath(), $"whisper_{id}.tmp");

    using (var fs = new FileStream(tempPath, FileMode.Create, FileAccess.Write, FileShare.None))
    {
        await file.CopyToAsync(fs).ConfigureAwait(false);
    }

    await whisper.EnqueueTranscriptionAsync(tempPath, file.FileName, file.ContentType, id).ConfigureAwait(false);

    // Calcul de l'URL
    var sseBase = env.EnvironmentName == "Localhost" ? "" : "/transcript";
    var sseUrl = $"{sseBase}/transcribe-sse/{id}";

    // --- RENDU VIA COMPOSANT BLAZOR ---
    var html = await renderer.Dispatcher.InvokeAsync(async () =>
    {
        var output = await renderer.RenderComponentAsync<TranscriptionSseBridge>(
            ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                { nameof(TranscriptionSseBridge.SseUrl), sseUrl },
                { nameof(TranscriptionSseBridge.Message), "Fichier reçu. Connexion au flux de traitement..." }
            })).ConfigureAwait(false);

        return output.ToHtmlString();
    }).ConfigureAwait(false);

    return Results.Content(html, "text/html");

}).DisableAntiforgery();


// --- POST : CHUNK (Fichiers > 25 MB découpés côté browser via Blob.slice()) ---
// Reçoit un chunk à la fois. La recombinaison des textes partiels
// est faite côté serveur dans WhisperService.TraiterChunkTranscritAsync.
// Quand tous les chunks sont reçus, le texte final est poussé via
// le canal SSE de session (sessionSseUrl) que le browser maintient ouvert.
app.MapPost("/transcribe-chunk", async (HttpRequest req,
    WhisperService whisper,
    HtmlRenderer renderer,
    IWebHostEnvironment env) =>
{
    var form = await req.ReadFormAsync().ConfigureAwait(false);

    var file = form.Files.GetFile("AudioFile");  // ✅ matches JS formData.append('AudioFile', ...)

    if (file is null)
        return Results.BadRequest("Chunk manquant");

    if (!int.TryParse(form["index"], out var index) ||
        !int.TryParse(form["total"], out var total) ||
        !Guid.TryParse(form["sessionId"], out var sessionId))
        return Results.BadRequest("Paramètres index / total / sessionId manquants ou invalides");

    if (file.Length > MaxFileSize)
        return Results.StatusCode(413);

    // Lire les bytes immédiatement — le stream IFormFile n'est valide
    // que pendant la durée de la requête HTTP.
    using var ms = new MemoryStream();
    await file.CopyToAsync(ms).ConfigureAwait(false);

    var chunkId = Guid.NewGuid(); // canal SSE propre à ce chunk

    await whisper.EnqueueChunkAsync(
        chunkData: ms.ToArray(),
        filename: file.FileName,
        contentType: file.ContentType,
        index: index,
        total: total,
        chunkId: chunkId,
        sessionId: sessionId).ConfigureAwait(false);

    var sseBase = env.EnvironmentName == "Localhost" ? "" : "/transcript";

    // sseUrl       → canal court-lived, progression de CE chunk uniquement.
    // sessionSseUrl → canal long-lived, le browser l'ouvre une seule fois (index == 0)
    //                 et le maintient ouvert jusqu'au texte final recombiné.
    return Results.Ok(new
    {
        sseUrl = $"{sseBase}/transcribe-sse/{chunkId}",
        sessionSseUrl = $"{sseBase}/transcribe-sse/{sessionId}",
        chunkId,
        index,
        total,
        sessionId,
    });

}).DisableAntiforgery();


app.Run();
