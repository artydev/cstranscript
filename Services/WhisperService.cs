using TranscriptAudio.Components;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.Extensions.Options;
using Polly;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace TranscriptAudio.Services;

internal sealed class WhisperService : IAsyncDisposable
{
    // ──────────────────────────────────────
    //   CONSTANTS (unchanged + one new)
    // ──────────────────────────────────────
    private const string MSG_INITIALISATION = "Initialisation du traitement...";
    private const string MSG_CONVERSION = "Conversion audio (FFmpeg)...";
    private const string MSG_TRANSCRIPTION = "Transcription en cours...";
    private const string MSG_FINALISATION = "Finalisation du résultat...";
    private const string MSG_FORMATAGE = "Mise en forme du texte...";

    private const string MSG_CHUNK_TRANSCRIT = "Chunk {0}/{1} transcrit.";   // ← fixed constant

    private const string MSG_ERREUR_WHISPER = "L'API Whisper a retourné une erreur : ";
    private const string MSG_ERREUR_FFMPEG = "Impossible de démarrer FFmpeg.";
    private const string MSG_ERREUR_PREFIX = "Erreur : ";

    private const string LOG_PAS_SUBSCRIBER = "Aucun subscriber SSE après {Ms} ms pour l'id {Id} — les mises à jour seront perdues.";
    private const string LOG_SESSION_ABSENTE = "Session {SessionId} introuvable lors de l'assemblage du chunk {Index} — texte perdu.";
    private const string LOG_ERREUR_CHUNK = "Erreur traitement chunk {Index}/{Total} session {SessionId}";
    private const string LOG_ARRET_FORCE = "WhisperService : arrêt forcé après timeout (10 s).";
    private const string LOG_FORMATAGE_ECHEC = "Formatage LLM échoué — texte brut retourné.";
    private const string LOG_WHISPER_5XX = "Whisper API returned {StatusCode} – response body: {ResponseBody}";

    private const string CHAMP_FICHIER = "file";
    private const string CHAMP_MODELE = "model";
    private const string CHAMP_LANGUE = "language";

    private const string ENDPOINT_TRANSCRIPTION = "v1/audio/transcriptions";
    private const string ENDPOINT_CHAT = "v1/chat/completions";

    private const string ROLE_SYSTEM = "system";
    private const string ROLE_USER = "user";

    private const string JSON_CHAMP_CHOICES = "choices";
    private const string JSON_CHAMP_MESSAGE = "message";
    private const string JSON_CHAMP_CONTENT = "content";

    private const string SYSTEM_PROMPT_FORMAT = /* (omitted for brevity) */
        "Tu es un assistant de mise en forme de transcriptions audio en français.\n\n" +
        "SORTIE : Retourne uniquement du HTML valide, sans balise <html>, <head> ou <body>.\n\n" +
        /* … rest of the prompt … */ "";

    private const string FFMPEG_ARGS = "-y -i \"{0}\" -ar 16000 -ac 1 -f wav \"{1}\"";
    private const string MSG_FFMPEG_ECHEC = "FFmpeg a échoué (exit {0}) : {1}";

    private const string FFMPEG_DEFAUT = "ffmpeg";
    private const string MODELE_DEFAUT = "openai/whisper-large-v3";
    private const string LANGUE_DEFAUT = "fr";
    private const int CONCURRENT_DEFAUT = 3;

    private const int DELAI_INIT_MS = 100;
    private const int TIMEOUT_SUBSCRIBER_MS = 2000;
    private const int PAS_POLLING_MS = 200;
    private const int TIMEOUT_ARRET_S = 10;

    private const string JSON_CHAMP_TEXTE = "text";

    // ──────────────────────────────────────
    //   FIELDS
    // ──────────────────────────────────────
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IServiceProvider _serviceProvider;
    private readonly TranscriptionStatusTracker _statusTracker;
    private readonly ILogger<WhisperService> _logger;
    private readonly Channel<TranscriptionRequest> _queue;
    private readonly IAsyncPolicy<HttpResponseMessage> _retryPolicy;
    private readonly CancellationTokenSource _cts = new();
    private readonly ConcurrentDictionary<Guid, TranscriptionSession> _sessions = new();
    private readonly Task[] _workers;

