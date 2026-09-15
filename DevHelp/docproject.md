
# TranscriptAudio.Presentation.JSChunk — LLM-Oriented Technical Documentation

## Overview

`TranscriptAudio.Presentation.JSChunk` is a Blazor-based audio transcription system designed for:

- Whole-file audio uploads
- Real-time chunked audio streaming
- Progressive transcription updates
- Server-Sent Events (SSE) communication
- Integration with an external Whisper transcription API

The architecture separates:
- UI rendering (Razor components)
- Transcription orchestration
- SSE transport
- External API communication
- State/progress tracking

---

# High-Level Architecture

Browser
 ├── Upload audio file
 ├── Record microphone audio
 ├── Split audio into chunks
 └── Listen to SSE updates

        │ HTTP POST
        ▼

ASP.NET / Blazor Server
 ├── /transcribe-audio
 ├── /transcribe-chunk
 ├── /transcribe-sse/{id}
 ├── WhisperService
 ├── TranscriptionStatusTracker
 └── Razor HTML rendering

        │ HTTP API
        ▼

External Whisper API
 └── Returns transcription text

        │ SSE
        ▼

Browser UI updates in real time

---

# Core Responsibilities

| Layer | Responsibility |
|---|---|
| Razor Components | UI rendering and browser-side behavior |
| WhisperService | Transcription orchestration |
| TranscriptionStatusTracker | Real-time event distribution |
| SSE Endpoint | Streaming HTML updates |
| Whisper API | Speech-to-text processing |
| HtmlRenderer | Converts Razor components into HTML snippets |

---

# Components

## TranscribeAudio.razor

Responsibilities:
- Renders file upload form
- Sends POST request to `/transcribe-audio`
- Receives HTML containing SSE bridge
- Injects dynamic transcription UI

## TranscriptAudioRecorder.razor

Responsibilities:
- Uses MediaRecorder API
- Splits recording into blobs/chunks
- Sends chunks to `/transcribe-chunk`
- Maintains session state
- Opens SSE streams

## TranscriptionResult.razor

Responsibilities:
- Displays transcription content
- Receives rendered HTML snippets
- Updates UI progressively

## TranscriptionSseBridge.razor

Responsibilities:
- Opens `EventSource`
- Listens for `message` events
- Injects incoming HTML into DOM

---

# Services

## TranscriptionStatusTracker

Internal Structure:
`ConcurrentDictionary<Guid, Channel<string>>`

Methods:
- `Subscribe(Guid id)`
- `Publish(Guid id, string html)`
- `Unsubscribe(Guid id)`

## WhisperService

Responsibilities:
- Queue transcription jobs
- Send audio to Whisper API
- Aggregate chunked results
- Render Razor components into HTML
- Publish updates via tracker

Methods:
- `EnqueueTranscriptionAsync(...)`
- `EnqueueChunkAsync(...)`

---

# HTTP Endpoints

## GET /transcribe-sse/{id:guid}

Purpose:
- SSE stream endpoint

## POST /transcribe-audio

Purpose:
- Whole-file transcription upload

## POST /transcribe-chunk

Purpose:
- Incremental chunk upload

Returns:
- sseUrl
- sessionSseUrl
- chunkId
- sessionId
- index
- total

---

# Configuration

## WhisperConfig

Properties:
- ApiTranscript
- ApiKey

## ProxyConfig

Properties:
- UseProxy
- Url

---

# Dependency Injection

Registered Services:
- TranscriptionStatusTracker (Singleton)
- WhisperService (Singleton)
- HttpClient("Whisper")
- WhisperConfig
- ProxyConfig

---

# SSE Communication Model

Advantages:
- Lightweight
- Native browser support
- Simpler than WebSockets
- Ideal for one-way server push

---

# Chunked Upload Model

Benefits:
- Supports large files
- Progressive transcription
- Lower memory pressure
- Better resiliency

---

# Scalability Considerations

Current:
- In-memory state
- Single-instance oriented

Recommended:
- Redis pub/sub
- Distributed cache
- Shared session state

---

# Security Recommendations

- Secure API keys
- Validate uploads
- Add rate limiting
- Enable retry logic
- Add malware scanning

---

# Architectural Strengths

- Clean separation of concerns
- Reusable Razor rendering
- Real-time transcription UX
- Large file support
- Low-overhead SSE streaming

---

# Key Technologies

| Technology | Role |
|---|---|
| ASP.NET Core | Backend |
| Blazor | UI framework |
| Razor Components | Server rendering |
| SSE | Real-time updates |
| MediaRecorder API | Browser audio capture |
| HttpClient | Whisper API integration |

---

# Summary

`TranscriptAudio.Presentation.JSChunk` is a real-time audio transcription platform built with Blazor and ASP.NET Core.

Core capabilities:
- audio upload and recording
- chunked streaming
- live transcription updates
- SSE synchronization
- Razor-based rendering
- Whisper API integration
