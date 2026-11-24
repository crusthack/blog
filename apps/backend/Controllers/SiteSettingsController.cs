using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/site-settings/{list:regex(^(external-links|useful-links)$)}")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class SiteSettingsController(
    BlogDbContext db,
    ILogger<SiteSettingsController> logger) : ControllerBase
{
    private const int MaximumLinkCount = 20;
    private const int MaximumUrlLength = 2048;
    private const int MaximumSortOrder = 10_000;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly ExternalLinkResponse[] DefaultUsefulLinks =
    [
        new("Next.js 학습자료", "https://sangkon.com/practice-ts/", 0, true),
        new("C# 학습자료", "https://sangkon.com/practice-csharp/", 1, true),
        new(".NET Docs", "https://github.com/dotnet/docs", 2, true),
        new("Unity Docs", "https://docs.unity3d.com/Manual/", 3, true),
        new("Unreal Docs", "https://dev.epicgames.com/documentation/unreal-engine", 4, true),
        new("ASP.NET Docs", "https://learn.microsoft.com/aspnet/core/", 5, true),
        new("C++ reference", "https://www.cppreference.com/", 6, true),
        new("LeetCode", "https://leetcode.com/", 7, true),
        new("Linux kernel", "https://github.com/torvalds/linux", 8, true),
        new("Rust Docs", "https://doc.rust-lang.org/", 9, true),
    ];

    private static readonly ExternalLinkResponse[] DefaultLinks =
    [
        new("GitHub 저장소", "https://github.com/crusthack/blog", 0, true),
        new("냥코DB", "https://crusthack.github.io/catbattle/", 1, true),
        .. DefaultUsefulLinks.Select(link => link with { SortOrder = link.SortOrder + 2 }),
    ];

    [AllowAnonymous]
    [EnableRateLimiting("public-read")]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ExternalLinkResponse>>> GetPublic(
        string list, CancellationToken cancellationToken)
    {
        var links = await ReadLinks(list, cancellationToken);
        return Ok(links
            .Where(link => link.IsVisible)
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.Name, StringComparer.OrdinalIgnoreCase));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpGet("manage")]
    public async Task<ActionResult<IReadOnlyList<ExternalLinkResponse>>> GetManage(
        string list, CancellationToken cancellationToken)
    {
        var links = await ReadLinks(list, cancellationToken);
        return Ok(links
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.Name, StringComparer.OrdinalIgnoreCase));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut]
    public async Task<ActionResult<IReadOnlyList<ExternalLinkResponse>>> Put(
        SetExternalLinksRequest request,
        string list, CancellationToken cancellationToken)
    {
        if (request.Links is null)
            return BadRequestProblem("사이트 링크 목록이 필요합니다.");
        if (request.Links.Count > MaximumLinkCount)
            return BadRequestProblem($"사이트 링크는 최대 {MaximumLinkCount}개까지 등록할 수 있습니다.");

        var links = new List<ExternalLinkResponse>(request.Links.Count);
        foreach (var item in request.Links)
        {
            var name = item.Name?.Trim() ?? string.Empty;
            var url = item.Url?.Trim() ?? string.Empty;
            if (name.Length is < 1 or > 40)
                return BadRequestProblem("사이트 링크 이름은 1~40자여야 합니다.");
            if (url.Length is < 1 or > MaximumUrlLength ||
                !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            {
                return BadRequestProblem("사이트 링크 주소는 2,048자 이하의 http 또는 https URL이어야 합니다.");
            }
            if (item.SortOrder is < 0 or > MaximumSortOrder)
                return BadRequestProblem($"정렬 순서는 0~{MaximumSortOrder:N0} 사이여야 합니다.");

            links.Add(new ExternalLinkResponse(
                name,
                uri.AbsoluteUri,
                item.SortOrder,
                item.IsVisible));
        }

        links = links
            .OrderBy(link => link.SortOrder)
            .ThenBy(link => link.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        list = list.ToLowerInvariant();
        var json = JsonSerializer.Serialize(links, JsonOptions);
        var setting = await db.SiteSettings.SingleOrDefaultAsync(
            item => item.Key == list,
            cancellationToken);
        if (setting is null)
        {
            setting = new SiteSetting
            {
                Key = list,
                Value = json,
            };
            db.SiteSettings.Add(setting);
        }
        else
        {
            setting.Value = json;
            setting.UpdatedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        return Ok(links);
    }

    private async Task<IReadOnlyList<ExternalLinkResponse>> ReadLinks(
        string list, CancellationToken cancellationToken)
    {
        list = list.ToLowerInvariant();
        var storedValue = await db.SiteSettings
            .AsNoTracking()
            .Where(setting => setting.Key == list)
            .Select(setting => setting.Value)
            .SingleOrDefaultAsync(cancellationToken);
        if (storedValue is null)
            return list == SiteSettingKeys.ExternalLinks ? DefaultLinks : DefaultUsefulLinks;

        try
        {
            return JsonSerializer.Deserialize<List<ExternalLinkResponse>>(storedValue, JsonOptions) ?? [];
        }
        catch (JsonException exception)
        {
            logger.LogError(exception, "The stored external-link setting is not valid JSON.");
            return [];
        }
    }

    private BadRequestObjectResult BadRequestProblem(string detail) =>
        BadRequest(new ProblemDetails
        {
            Title = "사이트 링크 설정이 올바르지 않습니다.",
            Detail = detail,
            Status = StatusCodes.Status400BadRequest,
        });
}

public sealed class SetExternalLinksRequest
{
    [Required]
    public required IReadOnlyList<ExternalLinkRequest> Links { get; init; }
}

public sealed class ExternalLinkRequest
{
    public string? Name { get; init; }
    public string? Url { get; init; }
    public int SortOrder { get; init; }
    public bool IsVisible { get; init; } = true;
}

public sealed record ExternalLinkResponse(
    string Name,
    string Url,
    int SortOrder,
    bool IsVisible);
