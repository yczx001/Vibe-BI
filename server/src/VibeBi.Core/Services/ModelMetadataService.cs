using Tabular = Microsoft.AnalysisServices.Tabular;
using VibeBi.Core.Models;

namespace VibeBi.Core.Services;

public interface IModelMetadataService
{
    Task<ModelMetadata> GetMetadataAsync(string connectionString);
    Task<bool> TestConnectionAsync(string connectionString);
}

public class ModelMetadataService : IModelMetadataService
{
    public async Task<ModelMetadata> GetMetadataAsync(string connectionString)
    {
        var server = new Tabular.Server();

        try
        {
            await Task.Run(() => server.Connect(connectionString));

            if (server.Databases.Count == 0)
            {
                throw new InvalidOperationException("No databases found in the server.");
            }

            var database = server.Databases[0];
            var model = database.Model;

            var tables = new List<TableInfo>();
            var allMeasures = new List<MeasureInfo>();

            foreach (Tabular.Table table in model.Tables)
            {
                if (table.IsHidden) continue;

                var columns = new List<ColumnInfo>();
                foreach (Tabular.Column column in table.Columns)
                {
                    if (column.IsHidden) continue;

                    columns.Add(new ColumnInfo
                    {
                        Name = column.Name,
                        Description = column.Description,
                        DataType = column.DataType.ToString(),
                        IsHidden = column.IsHidden,
                        IsKey = column.IsKey,
                        SortByColumn = column.SortByColumn?.Name
                    });
                }

                var measures = new List<MeasureInfo>();
                foreach (Tabular.Measure measure in table.Measures)
                {
                    if (measure.IsHidden) continue;

                    var measureInfo = new MeasureInfo
                    {
                        Name = measure.Name,
                        Description = measure.Description,
                        Expression = measure.Expression,
                        FormatString = measure.FormatString,
                        DisplayFolder = measure.DisplayFolder,
                        TableName = table.Name
                    };
                    measures.Add(measureInfo);
                    allMeasures.Add(measureInfo);
                }

                tables.Add(new TableInfo
                {
                    Name = table.Name,
                    Description = table.Description,
                    IsHidden = table.IsHidden,
                    Columns = columns,
                    Measures = measures
                });
            }

            var relationships = new List<RelationshipInfo>();
            foreach (Tabular.SingleColumnRelationship relationship in model.Relationships)
            {
                relationships.Add(new RelationshipInfo
                {
                    Name = relationship.Name,
                    FromTable = relationship.FromTable.Name,
                    FromColumn = relationship.FromColumn.Name,
                    ToTable = relationship.ToTable.Name,
                    ToColumn = relationship.ToColumn.Name,
                    Cardinality = relationship.FromCardinality.ToString()
                });
            }

            return new ModelMetadata
            {
                DatabaseName = database.Name,
                CompatibilityLevel = database.CompatibilityLevel.ToString(),
                Tables = tables,
                Relationships = relationships,
                Measures = allMeasures
            };
        }
        finally
        {
            if (server.Connected)
            {
                server.Disconnect();
            }
        }
    }

    public async Task<bool> TestConnectionAsync(string connectionString)
    {
        var server = new Tabular.Server();

        try
        {
            await Task.Run(() => server.Connect(connectionString));
            return server.Connected;
        }
        catch
        {
            return false;
        }
        finally
        {
            if (server.Connected)
            {
                server.Disconnect();
            }
        }
    }
}
