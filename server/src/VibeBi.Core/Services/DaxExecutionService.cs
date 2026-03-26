using System.Data;
using Microsoft.AnalysisServices.AdomdClient;
using VibeBi.Core.Models;

namespace VibeBi.Core.Services;

public interface IDaxExecutionService
{
    Task<QueryResult> ExecuteAsync(string connectionString, string dax);
    Task<QueryResult> ExecuteBatchAsync(string connectionString, List<string> daxQueries);
    Task<bool> ValidateAsync(string connectionString, string dax);
    Task<DaxValidationResult> ValidateDetailedAsync(string connectionString, string dax);
}

public record DaxValidationResult
{
    public required bool IsValid { get; init; }
    public string? ErrorMessage { get; init; }
}

public class DaxExecutionService : IDaxExecutionService
{
    private string NormalizeConnectionString(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            return connectionString;

        // If it already has Provider=, use as-is
        if (connectionString.Contains("Provider=", StringComparison.OrdinalIgnoreCase))
            return connectionString;

        // If it already has Data Source=, check if it needs Provider
        if (connectionString.Contains("Data Source=", StringComparison.OrdinalIgnoreCase))
        {
            // Add MSOLAP provider for Power BI Desktop / SSAS compatibility
            if (!connectionString.Contains("MSOLAP", StringComparison.OrdinalIgnoreCase))
            {
                return $"Provider=MSOLAP;{connectionString}";
            }
            return connectionString;
        }

        // If it looks like "localhost:port" or "server:port", wrap it
        if (connectionString.Contains(':'))
        {
            return $"Provider=MSOLAP;Data Source={connectionString};";
        }

        // Otherwise assume it's a server name
        return $"Provider=MSOLAP;Data Source={connectionString};";
    }

    public async Task<QueryResult> ExecuteAsync(string connectionString, string dax)
    {
        var startTime = DateTime.UtcNow;

        // Normalize connection string for Power BI Desktop
        // If it's just "localhost:port" or "server:port", wrap it properly
        var normalizedConnectionString = NormalizeConnectionString(connectionString);

        using var conn = new AdomdConnection(normalizedConnectionString);
        conn.Open(); // ADOMD doesn't support async Open

        using var cmd = new AdomdCommand(dax, conn);
        using var reader = cmd.ExecuteReader(); // ADOMD doesn't support async ExecuteReader

        var columns = new List<ColumnSchema>();
        var rows = new List<Dictionary<string, object?>>();

        // Get column schema
        var schemaTable = reader.GetSchemaTable();
        if (schemaTable != null)
        {
            // Check if DataTypeName column exists in schema table
            bool hasDataTypeName = schemaTable.Columns.Contains("DataTypeName");
            bool hasDataType = schemaTable.Columns.Contains("DataType");

            foreach (DataRow row in schemaTable.Rows)
            {
                string dataType;
                if (hasDataTypeName)
                {
                    dataType = row["DataTypeName"].ToString()!;
                }
                else if (hasDataType && row["DataType"] is Type t)
                {
                    dataType = t.Name;
                }
                else
                {
                    dataType = "Unknown";
                }

                columns.Add(new ColumnSchema
                {
                    Name = row["ColumnName"].ToString()!,
                    DataType = dataType
                });
            }
        }
        else
        {
            // Fallback: read from reader directly
            for (int i = 0; i < reader.FieldCount; i++)
            {
                columns.Add(new ColumnSchema
                {
                    Name = reader.GetName(i),
                    DataType = reader.GetFieldType(i)?.Name ?? "Unknown"
                });
            }
        }

        // Read rows
        while (reader.Read())
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                var value = reader.GetValue(i);
                row[reader.GetName(i)] = value is DBNull ? null : value;
            }
            rows.Add(row);
        }

        var executionTime = (long)(DateTime.UtcNow - startTime).TotalMilliseconds;

        return new QueryResult
        {
            Columns = columns,
            Rows = rows,
            RowCount = rows.Count,
            ExecutionTimeMs = executionTime
        };
    }

    public async Task<QueryResult> ExecuteBatchAsync(string connectionString, List<string> daxQueries)
    {
        // For batch execution, we combine results
        // In a real implementation, you might want to parallelize this
        var allResults = new List<QueryResult>();

        foreach (var query in daxQueries)
        {
            var result = await ExecuteAsync(connectionString, query);
            allResults.Add(result);
        }

        // For now, return the first result
        // In a real implementation, you might return a combined result or multiple results
        return allResults.FirstOrDefault() ?? new QueryResult
        {
            Columns = new List<ColumnSchema>(),
            Rows = new List<Dictionary<string, object?>>(),
            RowCount = 0,
            ExecutionTimeMs = 0
        };
    }

    public async Task<bool> ValidateAsync(string connectionString, string dax)
    {
        var result = await ValidateDetailedAsync(connectionString, dax);
        return result.IsValid;
    }

    public async Task<DaxValidationResult> ValidateDetailedAsync(string connectionString, string dax)
    {
        try
        {
            var normalizedConnectionString = NormalizeConnectionString(connectionString);
            using var conn = new AdomdConnection(normalizedConnectionString);
            conn.Open();

            using var cmd = new AdomdCommand(dax, conn);
            using var reader = cmd.ExecuteReader();
            _ = reader.GetSchemaTable();

            return new DaxValidationResult
            {
                IsValid = true
            };
        }
        catch (Exception ex)
        {
            return new DaxValidationResult
            {
                IsValid = false,
                ErrorMessage = ex.Message
            };
        }
    }
}
