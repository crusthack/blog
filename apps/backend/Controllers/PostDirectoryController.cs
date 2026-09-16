using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController, Route("api/posts/directory"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None), EnableRateLimiting("public-read")]
public sealed class PostDirectoryController(BlogDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] DirectoryRequest request)
    {
        var owner = User.IsInRole(Roles.Owner);
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actor);
        if ((request.Mine || request.Bookmarked) && actor == Guid.Empty) return Unauthorized();
        var query = db.Posts.AsNoTracking().Where(post => owner || post.OwnerId == actor ||
            (post.Category == null || post.Category.IsVisible) && (post.Visibility == PostVisibility.Public || post.Visibility == PostVisibility.CodeProtected));
        if (request.Mine) query = query.Where(post => post.OwnerId == actor);
        if (request.Bookmarked) query = query.Where(post => db.PostBookmarks.Any(item => item.UserId == actor && item.PostId == post.Id));
        if (request.Category == "uncategorized") query = query.Where(post => post.CategoryId == null);
        else if (!string.IsNullOrEmpty(request.Category)) query = query.Where(post => post.Category != null && post.Category.Slug == request.Category);
        if (!string.IsNullOrEmpty(request.Visibility)) query = query.Where(post => post.Visibility == request.Visibility);
        if (!string.IsNullOrWhiteSpace(request.Query))
        {
            var pattern = "%" + request.Query.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(post => EF.Functions.Like(post.Title, pattern, "\\") || post.Description != null && EF.Functions.Like(post.Description, pattern, "\\"));
        }
        var ordered = request.Sort switch
        {
            "oldest" => query.OrderBy(post => post.PostNumber),
            "updated" => query.OrderByDescending(post => post.UpdatedAtUtc).ThenByDescending(post => post.PostNumber),
            "title" => query.OrderBy(post => post.Title).ThenByDescending(post => post.PostNumber),
            _ => query.OrderByDescending(post => post.PostNumber),
        };
        return Ok(new
        {
            Total = await query.CountAsync(),
            Page = request.Page,
            PageSize = 20,
            Items = await ordered.Skip((request.Page - 1) * 20).Take(20).Select(post => new
            {
                post.PostNumber,
                post.Title,
                post.Description,
                post.CategoryId,
                CategoryName = post.Category == null ? null : post.Category.Name,
                CategorySlug = post.Category == null ? null : post.Category.Slug,
                post.Visibility,
                UpdatedAtUtc = DateTime.SpecifyKind(post.UpdatedAtUtc, DateTimeKind.Utc),
                PublishedAtUtc = post.PublishedAtUtc == null ? (DateTime?)null : DateTime.SpecifyKind(post.PublishedAtUtc.Value, DateTimeKind.Utc),
                AuthorName = post.Owner.UserName,
                AuthorId = post.OwnerId,
                CanEdit = owner || post.OwnerId == actor,
            }).ToListAsync()
        });
    }
}
public sealed class DirectoryRequest
{
    [Range(1, 100000)] public int Page { get; init; } = 1;
    [StringLength(120)] public string? Query { get; init; }
    [StringLength(80)] public string? Category { get; init; }
    [RegularExpression("^(Public|Private|CodeProtected)$")] public string? Visibility { get; init; }
    [RegularExpression("^(newest|oldest|updated|title)$")] public string Sort { get; init; } = "newest";
    public bool Mine { get; init; }
    public bool Bookmarked { get; init; }
}