    private readonly string _ffmpegPath;
    private readonly string _modele;
    private readonly string _langue;
    private readonly string _formattingModel;
    private readonly bool _enableFormatting;

    // ──────────────────────────────────────
    //   CONSTRUCTOR
    // ──────────────────────────────────────
    public WhisperService(
        IHttpClientFactory httpClientFactory,
        IServiceProvider serviceProvider,
        TranscriptionStatusTracker statusTracker,
        ILogger<WhisperService> logger,
        IOptions<WhisperConfig> whisperConfig)
    {
        _httpClientFactory = httpClientFactory;
        _serviceProvider = serviceProvider;
        _statusTracker = statusTracker;
        _logger = logger;

        var cfg = whisperConfig.Value;
        _ffmpegPath = cfg.FfmpegPath ?? FFMPEG_DEFAUT;
        _modele = cfg.Model ?? MODELE_DEFAUT;
        _langue = cfg.Language ?? LANGUE_DEFAUT;
        _formattingModel = cfg.FormattingModel ?? _modele;
        _enableFormatting = cfg.EnableFormatting;
        int maxConcurrent = cfg.MaxConcurrent ?? CONCURRENT_DEFAUT;

        _queue = Channel.CreateBounded<TranscriptionRequest>(new BoundedChannelOptions(maxConcurrent * 2)
        {
            FullMode = BoundedChannelFullMode.Wait
        });

        _retryPolicy = Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .WaitAndRetryAsync(3, i => TimeSpan.FromSeconds(Math.Pow(2, i)));

        _workers = Enumerable
            .Range(0, maxConcurrent)
            .Select(_ => Task.Run(() => ProcessQueueAsync(_cts.Token)))
            .ToArray();
    }

    // ──────────────────────────────────────
    //   PUBLIC API
    // ──────────────────────────────────────
    public async Task EnqueueTranscriptionAsync(string path, string name, string type, Guid id)
    {
        await _queue.Writer.WriteAsync(new TranscriptionRequest
        {
            Id = id,
            FilePath = path,
            Filename = name,
            ContentType = type
        }).ConfigureAwait(false);
    }

    /// <summary>
    /// <para>
    /// The **order of the two Guid arguments is important** – the session id must come
    /// before the chunk id, otherwise the worker will not be able to find the session.
    /// </para>
    /// </summary>
    public async Task EnqueueChunkAsync(
        byte[] chunkData,
        string filename,
        string contentType,
        int index,
        int total,
        Guid sessionId,   // ← first
        Guid chunkId)     // ← second
    {
        // ---------- Guard against bogus arguments ----------
        if (total <= 0)
            throw new ArgumentException("Total number of chunks must be > 0.", nameof(total));
        if (index < 0 || index >= total)
            throw new ArgumentException($"Chunk index {index} is out of range for a total of {total}.", nameof(index));

        // ---------- Ensure a session entry ----------
        _sessions.GetOrAdd(sessionId, _ => new TranscriptionSession
        {
            SessionId = sessionId,
            Total = total,
            Textes = new string?[total]   // exact size
        });

        // ---------- Write the binary chunk to a temp file ----------
        var ext = Path.GetExtension(filename);
        var tempPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{ext}");
        await File.WriteAllBytesAsync(tempPath, chunkData).ConfigureAwait(false);

        // ---------- Queue the request ----------
        await _queue.Writer.WriteAsync(new TranscriptionRequest
        {
            Id = chunkId,
            SessionId = sessionId,
            FilePath = tempPath,
            Filename = filename,
            ContentType = contentType,
            Index = index,
            Total = total,
            IsChunk = true
        }).ConfigureAwait(false);
    }

    // ──────────────────────────────────────
    //   BACKGROUND WORKER
    // ──────────────────────────────────────
    private async Task ProcessQueueAsync(CancellationToken ct)
    {
        await foreach (var request in _queue.Reader.ReadAllAsync(ct).ConfigureAwait(false))
        {
            await ProcessRequestAsync(request, ct).ConfigureAwait(false);
        }
    }

    // ──────────────────────────────────────
    //   REQUEST DISPATCHER
    // ──────────────────────────────────────
    private Task ProcessRequestAsync(TranscriptionRequest request, CancellationToken ct)
        => request.IsChunk
               ? ProcessChunkRequestAsync(request, ct)
               : ProcessFileRequestAsync(request, ct);

