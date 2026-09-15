# AudioTranscript — Modified Files (FFmpeg Server-Side Pipeline)
## Date: 2026-03-18

## Files included

| File | Location in project |
|------|-------------------|
| appsettings.json | Project root |
| pipelinechunk.js | wwwroot/js/ |
| TranscriptionResult.razor | Components/ |
| WhisperService.cs | Services/ |

## Summary of changes

### appsettings.json
- Added Whisper:FfmpegPath config key (default: "ffmpeg")
- Set on Windows Server to full path if ffmpeg not in PATH

### pipelinechunk.js
- Reverted to simple Blob.slice() — FFmpeg handles re-encoding server-side
- Removed all AudioContext / OfflineAudioContext / pcmToWav code
- Client is lean and fast: first chunk sent immediately, no upfront decode wait
- Retained SSE buffer flush fix (trailing \n\n)

### TranscriptionResult.razor
- Added "Conversion" keyword detection for FFmpeg step
- Shows purple 🔧 icon + animation during FFmpeg re-encoding
- No structural changes

### WhisperService.cs
- Added _ffmpegPath field read from Whisper:FfmpegPath config
- Added ReencodeWithFfmpegAsync() — converts any chunk to mono 16kHz WAV
- ProcessChunkRequestAsync now calls FFmpeg before Whisper
- All previous fixes retained:
  * Unsubscribe(chunkId) after per-chunk final message
  * Unsubscribe(sessionId) after session final message
  * Unsubscribe on all error paths
  * DeleteTempFile null guard for chunk requests
  * stopwatch.Stop() on all paths

## FFmpeg installation

Windows Server (choose one):
  winget install ffmpeg
  choco install ffmpeg

Or place ffmpeg.exe in app directory and set:
  "Whisper": { "FfmpegPath": "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe" }

## IIS web.config (add if not present)

  <system.webServer>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="15728640" />
      </requestFiltering>
    </security>
  </system.webServer>

Chunks are 10 MB raw — 15 MB limit gives safe headroom.
