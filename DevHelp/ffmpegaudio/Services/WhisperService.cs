using AudioTranscript.Presentation.JSChunk.Components;
using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using Polly;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Channels;

namespace AudioTranscript.Presentation.JSChunk.Services;

internal sealed class WhisperService : IAsyncDisposable
{
    // ─── FIELDS ──────────────────────────────────────────────────────────────────

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

    // ─── CONSTRUCTOR ─────────────────────────────────────────────────────────────

    public WhisperService(
        IHttpClientFactory httpClientFactory,
        IServiceProvider serviceProvider,
        TranscriptionStatusTracker statusTracker,
        ILogger<WhisperService> logger,
        IConfiguration config)
    {
        _httpClientFactory = httpClientFactory;
        _serviceProvider = serviceProvider;
        _statusTracker = statusTracker;
        _logger = logger;

        _ffmpegPath = config.GetValue<string>("Whisper:FfmpegPath") ?? "ffmpeg";

        int maxConcurrent = config.GetValue<int?>("Whisper:MaxConcurrent") ?? 3;

        _queue = Channel.CreateBounded<TranscriptionRequest>(new BoundedChannelOptions(maxConcurrent * 2)
        {
            FullMode = BoundedChannelFullMode.Wait
        });

        _retryPolicy = Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .WaitAndRetryAsync(3, i => TimeSpan.FromSeconds(Math.Pow(2, i)));

        // Store worker tasks so DisposeAsync can await clean shutdown
        _workers = Enumerable
            .Range(0, maxConcurrent)
            .Select(_ => Task.Run(() => ProcessQueueAsync(_cts.Token)))
            .ToArray();
    }

    // ─── PUBLIC API ──────────────────────────────────────────────────────────────

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
    /// Writes the raw chunk to a temp file immediately at enqueue time,
    /// so the byte[] is not held in the bounded channel buffer.
    /// Peak RAM per queued chunk drops from ~10 MB to near zero.
    /// </summary>
    public async Task EnqueueChunkAsync(
        byte[] chunkData, string filename, string contentType,
        int index, int total, Guid chunkId, Guid sessionId)
    {
        _sessions.GetOrAdd(sessionId, _ => new TranscriptionSession
        {
            SessionId = sessionId,
            Total = total,
            Texts = new string?[total]
        });

        // Write raw bytes to disk immediately — only the path travels in the queue
        var ext = Path.GetExtension(filename);
        var inputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}{ext}");
        await File.WriteAllBytesAsync(inputPath, chunkData).ConfigureAwait(false);