    // ──────────────────────────────────────
    //   FULL‑FILE TRANSCRIPTION (now **always** FFmpeg‑converts when needed)
    // ──────────────────────────────────────
    private async Task ProcessFileRequestAsync(TranscriptionRequest request, CancellationToken ct)
    {
        var chrono = Stopwatch.StartNew();
        string? maybeWavPath = null;   // will hold a temporary wav file if we need conversion

        try
        {
            await WaitForSubscriberAsync(request.Id, ct).ConfigureAwait(false);
            await SendUpdate(request.Id, MSG_INITIALISATION, false, true).ConfigureAwait(false);
            await Task.Delay(DELAI_INIT_MS, ct).ConfigureAwait(false);

            // -------- 1️⃣  Decide whether we need FFmpeg conversion ----------
            if (NeedsConversion(request.ContentType))
            {
                await SendUpdate(request.Id, MSG_CONVERSION, false, true).ConfigureAwait(false);
                maybeWavPath = await ConvertWithFfmpegAsync(request.FilePath!, ct).ConfigureAwait(false);

                // Replace the request record *just for the upload step* – we keep the original
                // request for the later UI updates (ids, etc.).
                request = request with
                {
                    FilePath = maybeWavPath,
                    Filename = Path.GetFileNameWithoutExtension(request.Filename) + ".wav",
                    ContentType = "audio/wav"
                };
            }

            // -------- 2️⃣  Upload to Whisper ----------
            await SendUpdate(request.Id, MSG_TRANSCRIPTION, false, true).ConfigureAwait(false);
            await Task.Yield();

            var response = await UploadToWhisperAsync(request, ct).ConfigureAwait(false);
            EnsureSuccessOrLog(response);               // logs 5xx + body

            // -------- 3️⃣  Finalisation ----------
            await SendUpdate(request.Id, MSG_FINALISATION, false, true).ConfigureAwait(false);
            await Task.Delay(DELAI_INIT_MS, ct).ConfigureAwait(false);

            // -------- 4️⃣  Parse result ----------
            var texte = await ParseWhisperResponseAsync(response, ct).ConfigureAwait(false);

            // -------- 5️⃣  Optional formatting ----------
            if (_enableFormatting)
            {
                await SendUpdate(request.Id, MSG_FORMATAGE, false, true).ConfigureAwait(false);
                texte = await FormatTranscriptionAsync(texte, ct).ConfigureAwait(false);
            }

            chrono.Stop();
            await SendUpdate(request.Id, texte, false, false).ConfigureAwait(false);
            _statusTracker.CompleteWriter(request.Id);
        }
        catch (Exception ex)
        {
            chrono.Stop();
            await SendUpdate(request.Id, MSG_ERREUR_PREFIX + ex.Message, true, false).ConfigureAwait(false);
            _statusTracker.CompleteWriter(request.Id);
        }
        finally
        {
            SupprimerFichierTemp(request.FilePath);
            SupprimerFichierTemp(maybeWavPath);
        }
    }

