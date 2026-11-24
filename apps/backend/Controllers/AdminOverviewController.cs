using Blog.Api.Auth;
using Blog.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController, Authorize(Roles = Roles.Owner), Route("api/admin/overview")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminOverviewController(BlogDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var posts = await db.Posts.CountAsync();
        var trash = await db.Posts.IgnoreQueryFilters().CountAsync(post => post.DeletedAtUtc != null);
        var members = await db.Users.CountAsync();
        var suspended = await db.Users.CountAsync(user => user.IsSuspended);
        var reports = await db.ContentReports.IgnoreQueryFilters().CountAsync(report => report.ResolvedAtUtc == null);
        var categories = await db.Categories.CountAsync();
        var comments = await db.PostComments.CountAsync(comment => comment.DeletedAtUtc == null && db.Posts.Any(post => post.Id == comment.PostId));
        var invites = await db.CommunityInvites.CountAsync(invite => invite.UsedAtUtc == null && invite.ExpiresAtUtc > DateTime.UtcNow);
        var assets = await db.PostAssets.IgnoreQueryFilters().CountAsync();
        var assetBytes = await db.PostAssets.IgnoreQueryFilters().SumAsync(asset => (long?)asset.Size) ?? 0;
        var recentPosts = await db.Posts.AsNoTracking().OrderByDescending(post => post.UpdatedAtUtc).ThenByDescending(post => post.PostNumber).Take(5)
            .Select(post => new
            {
                post.PostNumber,
                post.Title,
                post.Visibility,
                CategorySlug = post.Category == null ? null : post.Category.Slug,
                CategoryIsHidden = post.Category != null && !post.Category.IsVisible,
                UpdatedAtUtc = DateTime.SpecifyKind(post.UpdatedAtUtc, DateTimeKind.Utc)
            }).ToListAsync();
        var recentActivity = await db.AuditEvents.AsNoTracking().OrderByDescending(item => item.Id).Take(5)
            .Select(item => new { item.Id, item.Action, item.Target, CreatedAtUtc = DateTime.SpecifyKind(item.CreatedAtUtc, DateTimeKind.Utc) }).ToListAsync();
        return Ok(new
        {
            Posts = posts,
            Trash = trash,
            Members = members,
            Suspended = suspended,
            Reports = reports,
            Categories = categories,
            Comments = comments,
            Invites = invites,
            Assets = assets,
            AssetBytes = assetBytes,
            RecentPosts = recentPosts,
            RecentActivity = recentActivity,
            CheckedAtUtc = DateTime.UtcNow
        });
    }
}
