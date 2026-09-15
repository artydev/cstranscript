# Passage à un frontend HTML / JS / CSS

Le frontend ne dépend plus ni de Razor, ni de HTMX, ni de l'extension SSE de HTMX.
Le serveur devient une API JSON qui sert des fichiers statiques.

## Nouveaux fichiers

| Fichier | Remplace |
|---|---|
| `wwwroot/index.html` | `Pages/Index.cshtml`, `Components/TranscribeAudio.razor`, `Components/TranscriptAudioRecorder.razor` |
| `wwwroot/js/app.js` | `htmx.js`, `htmx-sse.js`, `pipelinechunk.js`, le `<script>` inline d'`Index.cshtml` |
| `wwwroot/js/render.js` | `Components/TranscriptionResult.razor` |
| `wwwroot/css/transcription.css` | tous les `style="…"` en ligne des composants |

`audio-explorer` est un web component standard : il est conservé tel quel.

## Fichiers à supprimer une fois la migration validée

```
App.razor
Components/TranscribeAudio.razor
Components/TranscriptAudioRecorder.razor
Components/TranscriptionResult.razor
Components/TranscriptionSseBridge.razor
Pages/                      (Index.cshtml, _Layout.cshtml, _ViewImports, _ViewStart, Error)
wwwroot/js/libs/htmx.js
wwwroot/js/libs/htmx-sse.js
wwwroot/js/pipelinechunk.js
wwwroot/js/pipelinechunk_debug.js
```

Récupérez d'abord les règles `.tf-result-text h2 / p / blockquote` du `<style>` de
`Pages/Shared/_Layout.cshtml` : elles ne sont utiles que si le serveur renvoie du
HTML formaté. Avec un texte brut elles peuvent disparaître.

---

## Modifications côté serveur

Trois endroits produisent encore du HTML via `HtmlRenderer`. Ils doivent renvoyer du JSON.

### 1. `Program.cs` — servir `index.html`

```csharp
app.UsePathBase("/transcript");

app.UseDefaultFiles();   // ← ajouter : "/" sert wwwroot/index.html
app.UseStaticFiles();
app.UseRouting();
```

Supprimer ensuite :

```csharp
builder.Services.AddRazorPages();
builder.Services.AddRazorComponents();
builder.Services.AddTransient<HtmlRenderer>();
...
app.MapRazorComponents<App>().DisableAntiforgery();
app.MapRazorPages();
```

### 2. `Program.cs` — `POST /transcribe-audio` renvoie l'URL du flux

Le bloc `renderer.RenderComponentAsync<TranscriptionSseBridge>(...)` disparaît :

```csharp
await whisper.EnqueueTranscriptionAsync(tempPath, file.FileName, file.ContentType, id);

var sseBase = env.EnvironmentName == "Localhost" ? "" : "/transcript";

return Results.Ok(new { sseUrl = $"{sseBase}/transcribe-sse/{id}" });
```

`POST /transcribe-chunk` renvoie déjà du JSON : rien à changer.

### 3. `Services/WhisperService.cs` — `SendUpdate` pousse du JSON

```csharp
private async Task SendUpdate(Guid id, string msg, bool isError, bool isProcessing)
{
    var payload = JsonSerializer.Serialize(new
    {
        message      = msg,
        isError,
        isProcessing
    });

    await _statusTracker.NotifyUpdate(id, payload).ConfigureAwait(false);
}
```

Plus besoin de `_serviceProvider.CreateScope()` ni de `HtmlRenderer` dans cette classe.
`JsonSerializer` produit toujours une seule ligne, donc le nettoyage `Replace("\n","")`
de l'endpoint SSE reste sans effet et peut rester en place.

---

## Période de transition

`app.js` accepte les deux formats pendant la migration :

- réponse de `/transcribe-audio` en JSON **ou** en HTML (il lit alors l'attribut `sse-connect`) ;
- charge utile SSE en JSON **ou** en HTML (injectée telle quelle via `renderRawHtml`).

Le frontend fonctionne donc avant même d'avoir touché au C#. Une fois les trois
modifications faites, ces deux branches de repli peuvent être retirées d'`app.js`
(fonctions `extraireSseUrl` et `afficher`).

## Base de l'API

`index.html` contient :

```html
<meta name="api-base" content="" />
```

Vide, l'URL est déduite du chemin de la page : `/index.html` → `""`,
`/transcript/index.html` → `"/transcript"`. Cela couvre le `UsePathBase("/transcript")`
sans code serveur. Renseignez la balise pour forcer une valeur, par exemple si le
frontend est servi par un autre hôte que l'API.