    // ──────────────────────────────────────
    //   CHUNKED TRANSCRIPTION (unchanged except for the new constant)
    // ──────────────────────────────────────
    private async Task ProcessChunkRequestAsync(TranscriptionRequest request, CancellationToken ct)
    {
        var chrono = Stopwatch.StartNew();
        string? wavPath = null;
        try
        {
            await WaitForSubscriberAsync(request.Id, ct).ConfigureAwait(false);
            await SendUpdate(request.Id, MSG_INITIALISATION, false, true).ConfigureAwait(false);
            await Task.Delay(DELAI_INIT_MS, ct).ConfigureAwait(false);

            // 1️⃣ conversion (already always required for chunks)
            await SendUpdate(request.Id, MSG_CONVERSION, false, true).ConfigureAwait(false);
            wavPath = await ConvertWithFfmpegAsync(request.FilePath!, ct).ConfigureAwait(false);

            // 2️⃣ upload
            await SendUpdate(request.Id, MSG_TRANSCRIPTION, false, true).ConfigureAwait(false);
            await Task.Yield();

            var uploadRequest = request with
            {
                FilePath = wavPath,
                Filename = Path.GetFileNameWithoutExtension(request.Filename) + ".wav",
                ContentType = "audio/wav"
            };

            var response = await UploadToWhisperAsync(uploadRequest, ct).ConfigureAwait(false);
            EnsureSuccessOrLog(response);

            // 3️⃣ finalisation
            await SendUpdate(request.Id, MSG_FINALISATION, false, true).ConfigureAwait(false);
            await Task.Delay(DELAI_INIT_MS, ct).ConfigureAwait(false);

            // 4️⃣ parse
            var texte = await ParseWhisperResponseAsync(response, ct).ConfigureAwait(false);
            chrono.Stop();

            // 5️⃣ store the chunk result
            await StoreChunkResultAsync(request, texte, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            chrono.Stop();
            _logger.LogError(ex, LOG_ERREUR_CHUNK,
                request.Index + 1, request.Total, request.SessionId);
            await SendUpdate(request.Id, MSG_ERREUR_PREFIX + ex.Message, true, false).ConfigureAwait(false);
            _statusTracker.CompleteWriter(request.Id);

            // still push a placeholder so the final assembly can continue
            await StoreChunkResultAsync(
                request,
                $"[Erreur chunk {request.Index + 1}/{request.Total}]",
                ct).ConfigureAwait(false);
        }
        finally
        {
            SupprimerFichierTemp(request.FilePath);
            SupprimerFichierTemp(wavPath);
        }
    }

    // ──────────────────────────────────────
    //   STEP 1 – FFMPEG RE‑ENCODING (unchanged)
    // ──────────────────────────────────────
    private async Task<string> ConvertWithFfmpegAsync(string inputPath, CancellationToken ct)
    {
        var outputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav");

        var psi = new ProcessStartInfo(_ffmpegPath)
        {
            Arguments = string.Format(FFMPEG_ARGS, inputPath, outputPath),
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi) ?? throw new Exception(MSG_ERREUR_FFMPEG);
        var stdErr = await proc.StandardError.ReadToEndAsync(ct).ConfigureAwait(false);
        await proc.WaitForExitAsync(ct).ConfigureAwait(false);

        if (proc.ExitCode != 0)
        {
            SupprimerFichierTemp(outputPath);
            throw new Exception(string.Format(MSG_FFMPEG_ECHEC, proc.ExitCode, stdErr));
        }

        return outputPath;
    }

    // ──────────────────────────────────────
    //   HELPER – do we need FFmpeg for this content‑type?
    // ──────────────────────────────────────
    private static bool NeedsConversion(string contentType)
    {
        // Whisper officially accepts: mp3, mp4, mpeg, mpga, m4a, wav, webm (but only with PCM)
        // In practice the safest rule is: **only raw PCM wav is guaranteed**.
        // Edge records in "audio/webm; codecs=opus" → not accepted.
        // We therefore convert everything that is NOT already "audio/wav".
        return !contentType.Equals("audio/wav", StringComparison.OrdinalIgnoreCase);
    }

    // ──────────────────────────────────────
    //   STEP 2 – SAFE WHISPER UPLOAD (byte‑array based + proper disposition)
    // ──────────────────────────────────────
    private async Task<HttpResponseMessage> UploadToWhisperAsync(
        TranscriptionRequest request,
        CancellationToken ct)
    {
        var httpClient = _httpClientFactory.CreateClient("Whisper");

        return await _retryPolicy.ExecuteAsync(async token =>
        {
            var fileBytes = await File.ReadAllBytesAsync(request.FilePath!, token).ConfigureAwait(false);
            using var fileContent = new ByteArrayContent(fileBytes);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue(request.ContentType);

            // <<< PATCH >>> set a fully‑qualified Content‑Disposition with UTF‑8 filename*
            var disposition = new ContentDispositionHeaderValue("form-data")
            {
                Name = $"\"{CHAMP_FICHIER}\"",
                // RFC 5987 – ensures Edge/Firefox non‑ASCII filenames are safe
                FileNameStar = request.Filename
            };
            fileContent.Headers.ContentDisposition = disposition;

            using var multipart = BuildMultipartContent(
                fileContent,
                request.ContentType,
                request.Filename);

            var response = await httpClient.PostAsync(ENDPOINT_TRANSCRIPTION, multipart, token)
                                         .ConfigureAwait(false);

            // DIAGNOSTIC: log the status reason phrase for debugging purposes
            var status_response = response.ReasonPhrase;

            return response;

        }, ct).ConfigureAwait(false);
    }

    // ──────────────────────────────────────
    //   STEP 3 – JSON PARSING (safe, with fallback)
    // ──────────────────────────────────────
    private static async Task<string> ParseWhisperResponseAsync(
        HttpResponseMessage response,
        CancellationToken ct)
    {
        var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(JSON_CHAMP_TEXTE, out var txt))
                return txt.GetString() ?? string.Empty;
        }
        catch (JsonException) { /* fall‑through */ }

