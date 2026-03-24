using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace VibeBi.AI.Providers;

public class ClaudeProvider : IAIProvider
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _baseUrl;
    private readonly string _model;
    private const string DefaultBaseUrl = "https://api.anthropic.com";
    private const string DefaultModel = "claude-3-5-sonnet-20241022";
    private const string AnthropicApiVersion = "2023-06-01";

    public ClaudeProvider(string apiKey, string? baseUrl = null, string? model = null)
    {
        _apiKey = apiKey;
        _baseUrl = string.IsNullOrEmpty(baseUrl) ? DefaultBaseUrl : baseUrl.Trim().TrimEnd('/');
        _model = string.IsNullOrEmpty(model) ? DefaultModel : model;
        _httpClient = new HttpClient();
    }

    public string Name => "Claude";

    public async Task<string> CompleteAsync(string systemPrompt, string userPrompt, CancellationToken ct = default)
    {
        var endpoints = BuildEndpointCandidates();
        var failures = new List<string>();

        var requestBody = new Dictionary<string, object?>
        {
            ["model"] = _model,
            ["max_tokens"] = 4096,
            ["temperature"] = 0,
            ["messages"] = new[]
            {
                new Dictionary<string, object?> { ["role"] = "user", ["content"] = userPrompt }
            }
        };

        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            requestBody["system"] = systemPrompt;
        }

        var payload = JsonSerializer.Serialize(requestBody);

        foreach (var endpoint in endpoints)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json")
            };
            ApplyAuthHeaders(request);

            try
            {
                using var response = await _httpClient.SendAsync(request, ct);
                var content = await response.Content.ReadAsStringAsync(ct);

                if (response.IsSuccessStatusCode)
                {
                    return ParseClaudeContent(content);
                }

                failures.Add($"{endpoint} -> {(int)response.StatusCode}: {content}");
            }
            catch (Exception ex)
            {
                failures.Add($"{endpoint} -> {ex.Message}");
            }
        }

        throw new InvalidOperationException(
            "AI 接口调用失败，已尝试以下地址：" + Environment.NewLine + string.Join(Environment.NewLine, failures));
    }

    public async IAsyncEnumerable<string> StreamCompleteAsync(
        string systemPrompt,
        string userPrompt,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var endpoints = BuildEndpointCandidates();
        Exception? lastException = null;

        var requestBody = new Dictionary<string, object?>
        {
            ["model"] = _model,
            ["max_tokens"] = 4096,
            ["temperature"] = 0,
            ["messages"] = new[]
            {
                new Dictionary<string, object?> { ["role"] = "user", ["content"] = userPrompt }
            },
            ["stream"] = true
        };

        if (!string.IsNullOrWhiteSpace(systemPrompt))
        {
            requestBody["system"] = systemPrompt;
        }

        var payload = JsonSerializer.Serialize(requestBody);

        foreach (var endpoint in endpoints)
        {
            var deltas = new List<string>();
            var success = false;

            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
                {
                    Content = new StringContent(payload, Encoding.UTF8, "application/json")
                };
                ApplyAuthHeaders(request);

                using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

                if (response.IsSuccessStatusCode)
                {
                    await using var stream = await response.Content.ReadAsStreamAsync(ct);
                    using var reader = new StreamReader(stream, Encoding.UTF8);

                    while (true)
                    {
                        ct.ThrowIfCancellationRequested();
                        var line = await reader.ReadLineAsync(ct);
                        if (line is null) break;
                        if (string.IsNullOrEmpty(line) || !line.StartsWith("data: ")) continue;

                        var json = line.Substring(6);
                        if (json == "[DONE]") break;

                        var delta = TryExtractDelta(json);
                        if (!string.IsNullOrEmpty(delta))
                        {
                            deltas.Add(delta);
                        }
                    }

                    success = true;
                }
                else
                {
                    lastException = new InvalidOperationException($"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(ct)}");
                }
            }
            catch (Exception ex)
            {
                lastException = ex;
            }

            if (success)
            {
                foreach (var delta in deltas)
                {
                    yield return delta;
                }
                yield break;
            }
        }

        throw lastException ?? new InvalidOperationException("所有端点都失败了");
    }

    private void ApplyAuthHeaders(HttpRequestMessage request)
    {
        // For Anthropic official API, use x-api-key header
        if (IsAnthropicHost(_baseUrl))
        {
            request.Headers.Add("x-api-key", _apiKey);
            request.Headers.Add("anthropic-version", AnthropicApiVersion);
        }
        else
        {
            // For relay services and proxies, use Bearer auth
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
            // Also try anthropic-version for compatibility
            request.Headers.Add("anthropic-version", AnthropicApiVersion);
        }
    }

    private IReadOnlyList<string> BuildEndpointCandidates()
    {
        var endpoints = new List<string>();

        // If URL already ends with /messages, use as-is
        if (_baseUrl.EndsWith("/messages", StringComparison.OrdinalIgnoreCase) ||
            _baseUrl.EndsWith("/v1/messages", StringComparison.OrdinalIgnoreCase))
        {
            endpoints.Add(_baseUrl);
            return endpoints;
        }

        // If URL ends with /v1, append /messages
        if (_baseUrl.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
        {
            endpoints.Add(_baseUrl + "/messages");
            return endpoints;
        }

        // Try multiple candidates
        endpoints.Add(_baseUrl + "/v1/messages");
        endpoints.Add(_baseUrl + "/messages");

        return endpoints;
    }

    private static bool IsAnthropicHost(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.Host.Contains("anthropic.com", StringComparison.OrdinalIgnoreCase) ||
               uri.Host.Contains("claude", StringComparison.OrdinalIgnoreCase);
    }

    private static string ParseClaudeContent(string json)
    {
        using var doc = JsonDocument.Parse(json);

        // Try content array format
        if (doc.RootElement.TryGetProperty("content", out var contentNode))
        {
            if (contentNode.ValueKind == JsonValueKind.Array)
            {
                var texts = new List<string>();
                foreach (var item in contentNode.EnumerateArray())
                {
                    if (item.TryGetProperty("text", out var textNode))
                    {
                        texts.Add(textNode.GetString() ?? "");
                    }
                }
                if (texts.Count > 0)
                {
                    return string.Join(Environment.NewLine, texts);
                }
            }
        }

        // Fallback: try to get any text field
        if (doc.RootElement.TryGetProperty("text", out var textProp))
        {
            return textProp.GetString() ?? "";
        }

        return json;
    }

    private static string TryExtractDelta(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);

            // Try delta.text format
            if (doc.RootElement.TryGetProperty("delta", out var deltaNode) &&
                deltaNode.ValueKind == JsonValueKind.Object &&
                deltaNode.TryGetProperty("text", out var textNode) &&
                textNode.ValueKind == JsonValueKind.String)
            {
                return textNode.GetString() ?? "";
            }

            // Try content_block_delta format
            if (doc.RootElement.TryGetProperty("type", out var typeNode))
            {
                var type = typeNode.GetString() ?? "";
                if (type.Equals("content_block_delta", StringComparison.OrdinalIgnoreCase) &&
                    doc.RootElement.TryGetProperty("delta", out var cbDelta) &&
                    cbDelta.TryGetProperty("text", out var cbText))
                {
                    return cbText.GetString() ?? "";
                }
            }
        }
        catch
        {
            // Ignore parse errors
        }

        return "";
    }
}

public class ClaudeResponse
{
    public List<ClaudeContent> Content { get; set; } = new();
}

public class ClaudeContent
{
    public string Text { get; set; } = "";
}

public class ClaudeStreamChunk
{
    public ClaudeDelta Delta { get; set; } = new();
}

public class ClaudeDelta
{
    public string? Text { get; set; }
}
