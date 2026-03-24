namespace VibeBi.Core.Models;

public record ReportDefinition
{
    public required string FormatVersion { get; init; } = "1.0.0";
    public required string Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? Author { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime ModifiedAt { get; init; }
    public string? GenerationMode { get; init; }
    public required List<string> Pages { get; init; } = new();
    public string? DefaultPage { get; init; }
}

public record DataSourceConfig
{
    public required string Type { get; init; } // "power-bi-xmla", "ssas", "tabular-server"
    public required ConnectionConfig Connection { get; init; }
    public ModelSnapshot? Model { get; init; }
}

public record ConnectionConfig
{
    public required string Server { get; init; }
    public required string Database { get; init; }
    public string? AuthMethod { get; init; } // "windows", "service-principal", "basic"
}

public record ModelSnapshot
{
    public required List<TableSnapshot> Tables { get; init; } = new();
    public required List<RelationshipInfo> Relationships { get; init; } = new();
}

public record TableSnapshot
{
    public required string Name { get; init; }
    public required List<string> Columns { get; init; } = new();
    public required List<MeasureSnapshot> Measures { get; init; } = new();
}

public record MeasureSnapshot
{
    public required string Name { get; init; }
    public string? Expression { get; init; }
}

public record PageDefinition
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public LayoutConfig? Layout { get; init; }
    public List<FilterDefinition> Filters { get; init; } = new();
    public required List<ComponentDefinition> Components { get; init; } = new();
}

public record LayoutConfig
{
    public string Type { get; init; } = "grid";
    public int Columns { get; init; } = 12;
    public int RowHeight { get; init; } = 60;
    public int Gap { get; init; } = 16;
    public int Padding { get; init; } = 24;
}

public record FilterDefinition
{
    public required string Id { get; init; }
    public required string Type { get; init; } // "date-range", "dropdown", "text", "multi-select"
    public FilterTarget Target { get; init; } = null!;
    public FilterDefault? Default { get; init; }
}

public record FilterTarget
{
    public required string Table { get; init; }
    public required string Column { get; init; }
}

public record FilterDefault
{
    public string? Relative { get; init; } // "last-7-days", "last-30-days", "last-12-months"
    public object? Value { get; init; }
}

public record ComponentDefinition
{
    public required string Id { get; init; }
    public required string Type { get; init; } // "echarts", "kpi-card", "data-table", "text"
    public required PositionConfig Position { get; init; }
    public string? QueryRef { get; init; }
    public object? Config { get; init; }
    public ComponentStyle? Style { get; init; }
}

public record PositionConfig
{
    public int X { get; init; }
    public int Y { get; init; }
    public int W { get; init; }
    public int H { get; init; }
}

public record ComponentStyle
{
    public string? BackgroundColor { get; init; }
    public string? BorderRadius { get; init; }
    public string? BoxShadow { get; init; }
}

public record QueryDefinition
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Dax { get; init; }
    public List<QueryParameter> Parameters { get; init; } = new();
    public QueryCacheConfig? Cache { get; init; }
}

public record QueryParameter
{
    public required string Name { get; init; }
    public string? FilterRef { get; init; }
    public string? ApplyTo { get; init; }
}

public record QueryCacheConfig
{
    public int Ttl { get; init; } = 300;
    public string Strategy { get; init; } = "stale-while-revalidate";
}

public record ThemeDefinition
{
    public required string Name { get; init; }
    public ThemeColors Colors { get; init; } = new();
    public ThemeTypography Typography { get; init; } = new();
    public ThemeComponents Components { get; init; } = new();
}

public record ThemeColors
{
    public string Primary { get; init; } = "#6366F1";
    public string Secondary { get; init; } = "#8B5CF6";
    public string Background { get; init; } = "#0F172A";
    public string Surface { get; init; } = "#1E293B";
    public string Text { get; init; } = "#F8FAFC";
    public string TextSecondary { get; init; } = "#94A3B8";
    public List<string> Chart { get; init; } = new() { "#6366F1", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#3B82F6" };
}

public record ThemeTypography
{
    public string FontFamily { get; init; } = "Inter, system-ui, sans-serif";
}

public record ThemeComponents
{
    public ComponentTheme Card { get; init; } = new();
}

public record ComponentTheme
{
    public int BorderRadius { get; init; } = 12;
    public string Shadow { get; init; } = "0 1px 3px rgba(0,0,0,0.3)";
    public int Padding { get; init; } = 20;
}
