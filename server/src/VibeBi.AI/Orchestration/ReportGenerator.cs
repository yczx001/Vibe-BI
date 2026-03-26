using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using VibeBi.AI.Providers;
using VibeBi.Core.Models;
using VibeBi.Core.Services;

namespace VibeBi.AI.Orchestration;

public record GenerateReportRequest
{
    public required string ConnectionString { get; init; }
    public required string UserPrompt { get; init; }
    public int PageCount { get; init; } = 1;
    public string? Style { get; init; }
}

public record RefineReportRequest
{
    public required string ConnectionString { get; init; }
    public required string UserPrompt { get; init; }
    public CurrentReportContext? CurrentContext { get; init; }
}

public record ComposePromptRequest
{
    public required string ConnectionString { get; init; }
    public required string Mode { get; init; }
    public string? UserIntent { get; init; }
    public List<ComposePromptAssetSummary>? Assets { get; init; }
    public CurrentReportContext? CurrentContext { get; init; }
}

public record ComposePromptAssetSummary
{
    public required string Name { get; init; }
    public string? ChartType { get; init; }
    public int? RowCount { get; init; }
    public double? Score { get; init; }
    public List<string>? VisibleFields { get; init; }
}

public record CurrentReportContext
{
    public required ReportDefinition Report { get; init; }
    public required List<PageDefinition> Pages { get; init; }
    public required List<QueryDefinition> Queries { get; init; }
}