        await _queue.Writer.WriteAsync(new TranscriptionRequest
        {
            Id = chunkId,
            SessionId = sessionId,
            FilePath = inputPath,
            Filename = filename,
            ContentType = contentType,
            Index = index,
            Total = total,
            IsChunk = true
        }).ConfigureAwait(false);
    }

    // ─── BACKGROUND WORKER ───────────────────────────────────────────────────────

    private async Task ProcessQueueAsync(CancellationToken ct)
    {
        await foreach (var request in _queue.Reader.ReadAllAsync(ct).ConfigureAwait(false))
            await ProcessRequestAsync(request, ct).ConfigureAwait(false);
    }

    // ─── REQUEST DISPATCHER ──────────────────────────────────────────────────────

    private Task ProcessRequestAsync(TranscriptionRequest request, CancellationToken ct)
        => request.IsChunk
            ? ProcessChunkRequestAsync(request, ct)
            : ProcessFileRequestAsync(request, ct);

    // ─── FILE TRANSCRIPTION ──────────────────────────────────────────────────────

    private async Task ProcessFileRequestAsync(TranscriptionRequest request, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await WaitForSubscriberAsync(request.Id, ct).ConfigureAwait(false);
            await SendUpdate(request.Id, "Initialisation du traitement...", false, true).ConfigureAwait(false);
            await Task.Delay(100, ct).ConfigureAwait(false);

            await SendUpdate(request.Id, "Transcription en cours...", false, true).ConfigureAwait(false);
            await Task.Yield();

            var response = await CallWhisperApiFromFileAsync(request, ct).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                throw new Exception($"L'API Whisper a retourne une erreur : {response.StatusCode}");

            await SendUpdate(request.Id, "Finalisation du resultat...", false, true).ConfigureAwait(false);
            await Task.Delay(100, ct).ConfigureAwait(false);

            var text = await ParseTranscriptionResponseAsync(response, ct).ConfigureAwait(false);
            stopwatch.Stop();

            await SendUpdate(request.Id, text, false, false).ConfigureAwait(false);
            _statusTracker.Unsubscribe(request.Id);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            await SendUpdate(request.Id, $"Erreur : {ex.Message}", true, false).ConfigureAwait(false);
            _statusTracker.Unsubscribe(request.Id);
        }
        finally
        {
            DeleteTempFile(request.FilePath);
        }
    }

    // ─── CHUNK TRANSCRIPTION ─────────────────────────────────────────────────────

    private async Task ProcessChunkRequestAsync(TranscriptionRequest request, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await WaitForSubscriberAsync(request.Id, ct).ConfigureAwait(false);
            await SendUpdate(request.Id, "Initialisation du traitement...", false, true).ConfigureAwait(false);
            await Task.Delay(100, ct).ConfigureAwait(false);

            // FFmpeg re-encode: convert raw chunk to mono 16kHz WAV.
            // Fixes MP3/WebM frame-boundary corruption that caused Whisper 500 errors.
            await SendUpdate(request.Id, "Conversion audio (FFmpeg)...", false, true).ConfigureAwait(false);

            var outputPath = await ReencodeWithFfmpegAsync(
                request.FilePath!,
                request.Filename,
                ct).ConfigureAwait(false);

            await SendUpdate(request.Id, "Transcription en cours...", false, true).ConfigureAwait(false);
            await Task.Yield();

            var response = await CallWhisperApiFromFileAsync(
                request with
                {
                    FilePath = outputPath,
                    Filename = Path.GetFileNameWithoutExtension(request.Filename) + ".wav",
                    ContentType = "audio/wav"
                },
                ct).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
                throw new Exception($"L'API Whisper a retourne une erreur : {response.StatusCode}");

            await SendUpdate(request.Id, "Finalisation du resultat...", false, true).ConfigureAwait(false);
            await Task.Delay(100, ct).ConfigureAwait(false);

            var text = await ParseTranscriptionResponseAsync(response, ct).ConfigureAwait(false);
            stopwatch.Stop();

            await TraiterChunkTranscritAsync(request, text, ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Erreur traitement chunk {Index}/{Total} session {SessionId}",
                request.Index + 1, request.Total, request.SessionId);
            await SendUpdate(request.Id, $"Erreur : {ex.Message}", true, false).ConfigureAwait(false);
            _statusTracker.Unsubscribe(request.Id);
        }
        finally
        {
            // Both the raw input and the re-encoded WAV are temp files on disk
            DeleteTempFile(request.FilePath);
        }
    }

    // ─── FFMPEG RE-ENCODE ─────────────────────────────────────────────────────────

    /// <summary>
    /// Re-encodes a raw audio chunk to mono 16kHz WAV using FFmpeg.
    /// Reads from and writes to temp files — no byte[] in memory.
    /// Returns the output temp file path; caller is responsible for deletion.
    ///
    /// Note: stderr is read to completion BEFORE WaitForExitAsync to prevent
    /// deadlock when the process fills its stderr pipe buffer.
    /// </summary>
    private async Task<string> ReencodeWithFfmpegAsync(
        string inputPath, string inputFilename, CancellationToken ct)
    {
        var outputPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.wav");

        var psi = new ProcessStartInfo(_ffmpegPath)
        {
            Arguments = $"-y -i \"{inputPath}\" -ar 16000 -ac 1 -f wav \"{outputPath}\"",
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi)
                         ?? throw new Exception("Impossible de demarrer FFmpeg.");

        // Read stderr to completion before WaitForExitAsync —
        // prevents deadlock if FFmpeg fills its stderr pipe buffer.
        var stderr = await proc.StandardError.ReadToEndAsync(ct).ConfigureAwait(false);
        await proc.WaitForExitAsync(ct).ConfigureAwait(false);

        if (proc.ExitCode != 0)
        {
            DeleteTempFile(outputPath);
            throw new Exception($"FFmpeg a echoue (exit {proc.ExitCode}) : {stderr}");
        }

        return outputPath;
    }

    // ─── WHISPER API CALLS ───────────────────────────────────────────────────────

    /// <summary>
    /// Streams the file directly from disk — no byte[] allocation.
    /// Used for both full-file and (post-FFmpeg) chunk transcription.
    /// </summary>
    private async Task<HttpResponseMessage> CallWhisperApiFromFileAsync(
        TranscriptionRequest request, CancellationToken ct)
    {
        var httpClient = _httpClientFactory.CreateClient("Whisper");

        return await _retryPolicy.ExecuteAsync(async token =>
        {
            using var stream = new FileStream(request.FilePath!, FileMode.Open, FileAccess.Read, FileShare.Read);
            using var content = BuildMultipartContent(new StreamContent(stream), request.ContentType, request.Filename);
            return await httpClient.PostAsync("v1/audio/transcriptions", content, token).ConfigureAwait(false);
        }, ct).ConfigureAwait(false);
    }

    // ─── HELPERS ─────────────────────────────────────────────────────────────────

    private static MultipartFormDataContent BuildMultipartContent(
        HttpContent fileContent, string contentType, string filename)
    {
        fileContent.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var content = new MultipartFormDataContent();
        content.Add(fileContent, "file", filename);
        content.Add(new StringContent("openai/whisper-large-v3"), "model");
        content.Add(new StringContent("fr"), "language");
        return content;
    }

    private static async Task<string> ParseTranscriptionResponseAsync(
        HttpResponseMessage response, CancellationToken ct)
    {
        var json = await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("text").GetString() ?? string.Empty;
    }

    /// <summary>
    /// Polls until a client SSE subscriber is registered for this id,
    /// or times out after 2 seconds. Logs a warning on timeout — updates
    /// sent with no subscriber are silently dropped by the tracker.
    /// </summary>
    private async Task WaitForSubscriberAsync(Guid id, CancellationToken ct)
    {
        int waited = 0;
        while (!_statusTracker.HasSubscriber(id) && waited < 2000)
        {
            await Task.Delay(200, ct).ConfigureAwait(false);
            waited += 200;
        }

        if (!_statusTracker.HasSubscriber(id))
            _logger.LogWarning(
                "Aucun subscriber SSE apres {Ms} ms pour l'id {Id} — les mises a jour seront perdues.",
                waited, id);
    }

    private static void DeleteTempFile(string? filePath)
    {
        if (filePath is null) return;
        if (File.Exists(filePath))
            try { File.Delete(filePath); } catch { /* ignore */ }
    }

    // ─── CHUNK ASSEMBLY ──────────────────────────────────────────────────────────

    private async Task TraiterChunkTranscritAsync(
        TranscriptionRequest request, string transcriptionText, CancellationToken ct)
    {
        if (!_sessions.TryGetValue(request.SessionId, out var session))
        {
            _logger.LogError(
                "Session {SessionId} introuvable lors de l'assemblage du chunk {Index} — texte perdu.",
                request.SessionId, request.Index);
            _statusTracker.Unsubscribe(request.Id);
            return;
        }

        int completedCount;
        lock (session.Lock)
        {
            session.Texts[request.Index] = transcriptionText;
            session.CompletedCount++;
            completedCount = session.CompletedCount;
        }

        await SendUpdate(
            request.Id,
            $"Chunk {request.Index + 1}/{request.Total} transcrit.",
            isError: false,
            isProcessing: false).ConfigureAwait(false);

        _statusTracker.Unsubscribe(request.Id);

        if (completedCount < request.Total) return;

        var fullText = string.Join(" ", session.Texts!);
        _sessions.TryRemove(request.SessionId, out _);

        await SendUpdate(
            request.SessionId,
            fullText,
            isError: false,
            isProcessing: false).ConfigureAwait(false);

        _statusTracker.Unsubscribe(request.SessionId);
    }

    // ─── SSE UPDATE ──────────────────────────────────────────────────────────────

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

    // ─── DISPOSAL ────────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        _queue.Writer.TryComplete();
        await _cts.CancelAsync().ConfigureAwait(false);

        // Await all workers with a timeout to allow graceful shutdown
        try
        {
            await Task.WhenAll(_workers)
                .WaitAsync(TimeSpan.FromSeconds(10))
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) { /* expected on cancellation */ }
        catch (TimeoutException)
        {
            _logger.LogWarning("WhisperService : arret force apres timeout (10 s).");
        }

        _cts.Dispose();
    }

    // ─── INTERNAL TYPES ──────────────────────────────────────────────────────────

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
        public string?[] Texts { get; set; } = [];
        public int CompletedCount { get; set; }
        public object Lock { get; } = new();
    }
}