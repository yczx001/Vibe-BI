using System.IO.Compression;
using System.Text.Json;
using VibeBi.Core.Models;

namespace VibeBi.Core.Services;

public interface IReportFileService
{
    Task SaveReportAsync(string filePath, ReportPackage report);
    Task<ReportPackage> LoadReportAsync(string filePath);
    Task<ReportPackage> LoadFromStreamAsync(Stream stream);
    Task<byte[]> ExportToBytesAsync(ReportPackage report);
}

public record ReportPackage
{
    public required ReportDefinition Manifest { get; init; }
    public required DataSourceConfig DataSource { get; init; }
    public required List<PageDefinition> Pages { get; init; }
    public required List<QueryDefinition> Queries { get; init; }
    public required ThemeDefinition Theme { get; init; }
    public Dictionary<string, byte[]> Assets { get; init; } = new();
    public object? AiContext { get; init; }
}

public class ReportFileService : IReportFileService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    public async Task SaveReportAsync(string filePath, ReportPackage report)
    {
        using var fileStream = File.Create(filePath);
        await SaveToStreamAsync(fileStream, report);
    }

    public async Task<ReportPackage> LoadReportAsync(string filePath)
    {
        using var fileStream = File.OpenRead(filePath);
        return await LoadFromStreamAsync(fileStream);
    }

    public async Task<ReportPackage> LoadFromStreamAsync(Stream stream)
    {
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);

        var manifest = await ReadJsonFromArchive<ReportDefinition>(archive, "manifest.json");
        var dataSource = await ReadJsonFromArchive<DataSourceConfig>(archive, "datasource.json");
        var theme = await ReadJsonFromArchive<ThemeDefinition>(archive, "theme.json");
        var pages = new List<PageDefinition>();
        var queries = new List<QueryDefinition>();
        var assets = new Dictionary<string, byte[]>();
        object? aiContext = null;

        // Read pages
        var pagesEntry = archive.GetEntry("pages/");
        if (pagesEntry == null)
        {
            foreach (var entry in archive.Entries)
            {
                if (entry.FullName.StartsWith("pages/") && entry.FullName.EndsWith(".json"))
                {
                    var page = await ReadJsonFromArchive<PageDefinition>(archive, entry.FullName);
                    pages.Add(page);
                }
            }
        }

        // Read queries
        var queriesEntry = archive.GetEntry("queries/");
        if (queriesEntry == null)
        {
            foreach (var entry in archive.Entries)
            {
                if (entry.FullName.StartsWith("queries/") && entry.FullName.EndsWith(".json"))
                {
                    var query = await ReadJsonFromArchive<QueryDefinition>(archive, entry.FullName);
                    queries.Add(query);
                }
            }
        }

        // Read assets
        foreach (var entry in archive.Entries)
        {
            if (entry.FullName.StartsWith("assets/"))
            {
                using var ms = new MemoryStream();
                await entry.Open().CopyToAsync(ms);
                assets[entry.FullName] = ms.ToArray();
            }
        }

        // Read AI context (optional)
        var aiContextEntry = archive.GetEntry("ai-context.json");
        if (aiContextEntry != null)
        {
            using var stream2 = aiContextEntry.Open();
            aiContext = await JsonSerializer.DeserializeAsync<object>(stream2, JsonOptions);
        }

        return new ReportPackage
        {
            Manifest = manifest,
            DataSource = dataSource,
            Pages = pages,
            Queries = queries,
            Theme = theme,
            Assets = assets,
            AiContext = aiContext
        };
    }

    public async Task<byte[]> ExportToBytesAsync(ReportPackage report)
    {
        using var ms = new MemoryStream();
        await SaveToStreamAsync(ms, report);
        return ms.ToArray();
    }

    private async Task SaveToStreamAsync(Stream stream, ReportPackage report)
    {
        using var archive = new ZipArchive(stream, ZipArchiveMode.Create, true);

        // Write manifest
        await WriteJsonToArchive(archive, "manifest.json", report.Manifest);

        // Write datasource
        await WriteJsonToArchive(archive, "datasource.json", report.DataSource);

        // Write theme
        await WriteJsonToArchive(archive, "theme.json", report.Theme);

        // Write pages
        foreach (var page in report.Pages)
        {
            await WriteJsonToArchive(archive, $"pages/{page.Id}.json", page);
        }

        // Write queries
        foreach (var query in report.Queries)
        {
            await WriteJsonToArchive(archive, $"queries/{query.Id}.json", query);
        }

        // Write assets
        foreach (var (path, data) in report.Assets)
        {
            var entry = archive.CreateEntry(path);
            using var entryStream = entry.Open();
            await entryStream.WriteAsync(data);
        }

        // Write AI context (if present)
        if (report.AiContext != null)
        {
            await WriteJsonToArchive(archive, "ai-context.json", report.AiContext);
        }
    }

    private async Task<T> ReadJsonFromArchive<T>(ZipArchive archive, string entryName)
    {
        var entry = archive.GetEntry(entryName);
        if (entry == null)
        {
            throw new FileNotFoundException($"Entry not found: {entryName}");
        }

        using var stream = entry.Open();
        var result = await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions);
        if (result == null)
        {
            throw new InvalidOperationException($"Failed to deserialize {entryName}");
        }
        return result;
    }

    private async Task WriteJsonToArchive<T>(ZipArchive archive, string entryName, T data)
    {
        var entry = archive.CreateEntry(entryName);
        using var stream = entry.Open();
        await JsonSerializer.SerializeAsync(stream, data, JsonOptions);
    }
}
