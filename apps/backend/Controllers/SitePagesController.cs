using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Encodings.Web;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/site-pages/{page}")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class SitePagesController(BlogDbContext db) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    [AllowAnonymous]
    [EnableRateLimiting("public-read")]
    [HttpGet]
    public async Task<ActionResult<SitePageResponse>> Get(string page, CancellationToken cancellationToken)
    {
        if (page is not ("home" or "about")) return NotFound();
        var value = await db.SiteSettings.AsNoTracking()
            .Where(item => item.Key == "page-" + page).Select(item => item.Value)
            .SingleOrDefaultAsync(cancellationToken);
        return Ok(value is null ? new SitePageResponse("", null)
            : JsonSerializer.Deserialize<SitePageResponse>(value, JsonOptions));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut]
    public async Task<ActionResult<SitePageResponse>> Put(string page, SaveSitePageRequest request, CancellationToken cancellationToken)
    {
        if (page is not ("home" or "about")) return NotFound();
        if (request.Content is { } content &&
            (string.IsNullOrWhiteSpace(content.Title) ||
             content.Date.Length > 0 && !DateOnly.TryParseExact(content.Date, "yyyy-MM-dd", out _)))
            return BadRequest(new ProblemDetails { Title = "제목과 날짜(YYYY-MM-DD)를 확인해 주세요." });

        var key = "page-" + page;
        var old = await db.SiteSettings.AsNoTracking().SingleOrDefaultAsync(item => item.Key == key, cancellationToken);
        var revision = old is null ? "" : JsonSerializer.Deserialize<SitePageResponse>(old.Value, JsonOptions)!.Revision;
        if (revision != request.ExpectedRevision) return Conflict(new ProblemDetails { Title = "다른 화면에서 수정되었습니다. 내용을 복사한 후 새로고침해 주세요." });
        var result = new SitePageResponse(Guid.NewGuid().ToString("N"), request.Content);
        var json = JsonSerializer.Serialize(result, JsonOptions);
        if (json.Length > 65_536) return BadRequest(new ProblemDetails { Title = "페이지 내용이 저장 한도를 초과했습니다." });
        if (old is null)
        {
            db.SiteSettings.Add(new SiteSetting { Key = key, Value = json });
            try { await db.SaveChangesAsync(cancellationToken); }
            catch (DbUpdateException) { return Conflict(new ProblemDetails { Title = "페이지가 변경되었습니다. 새로고침해 주세요." }); }
        }
        else
        {
            var updated = await db.SiteSettings.Where(item => item.Key == key && item.Value == old.Value)
                .ExecuteUpdateAsync(setters => setters.SetProperty(item => item.Value, json)
                    .SetProperty(item => item.UpdatedAtUtc, DateTime.UtcNow), cancellationToken);
            if (updated == 0) return Conflict(new ProblemDetails { Title = "페이지가 변경되었습니다. 새로고침해 주세요." });
        }
        return Ok(result);
    }
}

public sealed record SitePageResponse(string Revision, SitePageContent? Content);
public sealed class SaveSitePageRequest
{
    [MaxLength(32)] public string ExpectedRevision { get; init; } = "";
    public SitePageContent? Content { get; init; }
}
public sealed class SitePageContent
{
    [Required, MaxLength(160)] public required string Title { get; init; }
    [MaxLength(500)] public string Description { get; init; } = "";
    [MaxLength(10)] public string Date { get; init; } = "";
    [MaxLength(50_000)] public string Markdown { get; init; } = "";
}
