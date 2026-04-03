using System.Data;
using System.Data.Common;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
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
    private static DateTimeOffset _cachedPortScanAt = DateTimeOffset.MinValue;
    private static IReadOnlyList<int> _cachedPowerBiPorts = Array.Empty<int>();

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
        var normalizedConnectionString = NormalizeConnectionString(connectionString);
        try
        {
            return await ExecuteCoreAsync(normalizedConnectionString, dax, startTime);
        }
        catch (Exception ex) when (ShouldRetryWithResolvedLocalPort(ex, normalizedConnectionString))
        {
            var retryConnectionString = await TryResolveActivePowerBiConnectionStringAsync(normalizedConnectionString);
            if (string.IsNullOrWhiteSpace(retryConnectionString) || string.Equals(retryConnectionString, normalizedConnectionString, StringComparison.OrdinalIgnoreCase))
            {
                throw;
            }

            return await ExecuteCoreAsync(retryConnectionString, dax, startTime);
        }
    }

    private static async Task<QueryResult> ExecuteCoreAsync(string normalizedConnectionString, string dax, DateTime startTime)
    {
        using var conn = new AdomdConnection(normalizedConnectionString);
        conn.Open();

        using var cmd = new AdomdCommand(dax, conn);
        using var reader = cmd.ExecuteReader();

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

    private static bool ShouldRetryWithResolvedLocalPort(Exception exception, string normalizedConnectionString)
    {
        var dataSource = TryGetConnectionProperty(normalizedConnectionString, "Data Source");
        if (!TryParseLoopbackPort(dataSource, out _))
        {
            return false;
        }

        return EnumerateExceptions(exception).Any(ex => ex is System.Net.Sockets.SocketException socketEx && socketEx.SocketErrorCode == System.Net.Sockets.SocketError.ConnectionRefused)
            || EnumerateExceptions(exception).Any(ex =>
                ex.Message.Contains("无法建立连接", StringComparison.OrdinalIgnoreCase)
                || ex.Message.Contains("actively refused", StringComparison.OrdinalIgnoreCase)
                || ex.Message.Contains("connection refused", StringComparison.OrdinalIgnoreCase));
    }

    private static IEnumerable<Exception> EnumerateExceptions(Exception exception)
    {
        for (var current = exception; current != null; current = current.InnerException!)
        {
            yield return current;
            if (current.InnerException == null)
            {
                yield break;
            }
        }
    }

    private static bool TryParseLoopbackPort(string? dataSource, out int port)
    {
        port = 0;
        if (string.IsNullOrWhiteSpace(dataSource))
        {
            return false;
        }

        var normalized = dataSource.Trim();
        if (!normalized.StartsWith("localhost:", StringComparison.OrdinalIgnoreCase)
            && !normalized.StartsWith("127.0.0.1:", StringComparison.OrdinalIgnoreCase)
            && !normalized.StartsWith("[::1]:", StringComparison.OrdinalIgnoreCase)
            && !normalized.StartsWith("::1:", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var portText = normalized[(normalized.LastIndexOf(':') + 1)..];
        return int.TryParse(portText, out port);
    }

    private static string? TryGetConnectionProperty(string connectionString, string propertyName)
    {
        try
        {
            var builder = new DbConnectionStringBuilder
            {
                ConnectionString = connectionString
            };

            if (builder.TryGetValue(propertyName, out var value))
            {
                return value?.ToString();
            }
        }
        catch
        {
            // Ignore malformed connection strings and fall back to the original error.
        }

        return null;
    }

    private static string ReplaceConnectionProperty(string connectionString, string propertyName, string propertyValue)
    {
        var builder = new DbConnectionStringBuilder
        {
            ConnectionString = connectionString
        };
        builder[propertyName] = propertyValue;
        return builder.ConnectionString;
    }

    private static async Task<string?> TryResolveActivePowerBiConnectionStringAsync(string normalizedConnectionString)
    {
        var dataSource = TryGetConnectionProperty(normalizedConnectionString, "Data Source");
        if (!TryParseLoopbackPort(dataSource, out var originalPort))
        {
            return null;
        }

        var activePorts = await ScanActivePowerBiPortsAsync();
        if (activePorts.Count == 0 || activePorts.Contains(originalPort))
        {
            return null;
        }

        if (activePorts.Count != 1)
        {
            return null;
        }

        return ReplaceConnectionProperty(normalizedConnectionString, "Data Source", $"localhost:{activePorts[0]}");
    }

    private static async Task<IReadOnlyList<int>> ScanActivePowerBiPortsAsync()
    {
        if ((DateTimeOffset.UtcNow - _cachedPortScanAt) < TimeSpan.FromSeconds(5))
        {
            return _cachedPowerBiPorts;
        }

        if (!OperatingSystem.IsWindows())
        {
            _cachedPortScanAt = DateTimeOffset.UtcNow;
            _cachedPowerBiPorts = Array.Empty<int>();
            return _cachedPowerBiPorts;
        }

        const string script = """
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$pbis = Get-Process -Name PBIDesktop -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object Id
$engines = Get-CimInstance Win32_Process -Filter "Name = 'msmdsrv.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId
$ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalAddress -in @('127.0.0.1', '::1') } |
  Select-Object LocalPort, OwningProcess
$result = foreach ($pbi in $pbis) {
  $children = @($engines | Where-Object { $_.ParentProcessId -eq $pbi.Id })
  $ports |
    Where-Object { $children.ProcessId -contains $_.OwningProcess } |
    Select-Object -ExpandProperty LocalPort -Unique
}
$result | Sort-Object -Unique | ConvertTo-Json -Compress
""";

        try
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -Command \"{script.Replace("\"", "\\\"").Replace(Environment.NewLine, "; ")}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using var process = Process.Start(startInfo);
            if (process == null)
            {
                return _cachedPowerBiPorts;
            }

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            var stdout = await stdoutTask;
            _ = await stderrTask;

            var parsedPorts = ParsePortsFromJson(stdout);
            _cachedPortScanAt = DateTimeOffset.UtcNow;
            _cachedPowerBiPorts = parsedPorts;
            return _cachedPowerBiPorts;
        }
        catch
        {
            _cachedPortScanAt = DateTimeOffset.UtcNow;
            _cachedPowerBiPorts = Array.Empty<int>();
            return _cachedPowerBiPorts;
        }
    }

    private static IReadOnlyList<int> ParsePortsFromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return Array.Empty<int>();
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return document.RootElement.ValueKind switch
            {
                JsonValueKind.Array => document.RootElement
                    .EnumerateArray()
                    .Where(element => element.TryGetInt32(out _))
                    .Select(element => element.GetInt32())
                    .Distinct()
                    .ToArray(),
                JsonValueKind.Number when document.RootElement.TryGetInt32(out var port) => new[] { port },
                _ => Array.Empty<int>()
            };
        }
        catch
        {
            return Array.Empty<int>();
        }
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
