using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using VibeBi.AI.Orchestration;
using VibeBi.AI.Providers;
using VibeBi.Core.Models;
using VibeBi.Core.Services;

namespace VibeBi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AiController : ControllerBase
{
    private static readonly JsonSerializerOptions ProgressJsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IModelMetadataService _metadataService;
    private readonly ILogger<AiController> _logger;

    public AiController(IModelMetadataService metadataService, ILogger<AiController> logger)
    {
        _metadataService = metadataService;
        _logger = logger;
    }

    [HttpPost("generate")]
    public async Task GenerateReport([FromBody] GenerateReportRequest request)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";

        // Get API key from request header first, then environment
        var apiKey = Request.Headers["X-API-Key"].FirstOrDefault()
            ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");

        // Get custom base URL and model from header (optional)
        var baseUrl = Request.Headers["X-API-BaseUrl"].FirstOrDefault();
        var model = Request.Headers["X-API-Model"].FirstOrDefault();

        if (string.IsNullOrEmpty(apiKey))
        {
            await WriteProgressAsync(new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "未配置 AI API Key，请在应用设置中配置"
            });
            return;
        }

        var aiProvider = new ClaudeProvider(apiKey, baseUrl, model);
        var generator = new ReportGenerator(aiProvider, _metadataService);

        try
        {
            await foreach (var progress in generator.GenerateAsync(request))
            {
                await WriteProgressAsync(progress);

                if (progress.Step == "complete" || progress.Step == "error")
                {
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate report");
            await WriteProgressAsync(new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"生成失败: {ex.Message}"
            });
        }
    }

    [HttpPost("refine")]
    public async Task RefineReport([FromBody] RefineReportRequest request)
    {
        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";

        // Get API key from request header first, then environment
        var apiKey = Request.Headers["X-API-Key"].FirstOrDefault()
            ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");

        // Get custom base url and model from header (optional)
        var baseUrl = Request.Headers["X-API-BaseUrl"].FirstOrDefault();
        var model = Request.Headers["X-API-Model"].FirstOrDefault();

        if (string.IsNullOrEmpty(apiKey))
        {
            await WriteProgressAsync(new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "未配置 AI API Key，请在应用设置中配置"
            });
            return;
        }

        var aiProvider = new ClaudeProvider(apiKey, baseUrl, model);
        var generator = new ReportGenerator(aiProvider, _metadataService);

        try
        {
            await foreach (var progress in generator.RefineAsync(request))
            {
                await WriteProgressAsync(progress);

                if (progress.Step == "complete" || progress.Step == "error")
                {
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to refine report");
            await WriteProgressAsync(new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"修改失败: {ex.Message}"
            });
        }
    }

    [HttpPost("test-connection")]
    public async Task<IActionResult> TestConnection()
    {
        try
        {
            // Get API key from request header
            var apiKey = Request.Headers["X-API-Key"].FirstOrDefault();
            var baseUrl = Request.Headers["X-API-BaseUrl"].FirstOrDefault();
            var provider = Request.Headers["X-API-Provider"].FirstOrDefault() ?? "claude";
            var model = Request.Headers["X-API-Model"].FirstOrDefault();

            if (string.IsNullOrEmpty(apiKey))
            {
                return Ok(new { ok = false, message = "未配置 API Key" });
            }

            // Create provider and test with a simple ping request
            var aiProvider = new ClaudeProvider(apiKey, baseUrl, model);

            // Try a simple completion to verify connection
            var result = await aiProvider.CompleteAsync(
                "You are a helpful assistant. Reply with 'pong' only.",
                "ping",
                CancellationToken.None);

            if (!string.IsNullOrEmpty(result))
            {
                return Ok(new { ok = true, message = "连接成功" });
            }
            else
            {
                return Ok(new { ok = false, message = "API 返回空响应" });
            }
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "AI connection test failed - HTTP error");
            return Ok(new { ok = false, message = $"HTTP 错误: {ex.Message}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI connection test failed");
            return Ok(new { ok = false, message = $"连接失败: {ex.Message}" });
        }
    }

    private async Task WriteProgressAsync(GenerationProgress progress)
    {
        var json = JsonSerializer.Serialize(progress, ProgressJsonOptions);
        await Response.WriteAsync($"data: {json}\n\n");
        await Response.Body.FlushAsync();
    }
}
