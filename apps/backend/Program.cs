using System.Threading.RateLimiting;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Setup;
using Blog.Api.Storage;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using System.Net;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables(prefix: "BLOG_");

var runtimeDirectory = Path.Combine(builder.Environment.ContentRootPath, "runtime");
Directory.CreateDirectory(runtimeDirectory);
var dataProtectionDirectory = Path.Combine(runtimeDirectory, "data-protection");
Directory.CreateDirectory(dataProtectionDirectory);

builder.Services.AddHttpClient();
builder.Services.AddCors(options => options.AddPolicy("pages-public-read", policy =>
    policy.WithOrigins("https://crusthack.github.io", "https://crusthack.com").WithMethods("GET")));
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionDirectory));
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 1;
    options.KnownIPNetworks.Add(new System.Net.IPNetwork(IPAddress.Parse("172.30.0.0"), 24));
});

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOpenApi();
}

builder.Services.AddOptions<BootstrapOptions>()
    .Bind(builder.Configuration.GetSection(BootstrapOptions.SectionName));
builder.Services.AddOptions<PostAssetStorageOptions>()
    .Bind(builder.Configuration.GetSection(PostAssetStorageOptions.SectionName));

var developmentOwnerSection = builder.Configuration.GetSection(DevelopmentOwnerOptions.SectionName);
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOptions<DevelopmentOwnerOptions>()
        .Bind(developmentOwnerSection)
        .Validate(
            options => !options.Enabled || options.IsValid(),
            "DevelopmentOwner must contain a valid username, email, and password.")
        .ValidateOnStart();
    builder.Services.AddScoped<DevelopmentOwnerInitializer>();
}
else if (developmentOwnerSection.Exists())
{
    throw new InvalidOperationException(
        "DevelopmentOwner configuration is forbidden outside the Development environment.");
}

builder.Services.AddDbContext<BlogDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("BlogDatabase")
        ?? throw new InvalidOperationException("The BlogDatabase connection string is required.");
    var sqliteConnectionString = new SqliteConnectionStringBuilder(connectionString)
    {
        DefaultTimeout = 5,
        ForeignKeys = true,
        Pooling = true,
    }.ToString();
    options.UseSqlite(sqliteConnectionString);
});

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequiredUniqueChars = 4;
        options.Password.RequireDigit = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.User.RequireUniqueEmail = false;
        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    })
    .AddRoles<IdentityRole<Guid>>()
    .AddSignInManager()
    .AddEntityFrameworkStores<BlogDbContext>();

builder.Services
    .AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies();

builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "blog.session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
        ? CookieSecurePolicy.SameAsRequest
        : CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(7);
    options.SlidingExpiration = true;
    options.Events = new CookieAuthenticationEvents
    {
        OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return Task.CompletedTask;
        },
        OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        },
    };
});

builder.Services.AddScoped<BootstrapTokenProvider>();
builder.Services.AddScoped<OwnerSetupService>();
builder.Services.AddSingleton<PostAssetStorage>();
builder.Services.Configure<DriveStorageOptions>(builder.Configuration.GetSection("DriveStorage"));
builder.Services.AddSingleton<DriveStorage>();
builder.Services.AddScoped<PostAccessService>();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("post-unlock", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
            }));
    options.AddPolicy("owner-setup", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
            }));
    options.AddPolicy("login", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(15),
                QueueLimit = 0,
            }));
    options.AddPolicy("workspace", context =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("community-write", context =>
        RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("public-read", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    options.AddPolicy("image-read", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 180,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    // Same-origin browser mutations only; non-browser API clients have no Fetch Metadata header.
    var site = context.Request.Headers["Sec-Fetch-Site"].ToString();
    if (context.Request.Method is not "GET" and not "HEAD" and not "OPTIONS" && site is "cross-site" or "same-site")
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden; return;
    }
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var db = context.RequestServices.GetRequiredService<BlogDbContext>();
        var rawId = context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(rawId, out var id) || !await db.Users.AnyAsync(user => user.Id == id && !user.IsSuspended))
        {
            await context.SignOutAsync(IdentityConstants.ApplicationScheme);
            context.Response.Headers.CacheControl = "no-store";
            context.Response.StatusCode = StatusCodes.Status401Unauthorized; return;
        }
    }
    await next(context);
});
app.UseAuthorization();
var releaseInfo = Blog.Api.ReleaseInfo.Load(Path.Combine(AppContext.BaseDirectory, "release-info.json"));
app.MapGet("/api/health", async (BlogDbContext db, HttpContext context, CancellationToken cancellationToken) =>
{
    context.Response.Headers.CacheControl = "no-store";
    var databaseConnected = await db.Database.CanConnectAsync(cancellationToken);
    var status = databaseConnected ? "Healthy" : "Unhealthy";
    var response = new
    {
        Status = status,
        Api = new { Status = "Healthy" },
        Database = new { Provider = "SQLite", Status = status },
        CheckedAtUtc = DateTime.UtcNow,
        Release = releaseInfo,
    };

    return databaseConnected
        ? Results.Ok(response)
        : Results.Json(response, statusCode: StatusCodes.Status503ServiceUnavailable);
});
app.MapControllers();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode = WAL;");
    await db.Database.ExecuteSqlRawAsync("PRAGMA foreign_keys = ON;");
    await db.Database.ExecuteSqlRawAsync("PRAGMA busy_timeout = 5000;");
    await db.Database.MigrateAsync();
    if (app.Environment.IsDevelopment())
    {
        var developmentOwner = scope.ServiceProvider.GetRequiredService<DevelopmentOwnerInitializer>();
        await developmentOwner.InitializeAsync();
    }
}

app.Run();

public partial class Program;
