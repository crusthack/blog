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
        else if (request.IncludeDescendants && !string.IsNullOrEmpty(request.Category))
        {
            var ids = await db.Database.SqlQuery<Guid>($"""
                WITH RECURSIVE subtree(Id) AS (
                    SELECT Id FROM Categories WHERE Slug = {request.Category}
                    UNION
                    SELECT c.Id FROM Categories c JOIN subtree s ON c.ParentId = s.Id
                )
                SELECT Id AS Value FROM subtree
                """).ToListAsync();
            query = query.Where(post => post.CategoryId.HasValue && ids.Contains(post.CategoryId.Value));
        }
        else if (!string.IsNullOrEmpty(request.Category)) query = query.Where(post => post.Category != null && post.Category.Slug == request.Category);
        if (!string.IsNullOrEmpty(request.Visibility))
            query = query.Where(post => (post.Category != null && !post.Category.IsVisible
                ? PostVisibility.Private : post.Visibility) == request.Visibility);
        if (!string.IsNullOrWhiteSpace(request.Query))
        {
            var pattern = "%" + request.Query.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(post => EF.Functions.Like(post.Title, pattern, "\\") || post.Description != null && EF.Functions.Like(post.Description, pattern, "\\"));
        }
        var ascending = request.Direction == "asc" || request.Direction == null && request.Sort is "oldest" or "title";
        var ordered = request.Sort switch
        {
            "priority" => (ascending ? query.OrderBy(post => post.Priority) : query.OrderByDescending(post => post.Priority))
                .ThenByDescending(post => post.CreatedAtUtc).ThenByDescending(post => post.PostNumber),
            "updated" => ascending
                ? query.OrderBy(post => post.UpdatedAtUtc).ThenBy(post => post.PostNumber)
                : query.OrderByDescending(post => post.UpdatedAtUtc).ThenByDescending(post => post.PostNumber),
            "title" => ascending
                ? query.OrderBy(post => post.Title).ThenBy(post => post.PostNumber)
                : query.OrderByDescending(post => post.Title).ThenByDescending(post => post.PostNumber),
            _ => ascending
                ? query.OrderBy(post => post.CreatedAtUtc).ThenBy(post => post.PostNumber)
                : query.OrderByDescending(post => post.CreatedAtUtc).ThenByDescending(post => post.PostNumber),
        };
        return Ok(new
        {
            Total = await query.CountAsync(),
            Page = request.Page,
            PageSize = 20,
            Items = await ordered.Skip((request.Page - 1) * 20).Take(20).Select(post => new
            {
                post.PostNumber,
                post.Priority,
                post.Revision,
                post.Title,
                post.Description,
                post.CategoryId,
                CategoryName = post.Category == null ? null : post.Category.Name,
                CategorySlug = post.Category == null ? null : post.Category.Slug,
                CategoryIsHidden = post.Category != null && !post.Category.IsVisible,
                post.Visibility,
                CreatedAtUtc = DateTime.SpecifyKind(post.CreatedAtUtc, DateTimeKind.Utc),
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
    [RegularExpression("^(priority|created|newest|oldest|updated|title)$")] public string Sort { get; init; } = "priority";
    [RegularExpression("^(asc|desc)$")] public string? Direction { get; init; }
    public bool IncludeDescendants { get; init; }
    public bool Mine { get; init; }
    public bool Bookmarked { get; init; }
}
