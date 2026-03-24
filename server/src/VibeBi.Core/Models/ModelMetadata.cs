namespace VibeBi.Core.Models;

public record ModelMetadata
{
    public required string DatabaseName { get; init; }
    public required string CompatibilityLevel { get; init; }
    public required List<TableInfo> Tables { get; init; } = new();
    public required List<RelationshipInfo> Relationships { get; init; } = new();
    public required List<MeasureInfo> Measures { get; init; } = new();
}

public record TableInfo
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public bool IsHidden { get; init; }
    public required List<ColumnInfo> Columns { get; init; } = new();
    public List<MeasureInfo> Measures { get; init; } = new();
}

public record ColumnInfo
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required string DataType { get; init; }
    public bool IsHidden { get; init; }
    public bool IsKey { get; init; }
    public string? SortByColumn { get; init; }
}

public record MeasureInfo
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? Expression { get; init; }
    public string? FormatString { get; init; }
    public string? DisplayFolder { get; init; }
    public string? TableName { get; init; }
}

public record RelationshipInfo
{
    public required string Name { get; init; }
    public required string FromTable { get; init; }
    public required string FromColumn { get; init; }
    public required string ToTable { get; init; }
    public required string ToColumn { get; init; }
    public required string Cardinality { get; init; }
}

public record QueryResult
{
    public required List<ColumnSchema> Columns { get; init; }
    public required List<Dictionary<string, object?>> Rows { get; init; }
    public int RowCount { get; init; }
    public long ExecutionTimeMs { get; init; }
}

public record ColumnSchema
{
    public required string Name { get; init; }
    public required string DataType { get; init; }
}
