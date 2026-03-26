using Microsoft.AspNetCore.Mvc;
using VibeBi.Core.Models;
using VibeBi.Core.Services;

namespace VibeBi.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class QueryController : ControllerBase
{
    private readonly IDaxExecutionService _daxService;
    private readonly ILogger<QueryController> _logger;

    public QueryController(IDaxExecutionService daxService, ILogger<QueryController> logger)
    {
        _daxService = daxService;
        _logger = logger;
    }

    [HttpPost("execute")]
    public async Task<ActionResult<QueryResult>> Execute([FromBody] ExecuteQueryRequest request)
    {
        try
        {
            _logger.LogInformation("Executing DAX query with connection string: {ConnectionString}, DAX: {Dax}",
                request.ConnectionString, request.Dax);
            var result = await _daxService.ExecuteAsync(request.ConnectionString, request.Dax);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute query with connection string: {ConnectionString}", request.ConnectionString);
            return BadRequest(new { message = ex.Message, dax = request.Dax, connectionString = request.ConnectionString });
        }
    }

    [HttpPost("batch")]
    public async Task<ActionResult<List<QueryResult>>> ExecuteBatch([FromBody] ExecuteBatchRequest request)
    {
        try
        {
            var results = new List<QueryResult>();
            foreach (var dax in request.Queries)
            {
                var result = await _daxService.ExecuteAsync(request.ConnectionString, dax);
                results.Add(result);
            }
            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to execute batch queries");
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("validate")]
    public async Task<IActionResult> Validate([FromBody] ExecuteQueryRequest request)
    {
        try
        {
            var validation = await _daxService.ValidateDetailedAsync(request.ConnectionString, request.Dax);
            return Ok(new { valid = validation.IsValid, message = validation.ErrorMessage });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to validate query");
            return BadRequest(new { valid = false, message = ex.Message });
        }
    }
}

public record ExecuteQueryRequest
{
    public required string ConnectionString { get; init; }
    public required string Dax { get; init; }
}

public record ExecuteBatchRequest
{
    public required string ConnectionString { get; init; }
    public required List<string> Queries { get; init; }
}
