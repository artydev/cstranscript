using System.Collections.Concurrent;
using System.Threading.Channels;

namespace TranscriptAudio.Services;

public class TranscriptionStatusTracker
{
    // ─── FIELDS ──────────────────────────────────────────────────────────────────

    private readonly ConcurrentDictionary<Guid, Channel<string>> _streams = new();

    // ─── PUBLIC API ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Registers a reader for the given id and returns it to the SSE endpoint.
    /// Uses GetOrAdd — if NotifyUpdate already created the channel and wrote a
    /// message before the browser SSE GET arrived, the buffered message is
    /// preserved and returned to the new reader immediately.
    /// </summary>
    public ChannelReader<string> Subscribe(Guid id)
    {
        var channel = _streams.GetOrAdd(id, _ => Channel.CreateUnbounded<string>());
        return channel.Reader;
    }

    /// <summary>
    /// Writes an HTML payload to the channel identified by id.
    /// Uses GetOrAdd — if Subscribe has not yet been called (browser SSE GET
    /// not yet arrived), the channel is created here and the message is buffered.
    /// The reader will drain it as soon as Subscribe is called.
    /// </summary>
    public async Task NotifyUpdate(Guid id, string html)
    {
        var channel = _streams.GetOrAdd(id, _ => Channel.CreateUnbounded<string>());
        await channel.Writer.WriteAsync(html).ConfigureAwait(false);
    }

    /// <summary>
    /// Completes the channel writer WITHOUT removing the channel from the dictionary.
    ///
    /// Called by WhisperService after the final message is written.
    /// Signals ReadAllAsync in the SSE endpoint to exit after draining all
    /// buffered messages — but leaves the channel registered so that a Subscribe
    /// call arriving slightly after CompleteWriter can still find and drain it.
    ///
    /// Ownership of channel removal stays exclusively with the SSE endpoint
    /// via its finally → Unsubscribe() call. This eliminates the race where:
    ///   1. NotifyUpdate writes fullText
    ///   2. Unsubscribe removes + completes the channel
    ///   3. Subscribe (SSE GET arrives late) creates a NEW empty channel
    ///   4. ReadAllAsync waits forever on the empty channel
    /// </summary>
    public void CompleteWriter(Guid id)
    {
        if (_streams.TryGetValue(id, out var channel))
            channel.Writer.TryComplete();
    }

    /// <summary>
    /// Removes the channel from the dictionary and completes the writer.
    /// Called exclusively by the SSE endpoint's finally block — never by
    /// WhisperService directly (use CompleteWriter instead).
    /// Safe to call multiple times — TryRemove and TryComplete are both idempotent.
    /// </summary>
    public void Unsubscribe(Guid id)
    {
        if (_streams.TryRemove(id, out var channel))
            channel.Writer.TryComplete();
    }

    /// <summary>
    /// Returns true if a channel is registered for the given id.
    /// Polled by WhisperService.WaitForSubscriberAsync before sending
    /// the first per-chunk update.
    /// </summary>
    public bool HasSubscriber(Guid id) => _streams.ContainsKey(id);
}