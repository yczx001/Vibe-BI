using Microsoft.AspNetCore.Mvc;
using VibeBi.Core.Models;
using VibeBi.Core.Services;

namespace VibeBi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportController : ControllerBase
{
    private readonly IReportFileService _reportService;
    private readonly ILogger<ReportController> _logger;

    public ReportController(IReportFileService reportService, ILogger<ReportController> logger)
    {
        _reportService = reportService;
        _logger = logger;
    }

    [HttpPost("save")]
    public async Task<IActionResult> Save([FromBody] SaveReportRequest request)
    {
        try
        {
            var package = new ReportPackage
            {
                Manifest = request.Manifest,
                DataSource = request.DataSource,
                Pages = request.Pages,
                Queries = request.Queries,
                Theme = request.Theme,
                AiContext = request.AiContext
            };

            var tempPath = Path.Combine(Path.GetTempPath(), $"{request.Manifest.Id}.vbi");
            await _reportService.SaveReportAsync(tempPath, package);

            return Ok(new { success = true, path = tempPath });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save report");
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("open")]
    public async Task<ActionResult<ReportPackage>> Open([FromBody] OpenReportRequest request)
    {
        try
        {
            var package = await _reportService.LoadReportAsync(request.FilePath);
            return Ok(package);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open report");
            return BadRequest(new { message = ex.Message });
        }
    }
}

public record SaveReportRequest
{
    public required ReportDefinition Manifest { get; init; }
    public required DataSourceConfig DataSource { get; init; }
    public required List<PageDefinition> Pages { get; init; }
    public required List<QueryDefinition> Queries { get; init; }
    public required ThemeDefinition Theme { get; init; }
    public object? AiContext { get; init; }
}

public record OpenReportRequest
{
    public required string FilePath { get; init; }
}
