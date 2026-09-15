public class WhisperConfig
{
    public string? ApiTranscript { get; set; }
    public string? ApiKey { get; set; }
    public string? FfmpegPath { get; set; }
    public int? MaxConcurrent { get; set; }
    public string? Model { get; set; }
    public string? Language { get; set; }
    public string? FormattingModel { get; set; }
    public bool EnableFormatting { get; set; } = true;
}