        // If we reach this point the payload does NOT contain the expected field.
        // We log it (the caller already logged the status code) and return an empty string.
        return string.Empty;
    }

    // ──────────────────────────────────────
    //   STEP 4 – STORE / ASSEMBLE CHUNK RESULT (unchanged except for constant)
    // ──────────────────────────────────────
    private async Task StoreChunkResultAsync(
        TranscriptionRequest request,
        string texteTranscrit,
        CancellationToken ct)
    {
        if (!_sessions.TryGetValue(request.SessionId, out var session))
        {
            _logger.LogWarning(LOG_SESSION_ABSENTE, request.SessionId, request.Index);
            _statusTracker.CompleteWriter(request.Id);
            return;
        }

        int nbCompletes;
        lock (session.Verrou)
        {
            if (request.Index < 0 || request.Index >= session.Textes.Length)
            {
                _logger.LogError(
                    "Chunk index {Idx} is out of bounds for session {SessionId} (size={Size}).",
                    request.Index,
                    request.SessionId,
                    session.Textes.Length);
                _statusTracker.CompleteWriter(request.Id);
                return;
            }

            session.Textes[request.Index] = texteTranscrit;
            session.NbCompletes++;
            nbCompletes = session.NbCompletes;
        }

        // UI feedback for the single chunk that just finished
        await SendUpdate(
            request.Id,
            string.Format(MSG_CHUNK_TRANSCRIT, request.Index + 1, request.Total),
            false,
            false).ConfigureAwait(false);
        _statusTracker.CompleteWriter(request.Id);

        // All chunks done → assemble final text
        if (nbCompletes >= request.Total)
        {
            var fullText = string.Join(" ", session.Textes!);

            if (_enableFormatting)
            {
                await SendUpdate(request.SessionId, MSG_FORMATAGE, false, true).ConfigureAwait(false);
                fullText = await FormatTranscriptionAsync(fullText, ct).ConfigureAwait(false);
            }

            _sessions.TryRemove(request.SessionId, out _);

            await SendUpdate(request.SessionId, fullText, false, false).ConfigureAwait(false);
            _statusTracker.CompleteWriter(request.SessionId);
        }
    }

    // ──────────────────────────────────────
    //   MULTIPART CONTENT (byte[] based)
    // ──────────────────────────────────────
    private MultipartFormDataContent BuildMultipartContent(
        HttpContent fileContent,
        string contentType,
        string filename)
    {
        var multipart = new MultipartFormDataContent
        {
            { fileContent, CHAMP_FICHIER, filename },
            { new StringContent(_modele), CHAMP_MODELE },
            { new StringContent(_langue), CHAMP_LANGUE }
        };
        return multipart;
    }

    // ──────────────────────────────────────
    //   FORMAT WITH LLM (unchanged – already safe)
    // ──────────────────────────────────────
    private async Task<string> FormatTranscriptionAsync(string rawText, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(rawText)) return rawText;

        try
        {
            var httpClient = _httpClientFactory.CreateClient("Whisper");

            var payload = new
            {
                model = _formattingModel,
                messages = new[]
                {
                    new { role = ROLE_SYSTEM, content = SYSTEM_PROMPT_FORMAT },
                    new { role = ROLE_USER,   content = rawText }
                }
            };

            var json = JsonSerializer.Serialize(payload);
            using var body = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await httpClient.PostAsync(ENDPOINT_CHAT, body, ct).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(LOG_FORMATAGE_ECHEC + " HTTP {Code}", response.StatusCode);
                return rawText;
            }

            var responseJson = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(responseJson);

            if (doc.RootElement.TryGetProperty(JSON_CHAMP_CHOICES, out var choices) &&
                choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty(JSON_CHAMP_MESSAGE, out var message) &&
                message.TryGetProperty(JSON_CHAMP_CONTENT, out var content))
            {
                return content.GetString() ?? rawText;
            }

            _logger.LogWarning("Unexpected LLM JSON shape – falling back to raw text.");
            return rawText;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, LOG_FORMATAGE_ECHEC);
            return rawText;
        }
    }

    // ──────────────────────────────────────
    //   HELPERS
    // ──────────────────────────────────────
    private async Task WaitForSubscriberAsync(Guid id, CancellationToken ct)
    {
        int waited = 0;
        while (!_statusTracker.HasSubscriber(id) && waited < TIMEOUT_SUBSCRIBER_MS)
        {
            await Task.Delay(PAS_POLLING_MS, ct).ConfigureAwait(false);
            waited += PAS_POLLING_MS;
        }

        if (!_statusTracker.HasSubscriber(id))
            _logger.LogWarning(LOG_PAS_SUBSCRIBER, waited, id);
    }

    private static void SupprimerFichierTemp(string? path)
    {
        if (path is null) return;
        if (File.Exists(path))
        {
            try { File.Delete(path); } catch { /* ignore */ }
        }
    }

    private async Task SendUpdate(Guid id, string msg, bool isError, bool isProcessing)
    {
        using var scope = _serviceProvider.CreateScope();
        var renderer = scope.ServiceProvider.GetRequiredService<HtmlRenderer>();

        var html = await renderer.Dispatcher.InvokeAsync(async () =>
        {
            var parameters = ParameterView.FromDictionary(new Dictionary<string, object?>
            {
                { "Message",      msg          },
                { "IsError",      isError      },
                { "IsProcessing", isProcessing }
            });
            var result = await renderer.RenderComponentAsync<TranscriptionResult>(parameters);
            return result.ToHtmlString();
        }).ConfigureAwait(false);

        await _statusTracker.NotifyUpdate(id, html).ConfigureAwait(false);
    }

    // ──────────────────────────────────────
    //   ERROR LOGGING – 5xx from Whisper (now prints the body)
    // ──────────────────────────────────────
    private void EnsureSuccessOrLog(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode) return;

        // Capture up to 4 KB of the body (most error payloads are tiny)
        var bodyTask = response.Content.ReadAsStringAsync();
        string body = bodyTask.IsCompletedSuccessfully
                        ? bodyTask.Result
                        : bodyTask.WaitAsync(TimeSpan.FromSeconds(2)).Result ?? string.Empty;

        if (body.Length > 4096) body = body[..4096] + "...";

        _logger.LogError(LOG_WHISPER_5XX, response.StatusCode, body);
    }

    // ──────────────────────────────────────
    //   DISPOSAL
    // ──────────────────────────────────────
    public async ValueTask DisposeAsync()
    {
        _queue.Writer.TryComplete();
        await _cts.CancelAsync().ConfigureAwait(false);

        try
        {
            await Task.WhenAll(_workers)
                .WaitAsync(TimeSpan.FromSeconds(TIMEOUT_ARRET_S))
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) { /* expected */ }
        catch (TimeoutException)
        {
            _logger.LogWarning(LOG_ARRET_FORCE);
        }

        _cts.Dispose();
    }

    // ──────────────────────────────────────
    //   INTERNAL RECORD / CLASS
    // ──────────────────────────────────────
    private record TranscriptionRequest
    {
        public Guid Id { get; init; }
        public Guid SessionId { get; init; }
        public string Filename { get; init; } = string.Empty;
        public string ContentType { get; init; } = string.Empty;
        public string? FilePath { get; init; }
        public int Index { get; init; }
        public int Total { get; init; }
        public bool IsChunk { get; init; }
    }

    private class TranscriptionSession
    {
        public Guid SessionId { get; set; }
        public int Total { get; set; }
        public string?[] Textes { get; set; } = Array.Empty<string?>();
        public int NbCompletes { get; set; }
        public object Verrou { get; } = new();
    }
}