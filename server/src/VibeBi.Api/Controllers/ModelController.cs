using Microsoft.AspNetCore.Mvc;
using VibeBi.Core.Models;
using VibeBi.Core.Services;

namespace VibeBi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ModelController : ControllerBase
{
    private readonly IModelMetadataService _metadataService;
    private readonly ILogger<ModelController> _logger;

    public ModelController(IModelMetadataService metadataService, ILogger<ModelController> logger)
    {
        _metadataService = metadataService;
        _logger = logger;
    }

    [HttpPost("connect")]
    public async Task<IActionResult> Connect([FromBody] ConnectRequest request)
    {
        try
        {
            var success = await _metadataService.TestConnectionAsync(request.ConnectionString);
            if (success)
            {
                return Ok(new { success = true, message = "Connection successful" });
            }
            return BadRequest(new { success = false, message = "Failed to connect" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to model");
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("metadata")]
    public async Task<ActionResult<ModelMetadata>> GetMetadata([FromBody] ConnectRequest request)
    {
        try
        {
            var metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
            return Ok(metadata);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get metadata");
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("tables")]
    public async Task<ActionResult<List<TableInfo>>> GetTables([FromBody] ConnectRequest request)
    {
        try
        {
            var metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
            return Ok(metadata.Tables);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get tables");
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("measures")]
    public async Task<ActionResult<List<MeasureInfo>>> GetMeasures([FromBody] ConnectRequest request)
    {
        try
        {
            var metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
            return Ok(metadata.Measures);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get measures");
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("relationships")]
    public async Task<ActionResult<List<RelationshipInfo>>> GetRelationships([FromBody] ConnectRequest request)
    {
        try
        {
            var metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
            return Ok(metadata.Relationships);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get relationships");
            return BadRequest(new { message = ex.Message });
        }
    }
}

public record ConnectRequest
{
    public required string ConnectionString { get; init; }
}
