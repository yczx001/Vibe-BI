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
    public string? RenderMode { get; init; }
    public required List<string> Pages { get; init; } = new();
    public string? DefaultPage { get; init; }
    public ThemeDefinition? Theme { get; init; }
    public ReportRuntimeHints? RuntimeHints { get; init; }
}

public record ReportRuntimeHints
{
    public string? FilterPlacement { get; init; }
    public string? StyleFamily { get; init; }
    public string? LayoutArchetype { get; init; }
    public string? DesignTone { get; init; }
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
    public string? Html { get; init; }
    public string? Css { get; init; }
    public string? Js { get; init; }
    public string? Template { get; init; }
    public string? Stylesheet { get; init; }
    public string? Script { get; init; }
    public List<FreeformBindingDefinition> Bindings { get; init; } = new();
    public CreativeViewportConfig? Viewport { get; init; }
}

public record CreativeViewportConfig
{
    public int? Width { get; init; }
    public int? Height { get; init; }
    public string? Mode { get; init; }
}

public record LayoutConfig
{
    public string Type { get; init; } = "grid";
    public int Columns { get; init; } = 12;
    public int RowHeight { get; init; } = 60;
    public int Gap { get; init; } = 16;
    public int Padding { get; init; } = 24;
}

public record FreeformBindingDefinition
{
    public required string Name { get; init; }
    public required string Kind { get; init; }
    public string? QueryRef { get; init; }
    public string? Alias { get; init; }
    public string? Field { get; init; }
    public List<string> Fields { get; init; } = new();
    public string? CategoryField { get; init; }
    public string? ValueField { get; init; }
    public string? SecondaryField { get; init; }
    public string? Label { get; init; }
    public string? Description { get; init; }
    public string? ShapeHint { get; init; }
    public List<string> Columns { get; init; } = new();
    public List<BindingFieldSchema> Schema { get; init; } = new();
    public List<string> RecommendedFields { get; init; } = new();
    public List<string> StructuralFields { get; init; } = new();
    public string? ChartType { get; init; }
    public string? Orientation { get; init; }
    public int? Limit { get; init; }
    public ValueFormat? Format { get; init; }
    public string? EmptyText { get; init; }
    public string? ItemTemplate { get; init; }
    public string? ClassName { get; init; }
}

public record BindingFieldSchema
{
    public required string Name { get; init; }
    public string? Label { get; init; }
    public string? DataType { get; init; }
    public string? SemanticRole { get; init; }
    public bool? IsRecommended { get; init; }
    public bool? IsStructural { get; init; }
    public bool? IsVisible { get; init; }
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

public record ValueFormat
{
    public required string Type { get; init; }
    public string? Currency { get; init; }
    public int? Decimals { get; init; }
    public string? Prefix { get; init; }
    public string? Suffix { get; init; }
    public string? CustomFormat { get; init; }
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
