using Blog.Api.Data;
using Blog.Api.Setup;
using Microsoft.Data.Sqlite;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Blog.Api.Tests;

public sealed class SetupApiFactory : WebApplicationFactory<Program>
{
    public const string SetupCode = "test-owner-setup-code-0123456789-abcdef";

    private readonly string tempDirectory = Path.Combine(
        Path.GetTempPath(),
        $"blog-api-tests-{Guid.NewGuid():N}");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        Directory.CreateDirectory(tempDirectory);
        var tokenPath = Path.Combine(tempDirectory, "owner-bootstrap-token");
        File.WriteAllText(tokenPath, SetupCode);
        var databasePath = Path.Combine(tempDirectory, "blog.db");

        builder.UseEnvironment("Testing");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<BlogDbContext>>();
            services.RemoveAll<BlogDbContext>();
            services.AddDbContext<BlogDbContext>(options =>
                options.UseSqlite($"Data Source={databasePath}"));
            services.PostConfigure<BootstrapOptions>(options => options.TokenFile = tokenPath);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (disposing)
            SqliteConnection.ClearAllPools();

        if (disposing && Directory.Exists(tempDirectory))
            Directory.Delete(tempDirectory, recursive: true);
    }
}
