using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
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

    private readonly IAIProvider _ai;
    private readonly IModelMetadataService _metadataService;

    public ReportGenerator(IAIProvider ai, IModelMetadataService metadataService)
    {
        _ai = ai;
        _metadataService = metadataService;
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
                ProgressPercent = 30 + (reportJson.Length / 100),
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
                ProgressPercent = 30 + (reportJson.Length / 100),
                PartialContent = chunk
            };
        }

        yield return new GenerationProgress { Step = "parsing", ProgressPercent = 80, Message = "正在解析修改结果..." };

        try
        {
            var refinedResult = DeserializeAiReportResult(reportJson.ToString(), request.CurrentContext);
            report = refinedResult.Report;
            pages = refinedResult.Pages ?? request.CurrentContext.Pages;
            queries = refinedResult.Queries ?? request.CurrentContext.Queries;
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

    private string BuildRefinementPrompt(RefineReportRequest request)
    {
        var sb = new StringBuilder();
        var context = request.CurrentContext!;

        sb.AppendLine("## 当前报表结构");
        sb.AppendLine();
        sb.AppendLine($"报表名称: {context.Report.Name}");
        sb.AppendLine($"报表描述: {context.Report.Description}");
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
        sb.AppendLine("优先复用当前上下文中的 query id 和 component id；如果当前上下文已经是素材草稿，请将它设计成可交付的最终版式，而不是简单平铺。");
        sb.AppendLine("只修改用户明确要求的部分，保持其他部分不变。");

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
            "defaultPage": "page-overview"
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
        var rootNode = JsonNode.Parse(payload) ?? throw new JsonException("AI 未返回有效 JSON 对象");

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

        var pages = DeserializeOptionalNode<List<PageDefinition>>(pagesNode) ?? fallbackContext?.Pages;
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

        return normalized;
    }

    private static JsonNode? GetPropertyValue(JsonObject obj, string propertyName)
    {
        foreach (var property in obj)
        {
            if (string.Equals(property.Key, propertyName, StringComparison.OrdinalIgnoreCase))
            {
                return property.Value;
            }
        }

        return null;
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

        var startChar = trimmed[startIndex];
        var endChar = startChar == '[' ? ']' : '}';
        var endIndex = trimmed.LastIndexOf(endChar);

        if (endIndex <= startIndex)
        {
            return trimmed[startIndex..];
        }

        return trimmed.Substring(startIndex, endIndex - startIndex + 1);
    }
}

public record AiReportResult
{
    public required ReportDefinition Report { get; init; }
    public List<PageDefinition>? Pages { get; init; }
    public List<QueryDefinition>? Queries { get; init; }
    public string? Message { get; init; }
}

public static class SystemPrompts
{
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

        可用组件类型:
        - echarts: ECharts 图表，支持 line, bar, pie, area 等类型
        - kpi-card: KPI 卡片，用于展示单个指标
        - data-table: 数据表格
        - text: 文本组件
        - filter: 筛选器组件

        输出格式必须是 JSON，包含以下字段:
        {
          "report": { /* ReportDefinition 对象 */ },
          "pages": [ /* PageDefinition 数组，可选 */ ],
          "queries": [ /* QueryDefinition 数组，可选 */ ],
          "message": "修改说明"
        }

        当任务要求重新设计版式、根据素材生成报表、自动排版或优化布局时，必须返回完整的 pages 数组。
        如果不需要修改 queries，可以省略该字段，但不要输出与现有 query id 不匹配的 queryRef。
        """;
}
