using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController, Authorize(Roles = Roles.Owner), Route("api/community/reports"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class ModerationController(BlogDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery, Range(1, 100000)] int page = 1, [FromQuery] bool resolved = false)
    {
        var query = db.ContentReports.IgnoreQueryFilters().AsNoTracking().Where(item => (item.ResolvedAtUtc != null) == resolved);
        return Ok(new
        {
            Total = await query.CountAsync(),
            Page = page,
            Items = await query.OrderBy(item => item.CreatedAtUtc).ThenBy(item => item.Id).Skip((page - 1) * 30).Take(30)
            .Select(item => new
            {
                item.Id,
                item.Post.PostNumber,
                item.Post.Title,
                CategorySlug = item.Post.Category == null ? null : item.Post.Category.Slug,
                item.CommentId,
                item.Reason,
                item.ReporterId,
                item.Resolution,
                CreatedAtUtc = DateTime.SpecifyKind(item.CreatedAtUtc, DateTimeKind.Utc),
                Content = item.CommentId == null ? null : db.PostComments.Where(comment => comment.Id == item.CommentId).Select(comment => comment.Content).FirstOrDefault()
            }).ToListAsync()
        });
    }
    [HttpPut("{id:guid}"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Resolve(Guid id, ResolveReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Resolution)) return BadRequest();
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Moderators can still close reports after the reported post has moved to trash.
        var report = await db.ContentReports.IgnoreQueryFilters()
            .SingleOrDefaultAsync(item => item.Id == id && item.ResolvedAtUtc == null);
        if (report is null) return NotFound();
        if (request.HideContent)
        {
            if (report.CommentId is Guid commentId)
                await db.PostComments.Where(item => item.Id == commentId).ExecuteUpdateAsync(update => update.SetProperty(item => item.DeletedAtUtc, DateTime.UtcNow).SetProperty(item => item.Content, "").SetProperty(item => item.Revision, item => item.Revision + 1));
            else
                await db.Posts.Where(item => item.Id == report.PostId).ExecuteUpdateAsync(update => update.SetProperty(item => item.DeletedAtUtc, DateTime.UtcNow).SetProperty(item => item.AccessCodeVersion, Guid.NewGuid()).SetProperty(item => item.Revision, item => item.Revision + 1));
        }
        report.ResolvedAtUtc = DateTime.UtcNow; report.Resolution = request.Resolution.Trim();
        db.AuditEvents.Add(new AuditEvent { ActorId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), Action = request.HideContent ? "report.hide" : "report.resolve", Target = id.ToString() });
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return NoContent();
    }
}
public sealed class ResolveReportRequest
{
    [Required, StringLength(1000, MinimumLength = 3)] public required string Resolution { get; init; }
    public bool HideContent { get; init; }
}
