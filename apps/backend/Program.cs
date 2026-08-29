using System.Threading.RateLimiting;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Setup;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddEnvironmentVariables(prefix: "BLOG_");

var runtimeDirectory = Path.Combine(builder.Environment.ContentRootPath, "runtime");
Directory.CreateDirectory(runtimeDirectory);
var dataProtectionDirectory = Path.Combine(runtimeDirectory, "data-protection");
Directory.CreateDirectory(dataProtectionDirectory);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionDirectory));

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddOpenApi();
}

builder.Services.AddOptions<BootstrapOptions>()
    .Bind(builder.Configuration.GetSection(BootstrapOptions.SectionName));

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
    options.UseSqlite(builder.Configuration.GetConnectionString("BlogDatabase")));

builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        options.Password.RequiredLength = 8;
        options.Password.RequiredUniqueChars = 4;
        options.Password.RequireDigit = false;
        options.Password.RequireLowercase = false;
        options.Password.RequireNonAlphanumeric = false;
        options.Password.RequireUppercase = false;
        options.User.RequireUniqueEmail = true;
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

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
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
});

var app = builder.Build();

app.UseExceptionHandler();
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/api/health", async (BlogDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { Status = "Healthy" })
        : Results.StatusCode(StatusCodes.Status503ServiceUnavailable));
app.MapControllers();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>();
    await db.Database.MigrateAsync();
    if (app.Environment.IsDevelopment())
    {
        var developmentOwner = scope.ServiceProvider.GetRequiredService<DevelopmentOwnerInitializer>();
        await developmentOwner.InitializeAsync();
    }
}

app.Run();

public partial class Program;
