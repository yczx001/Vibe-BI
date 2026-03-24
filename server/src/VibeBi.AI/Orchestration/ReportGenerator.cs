using System.Text;
using System.Text.Json;
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
        ModelMetadata? metadata = null;

        // Step 1: Read metadata
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

        // Step 2: Build prompt
        yield return new GenerationProgress { Step = "building_prompt", ProgressPercent = 20, Message = "正在构建 AI 提示..." };
        var prompt = BuildPrompt(metadata, request);

        // Step 3: Generate report definition (streaming)
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

        // Step 4: Parse JSON
        yield return new GenerationProgress { Step = "parsing", ProgressPercent = 80, Message = "正在解析报表定义..." };

        try
        {
            report = JsonSerializer.Deserialize<ReportDefinition>(reportJson.ToString(), new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });
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

        yield return new GenerationProgress
        {
            Step = "complete",
            ProgressPercent = 100,
            Message = "报表生成完成",
            Report = report
        };
    }

    public async IAsyncEnumerable<GenerationProgress> RefineAsync(RefineReportRequest request)
    {
        string? errorMessage = null;
        ReportDefinition? report = null;
        List<PageDefinition>? pages = null;
        List<QueryDefinition>? queries = null;

        // Step 1: Validate current context
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

        // Step 2: Build refinement prompt
        yield return new GenerationProgress { Step = "building_prompt", ProgressPercent = 20, Message = "正在构建修改提示..." };
        var prompt = BuildRefinementPrompt(request);

        // Step 3: Generate refined report (streaming)
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

        // Step 4: Parse JSON response
        yield return new GenerationProgress { Step = "parsing", ProgressPercent = 80, Message = "正在解析修改结果..." };

        try
        {
            // Try to parse as a complete refined result with pages and queries
            var refinedResult = JsonSerializer.Deserialize<RefinedReportResult>(reportJson.ToString(), new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            if (refinedResult?.Report != null)
            {
                report = refinedResult.Report;
                pages = refinedResult.Pages ?? request.CurrentContext.Pages;
                queries = refinedResult.Queries ?? request.CurrentContext.Queries;
            }
            else
            {
                // Fallback: try to parse as just a ReportDefinition
                report = JsonSerializer.Deserialize<ReportDefinition>(reportJson.ToString(), new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });
                pages = request.CurrentContext.Pages;
                queries = request.CurrentContext.Queries;
            }
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

        yield return new GenerationProgress
        {
            Step = "complete",
            ProgressPercent = 100,
            Message = "报表修改完成",
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
        sb.AppendLine("- pages: PageDefinition 数组（可选，如果不需要修改布局可省略）");
        sb.AppendLine("- queries: QueryDefinition 数组（可选，如果不需要修改查询可省略）");
        sb.AppendLine("- message: 修改说明字符串");
        sb.AppendLine();
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
        sb.AppendLine("请生成符合以下 JSON Schema 的报表定义:");
        sb.AppendLine();
        sb.AppendLine(GetReportSchemaDescription());

        return sb.ToString();
    }

    private string GetReportSchemaDescription()
    {
        return """
        {
          "formatVersion": "1.0.0",
          "id": "uuid",
          "name": "报表名称",
          "description": "报表描述",
          "pages": ["page1"],
          "defaultPage": "page1"
        }
        """;
    }
}

public record RefinedReportResult
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

        请只输出 JSON，不要包含任何其他文本。
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

        如果不需要修改 pages 或 queries，可以省略这些字段。
        """;
}
