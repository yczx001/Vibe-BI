using Microsoft.AspNetCore.Hosting.Server;
using VibeBi.Core.Services;

namespace VibeBi.Api;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // Add services
        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();

        // Add CORS for Electron
        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowElectron", policy =>
            {
                policy.AllowAnyOrigin()
                    .AllowAnyMethod()
                    .AllowAnyHeader();
            });
        });

        // Register core services
        builder.Services.AddSingleton<IModelMetadataService, ModelMetadataService>();
        builder.Services.AddSingleton<IDaxExecutionService, DaxExecutionService>();
        builder.Services.AddSingleton<IReportFileService, ReportFileService>();

        var app = builder.Build();

        // Configure middleware
        if (app.Environment.IsDevelopment())
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        app.UseCors("AllowElectron");
        app.UseAuthorization();
        app.MapControllers();

        // Print port for Electron to discover
        var urls = app.Urls.Any() ? app.Urls : new[] { "http://localhost:0" };

        app.Start();

        // Output the actual port
        var server = app.Services.GetRequiredService<IServer>();
        var addresses = server.Features.Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>()?.Addresses;
        if (addresses != null)
        {
            foreach (var address in addresses)
            {
                Console.WriteLine($"Now listening on: {address}");
            }
        }

        app.WaitForShutdown();
    }
}