public class ReportGenerator
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };
    private static readonly ThemeDefinition DefaultReportTheme = new()
    {
        Name = "Vibe Editorial Light",
        Colors = new ThemeColors
        {
            Primary = "#0E7490",
            Secondary = "#C97A32",
            Background = "#F4F1EA",
            Surface = "#FCFBF8",
            Text = "#152132",
            TextSecondary = "#617082",
            Chart = new List<string> { "#0E7490", "#2563EB", "#C97A32", "#7C9A4D", "#8B5E3C", "#C2410C" }
        },
        Typography = new ThemeTypography
        {
            FontFamily = "\"Source Han Sans SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Noto Sans SC\", \"PingFang SC\", \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
        },
        Components = new ThemeComponents
        {
            Card = new ComponentTheme
            {
                BorderRadius = 22,
                Shadow = "0 18px 40px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255,255,255,0.76)",
                Padding = 22
            }
        }
    };
    private static readonly ThemeDefinition DefaultDarkReportTheme = new()
    {
        Name = "Vibe Editorial Dark",
        Colors = new ThemeColors
        {
            Primary = "#38BDF8",
            Secondary = "#F59E0B",
            Background = "#0F172A",
            Surface = "#111827",
            Text = "#E5EEF7",
            TextSecondary = "#94A3B8",
            Chart = new List<string> { "#38BDF8", "#60A5FA", "#F59E0B", "#F97316", "#34D399", "#A78BFA" }
        },
        Typography = new ThemeTypography
        {
            FontFamily = "\"Source Han Sans SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Noto Sans SC\", \"PingFang SC\", \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
        },
        Components = new ThemeComponents
        {
            Card = new ComponentTheme
            {
                BorderRadius = 22,
                Shadow = "0 18px 40px rgba(2, 6, 23, 0.42), inset 0 1px 0 rgba(255,255,255,0.04)",
                Padding = 22
            }
        }
    };
    private static readonly ThemeDefinition DraculaReportTheme = new()
    {
        Name = "Dracula",
        Colors = new ThemeColors
        {
            Primary = "#BD93F9",
            Secondary = "#FFB86C",
            Background = "#282A36",
            Surface = "#1F2230",
            Text = "#F8F8F2",
            TextSecondary = "#B7BDD6",
            Chart = new List<string> { "#BD93F9", "#FF79C6", "#8BE9FD", "#50FA7B", "#FFB86C", "#FF5555" }
        },
        Typography = new ThemeTypography
        {
            FontFamily = "\"Source Han Sans SC\", \"Microsoft YaHei UI\", \"Microsoft YaHei\", \"Noto Sans SC\", \"PingFang SC\", \"Segoe UI Variable\", \"Segoe UI\", system-ui, sans-serif"
        },
        Components = new ThemeComponents
        {
            Card = new ComponentTheme
            {
                BorderRadius = 20,
                Shadow = "0 18px 44px rgba(10, 12, 24, 0.52), inset 0 1px 0 rgba(255,255,255,0.04)",
                Padding = 22
            }
        }
    };

    private readonly IAIProvider _ai;
    private readonly IModelMetadataService _metadataService;
    private readonly IDaxExecutionService _daxExecutionService;

    public ReportGenerator(
        IAIProvider ai,
        IModelMetadataService metadataService,
        IDaxExecutionService daxExecutionService)
    {
        _ai = ai;
        _metadataService = metadataService;
        _daxExecutionService = daxExecutionService;
    }

    public async Task<string> ComposePromptAsync(ComposePromptRequest request, CancellationToken ct = default)
    {
        var metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
        var prompt = BuildPromptCompositionInput(metadata, request);
        var response = await _ai.CompleteAsync(SystemPrompts.PromptComposition, prompt, ct);
        return NormalizePlainTextResponse(response);
    }

    public async IAsyncEnumerable<GenerationProgress> GenerateAsync(GenerateReportRequest request)
    {
        string? errorMessage = null;
        ReportDefinition? report = null;
        List<PageDefinition>? pages = null;
        List<QueryDefinition>? queries = null;
        ModelMetadata? metadata = null;
        string? completionMessage = null;

        yield return new GenerationProgress { Step = "reading_metadata", ProgressPercent = 10, Message = "正在读取数据模型..." };

        try
        {
            metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
        }
        catch (Exception ex)
        {
            errorMessage = $"读取模型失败: {ex.Message}";
        }

        if (errorMessage != null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = errorMessage
            };
            yield break;
        }

        if (metadata == null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "无法读取模型元数据"
            };
            yield break;
        }

        yield return new GenerationProgress { Step = "building_prompt", ProgressPercent = 20, Message = "正在构建 AI 提示..." };
        var prompt = BuildPrompt(metadata, request);

        yield return new GenerationProgress { Step = "generating", ProgressPercent = 30, Message = "AI 正在生成报表..." };
        var reportJson = new StringBuilder();

        await foreach (var chunk in _ai.StreamCompleteAsync(SystemPrompts.ReportGeneration, prompt))
        {
            reportJson.Append(chunk);
            yield return new GenerationProgress
            {
                Step = "generating",
                ProgressPercent = Math.Min(79, 30 + (reportJson.Length / 100)),
                PartialContent = chunk
            };
        }

        yield return new GenerationProgress { Step = "parsing", ProgressPercent = 80, Message = "正在解析报表定义..." };

        try
        {
            var generatedResult = DeserializeAiReportResult(reportJson.ToString());
            report = generatedResult.Report;
            pages = generatedResult.Pages;
            queries = generatedResult.Queries;
            completionMessage = generatedResult.Message;
        }
        catch (Exception ex)
        {
            errorMessage = $"解析报表定义失败: {ex.Message}";
        }

        if (errorMessage != null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = errorMessage
            };
            yield break;
        }

        if (report == null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "生成的报表为空"
            };
            yield break;
        }

        if (pages == null || pages.Count == 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "AI 未返回任何页面定义，无法渲染报表"
            };
            yield break;
        }

        queries ??= new List<QueryDefinition>();

        var requiredQueryIds = pages
            .SelectMany(page => page.Components)
            .Select(component => component.QueryRef)
            .Where(queryRef => !string.IsNullOrWhiteSpace(queryRef))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var availableQueryIds = new HashSet<string>(queries.Select(query => query.Id), StringComparer.Ordinal);
        var missingQueryIds = requiredQueryIds
            .Where(queryId => !availableQueryIds.Contains(queryId))
            .ToList();

        if (missingQueryIds.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"AI 返回的页面引用了不存在的查询: {string.Join(", ", missingQueryIds)}"
            };
            yield break;
        }

        var validationFailures = await ValidateQueriesAsync(request.ConnectionString, queries);
        if (validationFailures.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "repairing_queries",
                ProgressPercent = 88,
                Message = $"检测到 {validationFailures.Count} 条无效查询，正在自动修复..."
            };

            for (var repairAttempt = 0; repairAttempt < 4 && validationFailures.Count > 0; repairAttempt++)
            {
                string? continueRepairMessage = null;

                try
                {
                    var repairedResult = await RepairInvalidQueriesAsync(
                        request.ConnectionString,
                        metadata,
                        new CurrentReportContext
                        {
                            Report = report,
                            Pages = pages,
                            Queries = queries
                        },
                        validationFailures);

                    report = repairedResult.Report;
                    pages = repairedResult.Pages ?? pages;
                    queries = repairedResult.Queries ?? queries;
                    completionMessage = repairedResult.Message ?? completionMessage;
                    validationFailures = await ValidateQueriesAsync(request.ConnectionString, queries);

                    if (validationFailures.Count > 0 && repairAttempt < 3)
                    {
                        continueRepairMessage = $"仍有 {validationFailures.Count} 条查询无效，正在继续修复...";
                    }
                }
                catch (Exception ex)
                {
                    errorMessage = $"自动修复无效查询失败: {ex.Message}";
                    break;
                }

                if (!string.IsNullOrWhiteSpace(continueRepairMessage))
                {
                    yield return new GenerationProgress
                    {
                        Step = "repairing_queries",
                        ProgressPercent = 92,
                        Message = continueRepairMessage
                    };
                }
            }
        }

        if (errorMessage != null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = errorMessage
            };
            yield break;
        }

        if (validationFailures.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"以下查询仍然无效，无法渲染报表: {SummarizeQueryValidationFailures(validationFailures)}"
            };
            yield break;
        }

        yield return new GenerationProgress
        {
            Step = "complete",
            ProgressPercent = 100,
            Message = completionMessage ?? "报表生成完成",
            Report = report,
            Pages = pages,
            Queries = queries
        };
    }

    public async IAsyncEnumerable<GenerationProgress> RefineAsync(RefineReportRequest request)
    {
        string? errorMessage = null;
        ReportDefinition? report = null;
        List<PageDefinition>? pages = null;
        List<QueryDefinition>? queries = null;
        string? completionMessage = null;
        var lockQueries = IsVisualOnlyRefinementRequest(request.UserPrompt);

        yield return new GenerationProgress { Step = "validating", ProgressPercent = 10, Message = "正在分析当前报表..." };

        if (request.CurrentContext == null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "缺少当前报表上下文"
            };
            yield break;
        }

        yield return new GenerationProgress { Step = "building_prompt", ProgressPercent = 20, Message = "正在构建修改提示..." };
        var prompt = BuildRefinementPrompt(request);

        yield return new GenerationProgress { Step = "refining", ProgressPercent = 30, Message = "AI 正在修改报表..." };
        var reportJson = new StringBuilder();

        await foreach (var chunk in _ai.StreamCompleteAsync(SystemPrompts.ReportRefinement, prompt))
        {
            reportJson.Append(chunk);
            yield return new GenerationProgress
            {
                Step = "refining",
                ProgressPercent = Math.Min(79, 30 + (reportJson.Length / 100)),
                PartialContent = chunk
            };
        }

        yield return new GenerationProgress { Step = "parsing", ProgressPercent = 80, Message = "正在解析修改结果..." };

        try
        {
            var refinedResult = DeserializeAiReportResult(reportJson.ToString(), request.CurrentContext);
            report = refinedResult.Report;
            pages = refinedResult.Pages ?? request.CurrentContext.Pages;
            queries = lockQueries
                ? request.CurrentContext.Queries
                : refinedResult.Queries ?? request.CurrentContext.Queries;
            completionMessage = refinedResult.Message;
        }
        catch (Exception ex)
        {
            errorMessage = $"解析修改结果失败: {ex.Message}";
        }

        if (errorMessage != null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = errorMessage
            };
            yield break;
        }

        if (report == null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "修改后的报表为空"
            };
            yield break;
        }

        pages ??= request.CurrentContext.Pages;
        queries ??= request.CurrentContext.Queries;

        if (pages.Count == 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = "修改后的报表未包含任何页面"
            };
            yield break;
        }

        var requiredQueryIds = pages
            .SelectMany(page => page.Components)
            .Select(component => component.QueryRef)
            .Where(queryRef => !string.IsNullOrWhiteSpace(queryRef))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var availableQueryIds = new HashSet<string>(queries.Select(query => query.Id), StringComparer.Ordinal);
        var missingQueryIds = requiredQueryIds
            .Where(queryId => !availableQueryIds.Contains(queryId))
            .ToList();

        if (missingQueryIds.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"修改后的页面引用了不存在的查询: {string.Join(", ", missingQueryIds)}"
            };
            yield break;
        }

        var validationFailures = await ValidateQueriesAsync(request.ConnectionString, queries);
        if (validationFailures.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "repairing_queries",
                ProgressPercent = 88,
                Message = $"检测到 {validationFailures.Count} 条无效查询，正在自动修复..."
            };

            ModelMetadata? metadata = null;
            try
            {
                metadata = await _metadataService.GetMetadataAsync(request.ConnectionString);
            }
            catch (Exception ex)
            {
                errorMessage = $"自动修复无效查询失败: {ex.Message}";
            }

            if (errorMessage == null && metadata != null)
            {
            for (var repairAttempt = 0; repairAttempt < 4 && validationFailures.Count > 0; repairAttempt++)
                {
                    string? continueRepairMessage = null;

                    try
                    {
                        var repairedResult = await RepairInvalidQueriesAsync(
                            request.ConnectionString,
                            metadata,
                            new CurrentReportContext
                            {
                                Report = report,
                                Pages = pages,
                                Queries = queries
                            },
                            validationFailures);

                        report = repairedResult.Report;
                        pages = repairedResult.Pages ?? pages;
                        queries = repairedResult.Queries ?? queries;
                        completionMessage = repairedResult.Message ?? completionMessage;
                        validationFailures = await ValidateQueriesAsync(request.ConnectionString, queries);

                        if (validationFailures.Count > 0 && repairAttempt < 3)
                        {
                            continueRepairMessage = $"仍有 {validationFailures.Count} 条查询无效，正在继续修复...";
                        }
                    }
                    catch (Exception ex)
                    {
                        errorMessage = $"自动修复无效查询失败: {ex.Message}";
                        break;
                    }

                    if (!string.IsNullOrWhiteSpace(continueRepairMessage))
                    {
                        yield return new GenerationProgress
                        {
                            Step = "repairing_queries",
                            ProgressPercent = 92,
                            Message = continueRepairMessage
                        };
                    }
                }
            }
        }

        if (errorMessage != null)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = errorMessage
            };
            yield break;
        }

        if (validationFailures.Count > 0)
        {
            yield return new GenerationProgress
            {
                Step = "error",
                ProgressPercent = 100,
                Message = $"修改后的查询仍然无效，无法渲染报表: {SummarizeQueryValidationFailures(validationFailures)}"
            };
            yield break;
        }

        yield return new GenerationProgress
        {
            Step = "complete",
            ProgressPercent = 100,
            Message = completionMessage ?? "报表修改完成",
            Report = report,
            Pages = pages,
            Queries = queries
        };
    }

    private async Task<List<QueryValidationFailure>> ValidateQueriesAsync(
        string connectionString,
        IReadOnlyList<QueryDefinition> queries)
    {
        var failures = new List<QueryValidationFailure>();

        foreach (var query in queries)
        {
            if (string.IsNullOrWhiteSpace(query.Dax))
            {
                failures.Add(new QueryValidationFailure
                {
                    Id = query.Id,
                    Name = query.Name,
                    Dax = query.Dax,
                    ErrorMessage = "DAX 为空"
                });
                continue;
            }

            var validation = await _daxExecutionService.ValidateDetailedAsync(connectionString, query.Dax);
            if (!validation.IsValid)
            {
                failures.Add(new QueryValidationFailure
                {
                    Id = query.Id,
                    Name = query.Name,
                    Dax = query.Dax,
                    ErrorMessage = validation.ErrorMessage ?? "未知错误"
                });
            }
        }

        return failures;
    }

    private async Task<AiReportResult> RepairInvalidQueriesAsync(
        string connectionString,
        ModelMetadata metadata,
        CurrentReportContext currentContext,
        IReadOnlyList<QueryValidationFailure> failures,
        CancellationToken ct = default)
    {
        var basePrompt = BuildQueryRepairPrompt(metadata, currentContext, failures);
        Exception? lastException = null;

        for (var attempt = 1; attempt <= 2; attempt++)
        {
            var prompt = attempt == 1
                ? basePrompt
                : BuildQueryRepairRetryPrompt(basePrompt, lastException?.Message);

            var response = await _ai.CompleteAsync(SystemPrompts.QueryRepair, prompt, ct);

            try
            {
                return DeserializeAiReportResult(response, currentContext);
            }
            catch (Exception ex)
            {
                lastException = ex;
            }
        }

        throw new InvalidOperationException(lastException?.Message ?? "AI 未返回可解析的修复结果");
    }

    private static string SummarizeQueryValidationFailures(IReadOnlyList<QueryValidationFailure> failures)
    {
        return string.Join(
            "；",
            failures
                .Take(3)
                .Select(failure => $"{failure.Id}: {failure.ErrorMessage}"))
            + (failures.Count > 3 ? $"；另外还有 {failures.Count - 3} 条" : string.Empty);
    }

    private string BuildQueryRepairPrompt(
        ModelMetadata metadata,
        CurrentReportContext currentContext,
        IReadOnlyList<QueryValidationFailure> failures)
    {
        var sb = new StringBuilder();

        sb.AppendLine("## 任务");
        sb.AppendLine("当前报表 JSON 已生成，但其中部分 DAX 查询无效。请只修复查询相关问题，确保报表可执行可渲染。");
        sb.AppendLine();

        sb.AppendLine("## 模型概览");
        sb.AppendLine($"数据库: {metadata.DatabaseName}");
        sb.AppendLine("表与字段:");
        foreach (var table in metadata.Tables.Take(10))
        {
            sb.AppendLine($"- {table.Name}: {string.Join(", ", table.Columns.Take(10).Select(column => column.Name))}");
        }
        sb.AppendLine();

        if (metadata.Measures.Count > 0)
        {
            sb.AppendLine("度量:");
            foreach (var measure in metadata.Measures.Take(40))
            {
                sb.AppendLine($"- [{measure.Name}] ({measure.TableName})");
            }
            sb.AppendLine();
        }

        sb.AppendLine("## 校验失败的查询");
        foreach (var failure in failures)
        {
            sb.AppendLine($"- QueryId: {failure.Id}");
            sb.AppendLine($"  名称: {failure.Name}");
            sb.AppendLine($"  错误: {failure.ErrorMessage}");
            sb.AppendLine($"  当前 DAX: {failure.Dax}");
        }
        sb.AppendLine();

        sb.AppendLine("## 失败查询对应的组件用途");
        foreach (var failure in failures)
        {
            var consumers = DescribeQueryConsumers(currentContext, failure.Id).ToList();
            sb.AppendLine($"- QueryId: {failure.Id}");
            if (consumers.Count == 0)
            {
                sb.AppendLine("  - 当前没有组件直接引用这条查询，但仍需保持 query id 稳定。");
                continue;
            }

            foreach (var consumer in consumers)
            {
                sb.AppendLine($"  - {consumer}");
            }
        }
        sb.AppendLine();

        sb.AppendLine("## 当前报表上下文 JSON");
        sb.AppendLine(JsonSerializer.Serialize(
            new
            {
                report = currentContext.Report,
                pages = currentContext.Pages,
                queries = currentContext.Queries
            },
            JsonOptions));
        sb.AppendLine();

        sb.AppendLine("## 修复要求");
        sb.AppendLine("1. 只输出 JSON，不要解释，不要 Markdown 代码块");
        sb.AppendLine("2. 必须返回完整 JSON 对象，包含 report、pages、queries、message");
        sb.AppendLine("3. 保持 report id、page id、component id、query id 不变");
        sb.AppendLine("4. 优先只修复失败的 queries；除非确有必要，不要改动页面结构");
        sb.AppendLine("5. 如果修改了 query 输出字段名，必须同步更新引用该 query 的组件 config 字段名");
        sb.AppendLine("6. 修复后的每条 query 都必须是当前模型中真实可执行的 DAX");
        sb.AppendLine("7. KPI 单值查询优先使用 `EVALUATE ROW(\"Value\", [Measure])` 这种单行单值模式");
        sb.AppendLine("8. 线图/柱图/面积图优先使用 `EVALUATE SUMMARIZECOLUMNS(维度列, \"指标A\", [MeasureA], ...)`");
        sb.AppendLine("9. 饼图、结构分布、状态占比这类需要手工构造分类和值时，使用 `EVALUATE UNION(ROW(\"Category\", \"A\", \"Value\", [MeasureA]), ROW(\"Category\", \"B\", \"Value\", [MeasureB]))`");
        sb.AppendLine("10. 严禁使用 `EVALUATE { (\"A\", [MeasureA]), (\"B\", [MeasureB]) }` 这种二元组/多列 table constructor 写法，它会导致查询无效");
        sb.AppendLine("11. 严禁输出未加引号的中文别名、占位列名或伪造字段名");
        sb.AppendLine("12. 如果某条 query 多次修复仍失败，请优先简化为更稳妥的 SUMMARIZECOLUMNS / ROW / UNION(ROW...) 结构，而不是继续堆复杂表达式");

        return sb.ToString();
    }

    private static string BuildQueryRepairRetryPrompt(string basePrompt, string? parseError)
    {
        var sb = new StringBuilder();
        sb.AppendLine(basePrompt);
        sb.AppendLine();
        sb.AppendLine("## 上一轮输出问题");
        sb.AppendLine($"上一轮返回的 JSON 无法解析: {parseError ?? "未知错误"}");
        sb.AppendLine("请重新输出一次完整、合法、可反序列化的 JSON，并确保数字、引号、逗号和括号全部闭合。");
        return sb.ToString();
    }

    private static IEnumerable<string> DescribeQueryConsumers(CurrentReportContext context, string queryId)
    {
        foreach (var page in context.Pages)
        {
            foreach (var component in page.Components.Where(component =>
                         string.Equals(component.QueryRef, queryId, StringComparison.Ordinal)))
            {
                yield return $"{page.Name} / {component.Id} ({component.Type}): {DescribeComponentQueryRequirements(component)}";
            }
        }
    }

    private static string DescribeComponentQueryRequirements(ComponentDefinition component)
    {
        var configNode = component.Config == null
            ? null
            : JsonSerializer.SerializeToNode(component.Config, JsonOptions);

        return component.Type.ToLowerInvariant() switch
        {
            "kpi-card" => DescribeKpiRequirements(configNode),
            "echarts" => DescribeChartRequirements(configNode),
            "data-table" => DescribeTableRequirements(configNode),
            "text" => "文本组件，通常不应依赖 query；如保留 query，请确保字段命名自解释。",
            "filter" => "筛选组件；如保留 query，请仅返回与筛选展示直接相关的稳定字段。",
            _ => "请根据组件配置返回可直接渲染的字段。"
        };
    }

    private static string DescribeKpiRequirements(JsonNode? configNode)
    {
        var configObject = configNode as JsonObject;
        var title = GetStringProperty(configObject, "title") ?? "未命名 KPI";
        var valueField = GetStringProperty(configObject, "valueField") ?? "Value";
        var compareField = GetStringProperty(configObject, "comparisonField")
            ?? GetStringProperty(configObject, "compareField");

        return compareField == null
            ? $"KPI 标题「{title}」，至少返回字段 {valueField}。"
            : $"KPI 标题「{title}」，至少返回字段 {valueField}，并同时返回对比字段 {compareField}。";
    }

    private static string DescribeChartRequirements(JsonNode? configNode)
    {
        var configObject = configNode as JsonObject;
        var title = GetStringProperty(configObject, "title") ?? "未命名图表";
        var chartType = GetStringProperty(configObject, "chartType") ?? "echarts";
        var xAxisField = GetStringProperty(GetPropertyValue(configObject, "xAxis") as JsonObject, "field");
        var yAxisFields = CollectNamedFields(GetPropertyValue(configObject, "yAxis"));
        var seriesFields = CollectNamedFields(GetPropertyValue(configObject, "series"));
        var requiredFields = new List<string>();

        if (!string.IsNullOrWhiteSpace(xAxisField))
        {
            requiredFields.Add($"维度字段 {xAxisField}");
        }

        requiredFields.AddRange(yAxisFields.Select(field => $"数值字段 {field}"));
        requiredFields.AddRange(seriesFields
            .Where(field => yAxisFields.All(existing => !string.Equals(existing, field, StringComparison.OrdinalIgnoreCase)))
            .Select(field => $"序列字段 {field}"));

        return requiredFields.Count == 0
            ? $"图表标题「{title}」，类型 {chartType}，请返回能直接驱动该图的清晰分类字段和值字段。"
            : $"图表标题「{title}」，类型 {chartType}，需要字段: {string.Join("、", requiredFields.Distinct(StringComparer.OrdinalIgnoreCase))}。";
    }

    private static string DescribeTableRequirements(JsonNode? configNode)
    {
        var configObject = configNode as JsonObject;
        var columns = CollectNamedFields(GetPropertyValue(configObject, "columns"));

        return columns.Count == 0
            ? "表格组件，请返回结构稳定、字段名清晰的表格结果。"
            : $"表格组件，需要字段: {string.Join("、", columns.Distinct(StringComparer.OrdinalIgnoreCase))}。";
    }

    private static List<string> CollectNamedFields(JsonNode? node)
    {
        if (node is not JsonArray array)
        {
            if (node is JsonObject singleObject)
            {
                return new List<string>(GetFieldCandidates(singleObject));
            }

            return new List<string>();
        }

        return array
            .OfType<JsonObject>()
            .SelectMany(GetFieldCandidates)
            .Where(field => !string.IsNullOrWhiteSpace(field))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IEnumerable<string> GetFieldCandidates(JsonObject node)
    {
        var field = GetStringProperty(node, "field");
        if (!string.IsNullOrWhiteSpace(field))
        {
            yield return field;
        }

        var valueField = GetStringProperty(node, "valueField");
        if (!string.IsNullOrWhiteSpace(valueField))
        {
            yield return valueField;
        }

        var nameField = GetStringProperty(node, "nameField");
        if (!string.IsNullOrWhiteSpace(nameField))
        {
            yield return nameField;
        }
    }

    private string BuildRefinementPrompt(RefineReportRequest request)
    {
        var sb = new StringBuilder();
        var context = request.CurrentContext!;

        sb.AppendLine("## 当前报表结构");
        sb.AppendLine();
        sb.AppendLine($"报表名称: {context.Report.Name}");
        sb.AppendLine($"报表描述: {context.Report.Description}");
        sb.AppendLine($"当前主题: {DescribeTheme(context.Report.Theme)}");
        sb.AppendLine();

        sb.AppendLine("### 页面和组件");
        foreach (var page in context.Pages)
        {
            sb.AppendLine($"页面: {page.Name} (ID: {page.Id})");
            foreach (var comp in page.Components)
            {
                string? title = null;
                if (comp.Config is Dictionary<string, object> configDict && configDict.TryGetValue("title", out var titleObj))
                {
                    title = titleObj?.ToString();
                }
                sb.AppendLine($"  - [{comp.Id}] {comp.Type}: {title ?? "无标题"} (位置: x={comp.Position.X}, y={comp.Position.Y}, w={comp.Position.W}, h={comp.Position.H})");
            }
            sb.AppendLine();
        }

        sb.AppendLine("### 查询");
        foreach (var query in context.Queries.Take(10))
        {
            sb.AppendLine($"- [{query.Id}] {query.Name}: {query.Dax.Substring(0, Math.Min(80, query.Dax.Length))}...");
        }
        if (context.Queries.Count > 10)
        {
            sb.AppendLine($"- ... 还有 {context.Queries.Count - 10} 个查询");
        }
        sb.AppendLine();

        sb.AppendLine("## 用户修改需求");
        sb.AppendLine(request.UserPrompt);
        sb.AppendLine();

        sb.AppendLine("## 输出要求");
        sb.AppendLine("请生成修改后的报表定义，包含以下字段的 JSON 对象:");
        sb.AppendLine("- report: ReportDefinition 对象");
        sb.AppendLine("- pages: PageDefinition 数组（当需要重新布局、重新设计或调整组件时必须返回完整数组）");
        sb.AppendLine("- queries: QueryDefinition 数组（如未修改查询可省略，但不要重命名或替换已有查询 ID）");
        sb.AppendLine("- message: 修改说明字符串");
        sb.AppendLine();
        sb.AppendLine("如果返回 pages，则 pages 中每个 component 都必须包含完整的 id、type、position { x, y, w, h }。");
        sb.AppendLine("优先复用当前上下文中的 query id 和 component id；如果当前上下文已经是素材草稿，请将它设计成可交付的最终版式，而不是简单平铺。");
        sb.AppendLine("只修改用户明确要求的部分，保持其他部分不变。");
        sb.AppendLine("如果用户要求切换深色/浅色、主色、字体、卡片质感或整体视觉氛围，必须修改 report.theme，而不是只改个别图表颜色。");
        sb.AppendLine("如果用户点名具体主题（例如 Dracula），report.theme.name 和整套 colors 必须与该主题一致，不能只返回泛化的“深色主题”。");
        sb.AppendLine("如果用户要求更改图表类型，必须在对应组件 config 中真实修改 chartType / series.type；例如“条形图/横向柱状图”必须保持 chartType = \"bar\"，并通过 orientation = \"horizontal\" 或 xAxis=value + yAxis=category 的方式明确表达。");
        sb.AppendLine("如果本轮需求只是配色、主题、emoji、图标、字体、圆角、阴影、标题文案或其他视觉润色，不要修改 queries，不要修改字段映射，不要改 queryRef。");
        sb.AppendLine("返回前请自检：主题名、chartType、series.type、queryRef、position 是否和用户要求一致。");
        sb.AppendLine("message 必须只描述 JSON 中真实落地的变化，不要描述未实际修改的内容。");

        return sb.ToString();
    }

    private static bool IsVisualOnlyRefinementRequest(string? userPrompt)
    {
        if (string.IsNullOrWhiteSpace(userPrompt))
        {
            return false;
        }

        var text = userPrompt.Trim();
        var styleKeywords = new[]
        {
            "配色", "颜色", "色彩", "主题", "深色", "浅色", "emoji", "图标", "icon",
            "字体", "字重", "风格", "样式", "美化", "润色", "圆角", "阴影", "边框",
            "质感", "视觉", "海报", "背景", "标题文案", "标题"
        };
        var dataKeywords = new[]
        {
            "查询", "query", "dax", "字段", "列", "表", "模型", "数据", "dataset",
            "度量", "measure", "指标口径", "维度", "筛选", "过滤", "filter",
            "排序", "分组", "统计", "新增图表", "增加图表", "新增组件", "增加组件"
        };

        var hasStyleIntent = styleKeywords.Any(keyword => text.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        var hasDataIntent = dataKeywords.Any(keyword => text.Contains(keyword, StringComparison.OrdinalIgnoreCase));
        return hasStyleIntent && !hasDataIntent;
    }

    private string BuildPromptCompositionInput(ModelMetadata metadata, ComposePromptRequest request)
    {
        var sb = new StringBuilder();
        var mode = request.Mode.Trim();

        sb.AppendLine($"模式: {mode}");
        if (!string.IsNullOrWhiteSpace(request.UserIntent))
        {
            sb.AppendLine($"用户目标: {request.UserIntent}");
        }
        sb.AppendLine();

        sb.AppendLine("## 模型概览");
        sb.AppendLine($"数据库: {metadata.DatabaseName}");
        sb.AppendLine("表:");
        foreach (var table in metadata.Tables.Take(8))
        {
            var columnNames = string.Join(", ", table.Columns.Take(8).Select(column => column.Name));
            sb.AppendLine($"- {table.Name}: {columnNames}");
        }
        sb.AppendLine();

        if (metadata.Measures.Count > 0)
        {
            sb.AppendLine("度量:");
            foreach (var measure in metadata.Measures.Take(16))
            {
                sb.AppendLine($"- [{measure.Name}] ({measure.TableName})");
            }
            sb.AppendLine();
        }

        if (request.Assets is { Count: > 0 })
        {
            sb.AppendLine("## 当前可见素材");
            foreach (var asset in request.Assets.Take(10))
            {
                var fields = asset.VisibleFields is { Count: > 0 }
                    ? string.Join(", ", asset.VisibleFields.Take(8))
                    : "无";
                sb.AppendLine($"- {asset.Name}: 图表={asset.ChartType ?? "未指定"}, 行数={asset.RowCount?.ToString() ?? "-"}, 评分={asset.Score?.ToString("0.0") ?? "-"}, 字段={fields}");
            }
            sb.AppendLine();
        }

        if (request.CurrentContext != null)
        {
            sb.AppendLine("## 当前报表");
            sb.AppendLine($"报表名称: {request.CurrentContext.Report.Name}");
            sb.AppendLine($"页面数: {request.CurrentContext.Pages.Count}");
            sb.AppendLine($"查询数: {request.CurrentContext.Queries.Count}");
            sb.AppendLine();
        }

        sb.AppendLine("## 输出要求");
        sb.AppendLine("请写出一条可以直接放进输入框、供用户继续编辑的中文提示词。");
        sb.AppendLine("这条提示词要有真实设计感，重点描述业务叙事、页面层级、版式节奏、视觉方向、标题语言和关键图表组织方式。");
        sb.AppendLine("请把提示词写成成熟的设计 brief，至少覆盖：目标、页面结构、视觉主题、重点图表安排、需要 AI 自检的落地点。");
        sb.AppendLine("结尾请附上 2-4 个可供用户继续补充的确认点，让用户可以继续多轮对话细化。");
        sb.AppendLine("默认采用浅色、编辑式、带一点经营汇报海报感的风格，避免深色背景、避免模板化平均平铺、避免紫色主导配色。");
        sb.AppendLine("要明确要求出现主视觉区块、大小对比、强标题和更有记忆点的图表组织方式，不要所有卡片一样大。");
        sb.AppendLine("不要要求生成 filter 类型的网格组件；如果需要筛选，只能放在页面 filters。");
        sb.AppendLine("不要写成问答，不要输出 JSON，不要输出 Markdown 代码块。");
        sb.AppendLine("如果信息不完整，请做合理假设，但提示词本身仍然要明确、可执行。");

        return sb.ToString();
    }

    private string BuildPrompt(ModelMetadata metadata, GenerateReportRequest request)
    {
        var sb = new StringBuilder();

        sb.AppendLine("## 可用数据模型");
        sb.AppendLine();
        sb.AppendLine("### 表");
        foreach (var table in metadata.Tables)
        {
            sb.AppendLine($"- {table.Name}: {table.Columns.Count} 列, {table.Measures.Count} 度量值");
        }
        sb.AppendLine();

        sb.AppendLine("### 度量值");
        foreach (var measure in metadata.Measures.Take(20))
        {
            sb.AppendLine($"- [{measure.Name}] ({measure.TableName}) = {measure.Expression}");
        }
        sb.AppendLine();

        sb.AppendLine("### 列");
        foreach (var table in metadata.Tables.Take(5))
        {
            sb.AppendLine($"- {table.Name}: {string.Join(", ", table.Columns.Take(10).Select(c => c.Name))}");
        }
        sb.AppendLine();

        sb.AppendLine("## 用户需求");
        sb.AppendLine(request.UserPrompt);
        sb.AppendLine();

        if (request.PageCount > 1)
        {
            sb.AppendLine($"请生成 {request.PageCount} 个页面的报表。");
        }

        if (!string.IsNullOrEmpty(request.Style))
        {
            sb.AppendLine($"风格偏好: {request.Style}");
        }

        sb.AppendLine();
        sb.AppendLine("## 输出要求");
        sb.AppendLine("请生成完整报表结果 JSON，必须包含 report、pages、queries 三个字段。");
        sb.AppendLine("页面数组不能为空；所有组件引用的 queryRef 都必须在 queries 数组中存在。");
        sb.AppendLine("pages 中每个 component 都必须包含完整的 id、type、position { x, y, w, h }。");
        sb.AppendLine("如果涉及整体视觉风格、深浅色、主色、卡片气质或字体，请在 report.theme 中返回完整主题定义。");
        sb.AppendLine("如果用户点名具体主题（例如 Dracula），report.theme.name 和 colors 必须真实使用该主题，不要退化成泛化的 dark/light。");
        sb.AppendLine("版式不要机械平铺；请通过主视觉、KPI 带、趋势区、结构区和异常区建立信息主次。");
        sb.AppendLine("请做出更强的设计感：至少一个更有体量的主区块、一个信息带或辅助区块，不要所有组件均匀切格。");
        sb.AppendLine("默认浅色，适合经营看板与汇报场景；色彩以蓝绿、铜橙、灰白为主，不要紫色主导。");
        sb.AppendLine("不要生成 type = filter 的网格组件；如果需要筛选，请写到页面 filters。");
        sb.AppendLine("如果要生成条形图/横向柱状图，请使用 chartType = \"bar\"，并设置 orientation = \"horizontal\"，不要误改成 line。");
        sb.AppendLine("DAX 生成必须尽量使用安全模式：KPI 用 `EVALUATE ROW(...)`；趋势/柱图用 `EVALUATE SUMMARIZECOLUMNS(...)`；饼图/结构分布用 `EVALUATE UNION(ROW(...), ROW(...))`。");
        sb.AppendLine("严禁使用 `EVALUATE { (\"A\", [MeasureA]), (\"B\", [MeasureB]) }` 这种二元组/多列 table constructor。");
        sb.AppendLine();
        sb.AppendLine(GetReportSchemaDescription());

        return sb.ToString();
    }

    private string GetReportSchemaDescription()
    {
        return """
        {
          "report": {
            "formatVersion": "1.0.0",
            "id": "report-sales-overview",
            "name": "销售概览",
            "description": "根据模型自动生成的报表",
            "createdAt": "2026-03-25T00:00:00Z",
            "modifiedAt": "2026-03-25T00:00:00Z",
            "generationMode": "ai-generated",
            "pages": ["page-overview"],
            "defaultPage": "page-overview",
            "theme": {
              "name": "Vibe Editorial Light",
              "colors": {
                "primary": "#0E7490",
                "secondary": "#C97A32",
                "background": "#F4F1EA",
                "surface": "#FCFBF8",
                "text": "#152132",
                "textSecondary": "#617082",
                "chart": ["#0E7490", "#2563EB", "#C97A32", "#7C9A4D"]
              },
              "typography": {
                "fontFamily": "\"Source Han Sans SC\", \"Microsoft YaHei UI\", sans-serif"
              },
              "components": {
                "card": {
                  "borderRadius": 22,
                  "shadow": "0 18px 40px rgba(15, 23, 42, 0.08)",
                  "padding": 22
                }
              }
            }
          },
          "pages": [
            {
              "id": "page-overview",
              "name": "概览",
              "layout": {
                "type": "grid",
                "columns": 12,
                "rowHeight": 60,
                "gap": 16,
                "padding": 24
              },
              "filters": [],
              "components": [
                {
                  "id": "kpi-total-sales",
                  "type": "kpi-card",
                  "position": { "x": 0, "y": 0, "w": 3, "h": 2 },
                  "queryRef": "q-total-sales",
                  "config": {
                    "title": "总销售额",
                    "valueField": "Total Sales",
                    "format": { "type": "currency", "currency": "CNY", "decimals": 0 }
                  }
                },
                {
                  "id": "chart-sales-trend",
                  "type": "echarts",
                  "position": { "x": 0, "y": 2, "w": 8, "h": 5 },
                  "queryRef": "q-sales-trend",
                  "config": {
                    "title": "销售趋势",
                    "chartType": "line",
                    "xAxis": { "field": "Month", "type": "category" },
                    "yAxis": [{ "field": "Total Sales", "type": "value", "name": "销售额" }],
                    "series": [{ "field": "Total Sales", "type": "line", "name": "销售额", "smooth": true }]
                  }
                }
              ]
            }
          ],
          "queries": [
            {
              "id": "q-total-sales",
              "name": "总销售额",
              "dax": "EVALUATE ROW(\"Total Sales\", [Total Sales])",
              "parameters": []
            },
            {
              "id": "q-sales-trend",
              "name": "销售趋势",
              "dax": "EVALUATE SUMMARIZECOLUMNS('Calendar'[Month], \"Total Sales\", [Total Sales])",
              "parameters": []
            }
          ],
          "message": "生成说明"
        }
        """;
    }

    private static T? DeserializeAiJson<T>(string content)
    {
        var payload = ExtractJsonPayload(content);
        return JsonSerializer.Deserialize<T>(payload, JsonOptions);
    }

    private static AiReportResult DeserializeAiReportResult(string content, CurrentReportContext? fallbackContext = null)
    {
        var payload = ExtractJsonPayload(content);
        var rootNode = ParseJsonNodeWithRepair(payload);

        if (rootNode is not JsonObject rootObject)
        {
            throw new JsonException("AI 未返回 JSON 对象");
        }

        var reportNode = GetPropertyValue(rootObject, "report");
        var pagesNode = GetPropertyValue(rootObject, "pages");
        var queriesNode = GetPropertyValue(rootObject, "queries");
        var messageNode = GetPropertyValue(rootObject, "message");

        if (reportNode == null)
        {
            reportNode = rootObject;
            pagesNode = null;
            queriesNode = null;
            messageNode = null;
        }

        var normalizedPagesNode = NormalizePagesNode(pagesNode, fallbackContext);
        var pages = DeserializeOptionalNode<List<PageDefinition>>(normalizedPagesNode) ?? fallbackContext?.Pages;
        var queries = DeserializeOptionalNode<List<QueryDefinition>>(queriesNode) ?? fallbackContext?.Queries;
        var normalizedReportNode = NormalizeReportNode(reportNode, fallbackContext, pages);
        var report = normalizedReportNode.Deserialize<ReportDefinition>(JsonOptions)
            ?? throw new JsonException("AI 未返回有效的报表定义");

        return new AiReportResult
        {
            Report = report,
            Pages = pages,
            Queries = queries,
            Message = messageNode is JsonValue ? messageNode.GetValue<string?>() : null
        };
    }

    private static T? DeserializeOptionalNode<T>(JsonNode? node)
    {
        if (node == null)
        {
            return default;
        }

        return node.Deserialize<T>(JsonOptions);
    }

    private static JsonNode? NormalizePagesNode(JsonNode? pagesNode, CurrentReportContext? fallbackContext)
    {
        if (pagesNode == null)
        {
            return null;
        }

        var sourcePages = pagesNode switch
        {
            JsonArray array => array,
            JsonObject obj => new JsonArray(obj.DeepClone()),
            _ => throw new JsonException("pages 字段必须是数组")
        };

        var fallbackPages = fallbackContext?.Pages ?? new List<PageDefinition>();
        var fallbackPagesById = fallbackPages.ToDictionary(page => page.Id, StringComparer.OrdinalIgnoreCase);
        var normalizedPages = new JsonArray();

        for (var pageIndex = 0; pageIndex < sourcePages.Count; pageIndex++)
        {
            if (sourcePages[pageIndex] is not JsonObject pageObject)
            {
                continue;
            }

            var normalizedPage = CloneObject(pageObject);
            var pageId = GetStringProperty(normalizedPage, "id")
                ?? fallbackPages.ElementAtOrDefault(pageIndex)?.Id
                ?? $"page-{pageIndex + 1}";
            var fallbackPage = fallbackPagesById.TryGetValue(pageId, out var matchedPage)
                ? matchedPage
                : fallbackPages.ElementAtOrDefault(pageIndex);

            normalizedPage["id"] = JsonValue.Create(pageId);
            normalizedPage["name"] ??= JsonValue.Create(fallbackPage?.Name ?? $"页面 {pageIndex + 1}");
            normalizedPage["layout"] = NormalizeLayoutNode(GetPropertyValue(normalizedPage, "layout"), fallbackPage?.Layout);
            normalizedPage["filters"] = NormalizeFiltersNode(
                GetPropertyValue(normalizedPage, "filters"),
                fallbackPage,
                pageId);
            normalizedPage["components"] = NormalizeComponentsNode(
                GetPropertyValue(normalizedPage, "components"),
                fallbackPage,
                pageId);

            normalizedPages.Add(normalizedPage);
        }

        return normalizedPages;
    }

    private static JsonNode NormalizeLayoutNode(JsonNode? layoutNode, LayoutConfig? fallbackLayout)
    {
        var defaults = fallbackLayout ?? new LayoutConfig();
        var normalizedLayout = layoutNode as JsonObject is { } layoutObject
            ? CloneObject(layoutObject)
            : new JsonObject(options: new JsonNodeOptions { PropertyNameCaseInsensitive = true });

        normalizedLayout["type"] ??= JsonValue.Create(defaults.Type);
        normalizedLayout["columns"] ??= JsonValue.Create(defaults.Columns);
        normalizedLayout["rowHeight"] ??= JsonValue.Create(defaults.RowHeight);
        normalizedLayout["gap"] ??= JsonValue.Create(defaults.Gap);
        normalizedLayout["padding"] ??= JsonValue.Create(defaults.Padding);

        return normalizedLayout;
    }

    private static JsonNode NormalizeFiltersNode(JsonNode? filtersNode, PageDefinition? fallbackPage, string pageId)
    {
        if (filtersNode == null)
        {
            return JsonSerializer.SerializeToNode(fallbackPage?.Filters ?? new List<FilterDefinition>(), JsonOptions)
                ?? new JsonArray();
        }

        var sourceFilters = filtersNode switch
        {
            JsonArray array => array,
            JsonObject obj => new JsonArray(obj.DeepClone()),
            _ => new JsonArray()
        };

        var fallbackFilters = fallbackPage?.Filters ?? new List<FilterDefinition>();
        var fallbackFiltersById = fallbackFilters.ToDictionary(filter => filter.Id, StringComparer.OrdinalIgnoreCase);
        var normalizedFilters = new JsonArray();

        for (var filterIndex = 0; filterIndex < sourceFilters.Count; filterIndex++)
        {
            if (sourceFilters[filterIndex] is not JsonObject filterObject)
            {
                continue;
            }

            var normalizedFilter = CloneObject(filterObject);
            var filterId = GetStringProperty(normalizedFilter, "id")
                ?? fallbackFilters.ElementAtOrDefault(filterIndex)?.Id
                ?? $"{pageId}-filter-{filterIndex + 1}";
            var fallbackFilter = fallbackFiltersById.TryGetValue(filterId, out var matchedFilter)
                ? matchedFilter
                : fallbackFilters.ElementAtOrDefault(filterIndex);

            normalizedFilter["id"] = JsonValue.Create(filterId);
            normalizedFilter["type"] ??= JsonValue.Create(fallbackFilter?.Type ?? "dropdown");

            var targetNode = GetPropertyValue(normalizedFilter, "target");
            if (targetNode == null && fallbackFilter?.Target != null)
            {
                targetNode = JsonSerializer.SerializeToNode(fallbackFilter.Target, JsonOptions);
            }

            if (targetNode is not JsonObject targetObject
                || string.IsNullOrWhiteSpace(GetStringProperty(targetObject, "table"))
                || string.IsNullOrWhiteSpace(GetStringProperty(targetObject, "column")))
            {
                continue;
            }

            normalizedFilter["target"] = targetObject;

            if (GetPropertyValue(normalizedFilter, "default") == null && fallbackFilter?.Default != null)
            {
                normalizedFilter["default"] = JsonSerializer.SerializeToNode(fallbackFilter.Default, JsonOptions);
            }

            normalizedFilters.Add(normalizedFilter);
        }

        return normalizedFilters;
    }

    private static JsonNode NormalizeComponentsNode(JsonNode? componentsNode, PageDefinition? fallbackPage, string pageId)
    {
        if (componentsNode == null)
        {
            return JsonSerializer.SerializeToNode(fallbackPage?.Components ?? new List<ComponentDefinition>(), JsonOptions)
                ?? new JsonArray();
        }

        var sourceComponents = componentsNode switch
        {
            JsonArray array => array,
            JsonObject obj => new JsonArray(obj.DeepClone()),
            _ => throw new JsonException("components 字段必须是数组")
        };

        var fallbackComponents = fallbackPage?.Components ?? new List<ComponentDefinition>();
        var fallbackComponentsById = fallbackComponents.ToDictionary(component => component.Id, StringComparer.OrdinalIgnoreCase);
        var normalizedComponents = new JsonArray();

        for (var componentIndex = 0; componentIndex < sourceComponents.Count; componentIndex++)
        {
            if (sourceComponents[componentIndex] is not JsonObject componentObject)
            {
                continue;
            }

            var normalizedComponent = CloneObject(componentObject);
            var componentId = GetStringProperty(normalizedComponent, "id")
                ?? fallbackComponents.ElementAtOrDefault(componentIndex)?.Id
                ?? $"{pageId}-component-{componentIndex + 1}";
            var fallbackComponent = fallbackComponentsById.TryGetValue(componentId, out var matchedComponent)
                ? matchedComponent
                : fallbackComponents.ElementAtOrDefault(componentIndex);

            normalizedComponent["id"] = JsonValue.Create(componentId);
            normalizedComponent["type"] ??= JsonValue.Create(fallbackComponent?.Type ?? "text");
            normalizedComponent["position"] = NormalizePositionNode(
                GetPropertyValue(normalizedComponent, "position"),
                fallbackComponent?.Position,
                componentIndex);

            if (GetPropertyValue(normalizedComponent, "queryRef") == null && !string.IsNullOrWhiteSpace(fallbackComponent?.QueryRef))
            {
                normalizedComponent["queryRef"] = JsonValue.Create(fallbackComponent.QueryRef);
            }

            if (GetPropertyValue(normalizedComponent, "config") == null && fallbackComponent?.Config != null)
            {
                normalizedComponent["config"] = JsonSerializer.SerializeToNode(fallbackComponent.Config, JsonOptions);
            }

            if (GetPropertyValue(normalizedComponent, "style") == null && fallbackComponent?.Style != null)
            {
                normalizedComponent["style"] = JsonSerializer.SerializeToNode(fallbackComponent.Style, JsonOptions);
            }

            normalizedComponents.Add(normalizedComponent);
        }

        return normalizedComponents;
    }

    private static JsonNode NormalizePositionNode(JsonNode? positionNode, PositionConfig? fallbackPosition, int componentIndex)
    {
        var normalizedPosition = positionNode as JsonObject is { } positionObject
            ? CloneObject(positionObject)
            : new JsonObject(options: new JsonNodeOptions { PropertyNameCaseInsensitive = true });

        normalizedPosition["x"] ??= JsonValue.Create(fallbackPosition?.X ?? 0);
        normalizedPosition["y"] ??= JsonValue.Create(fallbackPosition?.Y ?? componentIndex * 4);
        normalizedPosition["w"] ??= JsonValue.Create(fallbackPosition?.W ?? 6);
        normalizedPosition["h"] ??= JsonValue.Create(fallbackPosition?.H ?? 4);

        return normalizedPosition;
    }

    private static JsonObject NormalizeReportNode(
        JsonNode reportNode,
        CurrentReportContext? fallbackContext,
        IReadOnlyList<PageDefinition>? pages)
    {
        if (reportNode is not JsonObject reportObject)
        {
            throw new JsonException("report 字段必须是 JSON 对象");
        }

        var normalized = new JsonObject(options: new JsonNodeOptions { PropertyNameCaseInsensitive = true });
        foreach (var property in reportObject)
        {
            normalized[property.Key] = property.Value?.DeepClone();
        }

        var fallbackReport = fallbackContext?.Report;
        var pageIds = pages?.Select(page => page.Id).ToList()
            ?? fallbackContext?.Pages.Select(page => page.Id).ToList()
            ?? fallbackReport?.Pages;

        normalized["formatVersion"] ??= JsonValue.Create(fallbackReport?.FormatVersion ?? "1.0.0");
        normalized["id"] ??= JsonValue.Create(fallbackReport?.Id ?? "report-ai-generated");
        normalized["name"] ??= JsonValue.Create(fallbackReport?.Name ?? "AI 生成报表");
        normalized["createdAt"] ??= JsonValue.Create((fallbackReport?.CreatedAt ?? DateTime.UtcNow).ToString("O"));
        normalized["modifiedAt"] ??= JsonValue.Create((fallbackReport?.ModifiedAt ?? DateTime.UtcNow).ToString("O"));

        if (pageIds is { Count: > 0 })
        {
            var pageArray = new JsonArray();
            foreach (var pageId in pageIds)
            {
                pageArray.Add(JsonValue.Create(pageId));
            }

            normalized["pages"] = pageArray;

            if (normalized["defaultPage"] == null)
            {
                normalized["defaultPage"] = JsonValue.Create(fallbackReport?.DefaultPage ?? pageIds[0]);
            }
        }
        else
        {
            normalized["pages"] ??= new JsonArray();
        }

        normalized["theme"] = NormalizeThemeNode(GetPropertyValue(normalized, "theme"), fallbackReport?.Theme);

        return normalized;
    }

    private static JsonNode NormalizeThemeNode(JsonNode? themeNode, ThemeDefinition? fallbackTheme)
    {
        var baseTheme = fallbackTheme ?? DefaultReportTheme;

        if (themeNode is not JsonObject themeObject)
        {
            return JsonSerializer.SerializeToNode(baseTheme, JsonOptions)
                ?? JsonSerializer.SerializeToNode(DefaultReportTheme, JsonOptions)
                ?? new JsonObject();
        }

        var presetTheme = ResolveThemePreset(themeObject, GetPropertyValue(themeObject, "colors"), baseTheme);

        var theme = new ThemeDefinition
        {
            Name = GetStringProperty(themeObject, "name") ?? presetTheme.Name,
            Colors = NormalizeThemeColorsNode(
                GetPropertyValue(themeObject, "colors"),
                themeObject,
                presetTheme.Colors),
            Typography = NormalizeThemeTypographyNode(
                GetPropertyValue(themeObject, "typography"),
                presetTheme.Typography),
            Components = NormalizeThemeComponentsNode(
                GetPropertyValue(themeObject, "components"),
                presetTheme.Components)
        };

        return JsonSerializer.SerializeToNode(theme, JsonOptions)
            ?? JsonSerializer.SerializeToNode(DefaultReportTheme, JsonOptions)
            ?? new JsonObject();
    }

    private static ThemeDefinition ResolveThemePreset(JsonObject themeObject, JsonNode? colorsNode, ThemeDefinition fallbackTheme)
    {
        var modeHint = string.Join(" | ", new[]
        {
            GetStringProperty(themeObject, "name"),
            GetStringProperty(themeObject, "mode"),
            GetStringProperty(themeObject, "variant"),
            colorsNode is JsonValue colorValue ? colorValue.GetValue<string?>() : null
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        if (string.IsNullOrWhiteSpace(modeHint))
        {
            return fallbackTheme;
        }

        if (modeHint.Contains("dracula", StringComparison.OrdinalIgnoreCase)
            || modeHint.Contains("德古拉", StringComparison.OrdinalIgnoreCase))
        {
            return DraculaReportTheme;
        }

        if (modeHint.Contains("dark", StringComparison.OrdinalIgnoreCase) || modeHint.Contains("深色", StringComparison.OrdinalIgnoreCase))
        {
            return DefaultDarkReportTheme;
        }

        if (modeHint.Contains("light", StringComparison.OrdinalIgnoreCase) || modeHint.Contains("浅色", StringComparison.OrdinalIgnoreCase))
        {
            return DefaultReportTheme;
        }

        return fallbackTheme;
    }

    private static ThemeColors NormalizeThemeColorsNode(JsonNode? colorsNode, JsonObject themeObject, ThemeColors fallbackColors)
    {
        var colorsObject = colorsNode as JsonObject;
        var chartPalette = colorsNode as JsonArray;
        var fallbackChart = fallbackColors.Chart?.Count > 0
            ? fallbackColors.Chart
            : DefaultReportTheme.Colors.Chart;

        var chart = ExtractColorArray(colorsObject, "chart")
            ?? ExtractColorArray(colorsObject, "palette")
            ?? ExtractColorArray(chartPalette)
            ?? fallbackChart;

        return new ThemeColors
        {
            Primary = GetStringProperty(colorsObject, "primary")
                ?? GetStringProperty(themeObject, "primary")
                ?? fallbackColors.Primary,
            Secondary = GetStringProperty(colorsObject, "secondary")
                ?? GetStringProperty(themeObject, "secondary")
                ?? fallbackColors.Secondary,
            Background = GetStringProperty(colorsObject, "background")
                ?? GetStringProperty(themeObject, "background")
                ?? fallbackColors.Background,
            Surface = GetStringProperty(colorsObject, "surface")
                ?? GetStringProperty(themeObject, "surface")
                ?? fallbackColors.Surface,
            Text = GetStringProperty(colorsObject, "text")
                ?? GetStringProperty(colorsObject, "foreground")
                ?? GetStringProperty(themeObject, "text")
                ?? fallbackColors.Text,
            TextSecondary = GetStringProperty(colorsObject, "textSecondary")
                ?? GetStringProperty(colorsObject, "muted")
                ?? GetStringProperty(themeObject, "textSecondary")
                ?? fallbackColors.TextSecondary,
            Chart = chart
        };
    }

    private static ThemeTypography NormalizeThemeTypographyNode(JsonNode? typographyNode, ThemeTypography fallbackTypography)
    {
        var typographyObject = typographyNode as JsonObject;
        return new ThemeTypography
        {
            FontFamily = GetStringProperty(typographyObject, "fontFamily")
                ?? GetStringProperty(typographyObject, "font")
                ?? fallbackTypography.FontFamily
        };
    }

    private static ThemeComponents NormalizeThemeComponentsNode(JsonNode? componentsNode, ThemeComponents fallbackComponents)
    {
        var componentsObject = componentsNode as JsonObject;
        var cardObject = GetPropertyValue(componentsObject, "card") as JsonObject;
        var fallbackCard = fallbackComponents.Card ?? DefaultReportTheme.Components.Card;

        return new ThemeComponents
        {
            Card = new ComponentTheme
            {
                BorderRadius = GetIntProperty(cardObject, "borderRadius") ?? fallbackCard.BorderRadius,
                Shadow = GetStringProperty(cardObject, "shadow") ?? fallbackCard.Shadow,
                Padding = GetIntProperty(cardObject, "padding") ?? fallbackCard.Padding
            }
        };
    }

    private static List<string>? ExtractColorArray(JsonObject? obj, string propertyName)
    {
        return ExtractColorArray(GetPropertyValue(obj, propertyName) as JsonArray);
    }

    private static List<string>? ExtractColorArray(JsonArray? array)
    {
        if (array == null)
        {
            return null;
        }

        var colors = array
            .Select(node => node is JsonValue value ? value.GetValue<string?>() : null)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Cast<string>()
            .ToList();

        return colors.Count > 0 ? colors : null;
    }

    private static string DescribeTheme(ThemeDefinition? theme)
    {
        var effectiveTheme = theme ?? DefaultReportTheme;
        return $"{effectiveTheme.Name} · 背景 {effectiveTheme.Colors.Background} · 主色 {effectiveTheme.Colors.Primary} / {effectiveTheme.Colors.Secondary}";
    }

    private static JsonObject CloneObject(JsonObject source)
    {
        var clone = new JsonObject(options: new JsonNodeOptions { PropertyNameCaseInsensitive = true });
        foreach (var property in source)
        {
            clone[property.Key] = property.Value?.DeepClone();
        }

        return clone;
    }

    private static string? GetStringProperty(JsonObject? obj, string propertyName)
    {
        if (obj == null)
        {
            return null;
        }

        return GetPropertyValue(obj, propertyName) is JsonValue value
            ? value.GetValue<string?>()
            : null;
    }

    private static int? GetIntProperty(JsonObject? obj, string propertyName)
    {
        var node = GetPropertyValue(obj, propertyName);
        if (node is not JsonValue value)
        {
            return null;
        }

        if (value.TryGetValue<int>(out var intValue))
        {
            return intValue;
        }

        if (value.TryGetValue<string>(out var stringValue) && int.TryParse(stringValue, out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static JsonNode? GetPropertyValue(JsonObject? obj, string propertyName)
    {
        if (obj == null)
        {
            return null;
        }

        foreach (var property in obj)
        {
            if (string.Equals(property.Key, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value;
            }
        }

        return null;
    }

    private static string NormalizePlainTextResponse(string content)
    {
        var trimmed = content.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstLineBreak = trimmed.IndexOf('\n');
        if (firstLineBreak >= 0)
        {
            trimmed = trimmed[(firstLineBreak + 1)..];
        }

        var closingFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
        if (closingFence >= 0)
        {
            trimmed = trimmed[..closingFence];
        }

        return trimmed.Trim();
    }

    private static string ExtractJsonPayload(string content)
    {
        var trimmed = content.Trim();
        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return trimmed;
        }

        if (trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            var firstLineBreak = trimmed.IndexOf('\n');
            if (firstLineBreak >= 0)
            {
                trimmed = trimmed[(firstLineBreak + 1)..];
            }

            var closingFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
            if (closingFence >= 0)
            {
                trimmed = trimmed[..closingFence];
            }

            trimmed = trimmed.Trim();
        }

        var objectStart = trimmed.IndexOf('{');
        var arrayStart = trimmed.IndexOf('[');
        var startIndex = -1;

        if (objectStart >= 0 && arrayStart >= 0)
        {
            startIndex = Math.Min(objectStart, arrayStart);
        }
        else if (objectStart >= 0)
        {
            startIndex = objectStart;
        }
        else if (arrayStart >= 0)
        {
            startIndex = arrayStart;
        }

        if (startIndex < 0)
        {
            return trimmed;
        }

        var stack = new Stack<char>();
        var endIndex = -1;
        var inString = false;
        var isEscaped = false;

        for (var index = startIndex; index < trimmed.Length; index++)
        {
            var ch = trimmed[index];

            if (inString)
            {
                if (isEscaped)
                {
                    isEscaped = false;
                    continue;
                }

                if (ch == '\\')
                {
                    isEscaped = true;
                    continue;
                }

                if (ch == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (ch == '"')
            {
                inString = true;
                continue;
            }

            if (ch == '{')
            {
                stack.Push('}');
                continue;
            }

            if (ch == '[')
            {
                stack.Push(']');
                continue;
            }

            if ((ch == '}' || ch == ']') && stack.Count > 0)
            {
                var expected = stack.Pop();
                if (ch != expected)
                {
                    break;
                }

                if (stack.Count == 0)
                {
                    endIndex = index;
                    break;
                }
            }
        }

        if (endIndex <= startIndex)
        {
            return trimmed[startIndex..];
        }

        return trimmed.Substring(startIndex, endIndex - startIndex + 1);
    }

    private static JsonNode ParseJsonNodeWithRepair(string payload)
    {
        try
        {
            return ParseJsonNodeLenient(payload);
        }
        catch (JsonException)
        {
            var repairedPayload = payload;

            for (var attempt = 0; attempt < 3; attempt++)
            {
                var nextPayload = RepairCommonJsonIssues(repairedPayload);
                if (string.Equals(nextPayload, repairedPayload, StringComparison.Ordinal))
                {
                    break;
                }

                repairedPayload = nextPayload;
            }

            if (string.Equals(repairedPayload, payload, StringComparison.Ordinal))
            {
                throw;
            }

            return ParseJsonNodeLenient(repairedPayload);
        }
    }

    private static JsonNode ParseJsonNodeLenient(string payload)
    {
        return JsonNode.Parse(
                   payload,
                   documentOptions: new JsonDocumentOptions
                   {
                       AllowTrailingCommas = true,
                       CommentHandling = JsonCommentHandling.Skip
                   })
               ?? throw new JsonException("AI 未返回有效 JSON 对象");
    }

    private static string RepairCommonJsonIssues(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload))
        {
            return payload;
        }

        var repaired = payload
            .Replace("“", "\"", StringComparison.Ordinal)
            .Replace("”", "\"", StringComparison.Ordinal)
            .Replace("‘", "'", StringComparison.Ordinal)
            .Replace("’", "'", StringComparison.Ordinal);

        repaired = Regex.Replace(
            repaired,
            @"(\""(?:\\.|[^\""])*\""|\]|\}|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\s+(?=\""?[A-Za-z_][A-Za-z0-9_.-]*\""?\s*:)",
            "$1, ");

        repaired = Regex.Replace(
            repaired,
            @"([\{,]\s*)([A-Za-z_][A-Za-z0-9_.-]*)""\s*:",
            "$1\"$2\":");

        repaired = Regex.Replace(
            repaired,
            @"([\{,]\s*)""([A-Za-z_][A-Za-z0-9_.-]*)\s*:",
            "$1\"$2\":");

        repaired = Regex.Replace(
            repaired,
            @"([\{,]\s*)([A-Za-z_][A-Za-z0-9_.-]*)\s*:",
            "$1\"$2\":");

        repaired = Regex.Replace(
            repaired,
            @",\s*([\}\]])",
            "$1");

        return repaired;
    }
}

public record AiReportResult
{
    public required ReportDefinition Report { get; init; }
    public List<PageDefinition>? Pages { get; init; }
    public List<QueryDefinition>? Queries { get; init; }
    public string? Message { get; init; }
}

public record QueryValidationFailure
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Dax { get; init; }
    public required string ErrorMessage { get; init; }
}

public static class SystemPrompts
{
    public const string PromptComposition = """
        你是一名资深 BI 创意总监。你的任务不是直接生成报表 JSON，而是为“报表生成 AI”写一条高质量的中文提示词。

        输出必须满足以下要求:
        1. 只输出提示词正文，不要解释，不要 JSON，不要 Markdown 代码块
        2. 提示词要可直接粘贴到输入框给另一个 AI 使用，允许多行
        3. 提示词要体现设计判断，明确业务叙事、信息层级、页面结构、主视觉和图表组织方式
        4. 默认采用浅色、编辑式、具有经营汇报海报感且有留白和节奏感的视觉方向
        5. 明确避免深色背景、模板化平均平铺、标题空泛、紫色主导配色
        6. 如果用户上下文不完整，请做合理假设，但提示词依然要明确、具体、可执行
        7. 提示词里要明确要求至少一个更有存在感的主视觉区块，不要所有组件一样大
        8. 不要要求生成 filter 类型的网格组件；如需筛选，只能使用页面 filters
        9. 提示词应像成熟的设计 brief，至少包含目标、结构、视觉、重点图表、自检要求，并附 2-4 个可供用户继续确认的补充点

        请把提示词写得像真正准备交付的设计 brief，而不是笼统口号。
        """;

    public const string ReportGeneration = """
        你是一个专业的 BI 报表设计师。你的任务是根据用户提供的数据模型和需求，生成一个现代化的报表定义。

        请遵循以下原则:
        1. 选择合适的图表类型来展示数据
        2. 布局要美观，使用 12 列网格系统
        3. 组件大小要合理，重要的图表可以占更大的空间
        4. 使用清晰的标题和标签
        5. 考虑数据的关联性，将相关的图表放在一起

        可用组件类型:
        - echarts: ECharts 图表，支持 line, bar, pie, area 等类型
        - kpi-card: KPI 卡片，用于展示单个指标
        - data-table: 数据表格
        - text: 文本组件

        你必须输出一个完整 JSON 对象，包含 report、pages、queries、message 四个字段。
        report.pages 中出现的页面 ID 必须全部在 pages 数组中存在。
        每个组件的 queryRef 必须能在 queries 数组中找到同名查询。
        pages 不能为空；如果使用 echarts，config 中必须包含 chartType 与 series。
        如果用户点名具体主题（例如 Dracula），report.theme.name 和 colors 必须真实匹配该主题，不能只返回“深色主题”。
        如果用户要求条形图/横向柱状图，请使用 chartType = "bar" 并设置 orientation = "horizontal"，不要误改成 line。
        DAX 查询必须尽量采用安全模式：KPI 用 `EVALUATE ROW(...)`；趋势/柱图用 `EVALUATE SUMMARIZECOLUMNS(...)`；饼图/结构分布用 `EVALUATE UNION(ROW(...), ROW(...))`。
        严禁使用 `EVALUATE { ("A", [MeasureA]), ("B", [MeasureB]) }` 这种二元组/多列 table constructor。
        不要生成 type = filter 的组件；如需筛选，请写在页面 filters。
        视觉上要有主区块与辅区块的差异，不要把所有组件做成等宽等高的企业模板。
        不要使用 Markdown 代码块，不要输出任何 JSON 之外的解释。
        """;

    public const string ReportRefinement = """
        你是一个专业的 BI 报表设计师。你的任务是根据用户提供的当前报表结构和修改需求，生成修改后的报表定义。

        请遵循以下原则:
        1. 只修改用户明确要求的部分，保持其他部分不变
        2. 尽可能复用现有的查询和配置
        3. 修改后的布局仍然要遵循 12 列网格系统
        4. 修改可以是：
           - 更改图表类型（如柱状图改为折线图）
           - 调整组件位置和大小
           - 添加新的组件
           - 删除不需要的组件
           - 修改标题和标签
           - 调整配色方案
        5. 如果当前上下文已经包含数据集素材草稿，你的职责是把它设计成真正可展示的成品报表，不要只是维持平均平铺
        6. 保留现有 query id；除非用户明确要求，否则不要新增或重命名查询
        7. 优先保留现有 component id；你可以调整位置、大小、类型和 config
        8. 如果用户要求切换深色/浅色、整体配色、字体或卡片气质，必须修改 report.theme，而不是只改图表 series 颜色
        9. 如果用户点名具体主题（例如 Dracula），report.theme.name 和 colors 必须真实匹配该主题，不能偷换成泛化 dark/light
        10. 如果用户要求更换图表类型，config.chartType、series.type 和必要的轴配置必须真实变化；例如“条形图/横向柱状图”必须保持 bar，并设置 orientation = "horizontal" 或等价轴配置
        11. message 必须只描述 JSON 里真实发生的改动，不要写未落地的变化

        可用组件类型:
        - echarts: ECharts 图表，支持 line, bar, pie, area 等类型
        - kpi-card: KPI 卡片，用于展示单个指标
        - data-table: 数据表格
        - text: 文本组件

        输出格式必须是 JSON，包含以下字段:
        {
          "report": { /* ReportDefinition 对象 */ },
          "pages": [ /* PageDefinition 数组，可选 */ ],
          "queries": [ /* QueryDefinition 数组，可选 */ ],
          "message": "修改说明"
        }

        当任务要求重新设计版式、根据素材生成报表、自动排版或优化布局时，必须返回完整的 pages 数组。
        如果不需要修改 queries，可以省略该字段，但不要输出与现有 query id 不匹配的 queryRef。
        不要生成 type = filter 的网格组件；如需筛选，请只使用页面 filters。
        如果涉及整体视觉方案，请在 report.theme 中返回完整主题。
        返回前请自检主题、图表类型和 message 是否与用户要求一致。
        """;

    public const string QueryRepair = """
        你是一名精通 Power BI 语义模型和 DAX 的 BI 工程师。你的任务是修复报表 JSON 中无效的 DAX 查询，让报表可以真正执行和渲染。

        输出必须满足以下要求:
        1. 只输出 JSON，不要解释，不要 Markdown 代码块
        2. 返回完整 JSON 对象，包含 report、pages、queries、message
        3. 保持 report、page、component、query 的 id 稳定，除非输入里本身缺失
        4. 优先只修复失败的 queries，不要随意重做整个页面
        5. 修复后的 queries 必须与当前模型真实字段、真实度量一致
        6. 如果 query 的输出字段名发生变化，必须同步修改引用该 query 的组件 config，确保字段映射一致
        7. 不要输出占位查询，不要输出伪造字段名
        8. KPI 单值查询优先使用 `EVALUATE ROW(...)`
        9. 线图/柱图优先使用 `EVALUATE SUMMARIZECOLUMNS(...)`
        10. 饼图、结构分布、状态占比等请使用 `EVALUATE UNION(ROW(...), ROW(...))`
        11. 严禁使用 `EVALUATE { ("A", [MeasureA]), ("B", [MeasureB]) }` 这种二元组/多列 table constructor

        你的目标不是“看起来像对”，而是返回真正可执行的最终报表 JSON。
        """;
}
