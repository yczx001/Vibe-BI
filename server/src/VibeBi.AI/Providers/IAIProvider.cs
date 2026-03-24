using VibeBi.Core.Models;

namespace VibeBi.AI.Providers;

public interface IAIProvider
{
    string Name { get; }
    Task<string> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default);
    IAsyncEnumerable<string> StreamCompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default);
}

public record GenerationProgress
{
    public required string Step { get; init; }
    public required int ProgressPercent { get; init; }
    public string? Message { get; init; }
    public string? PartialContent { get; init; }
    public ReportDefinition? Report { get; init; }
    public List<PageDefinition>? Pages { get; init; }
    public List<QueryDefinition>? Queries { get; init; }
}
