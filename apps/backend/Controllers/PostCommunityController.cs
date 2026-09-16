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

[ApiController, Route("api/posts/{postNumber:long}/community"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PostCommunityController(BlogDbContext db, PostAccessService access) : ControllerBase
{
    private Guid Actor => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
    private async Task<Post?> Readable(long number)
    {
        var post = await db.Posts.Include(item => item.Category).SingleOrDefaultAsync(item => item.PostNumber == number);
        return post is not null && access.CanRead(post, HttpContext) ? post : null;
    }
    [AllowAnonymous, HttpGet, EnableRateLimiting("public-read")]
    public async Task<IActionResult> Read(long postNumber, [FromQuery, Range(1, 100000)] int page = 1)
    {
        var post = await Readable(postNumber); if (post is null) return NotFound();
        var comments = db.PostComments.AsNoTracking().Where(item => item.PostId == post.Id);
        var actor = User.Identity?.IsAuthenticated == true ? Actor : Guid.Empty;
        return Ok(new
        {
            Total = await comments.CountAsync(),
            Page = page,
            Bookmarked = actor != Guid.Empty && await db.PostBookmarks.AnyAsync(item => item.PostId == post.Id && item.UserId == actor),
            Items = await comments.OrderBy(item => item.CreatedAtUtc).ThenBy(item => item.Id).Skip((page - 1) * 30).Take(30)
                .Select(item => new
                {
                    item.Id,
                    item.ParentId,
                    item.AuthorId,
                    AuthorName = item.Author.UserName,
                    Content = item.DeletedAtUtc == null ? item.Content : "",
                    IsDeleted = item.DeletedAtUtc != null,
                    item.Revision,
                    CreatedAtUtc = DateTime.SpecifyKind(item.CreatedAtUtc, DateTimeKind.Utc)
                }).ToListAsync(),
        });
    }
    [Authorize, HttpPost("comments"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Comment(long postNumber, CreateCommentRequest request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var post = await Readable(postNumber); if (post is null) return NotFound();
        if (string.IsNullOrWhiteSpace(request.Content)) return BadRequest();
        if (request.ParentId.HasValue && !await db.PostComments.AnyAsync(item => item.Id == request.ParentId && item.PostId == post.Id && item.ParentId == null && item.DeletedAtUtc == null))
            return BadRequest(new ProblemDetails { Title = "같은 글의 삭제되지 않은 댓글에만 답글을 달 수 있습니다." });
        if (await db.PostComments.CountAsync(item => item.PostId == post.Id) >= 10000) return Conflict(new ProblemDetails { Title = "댓글 수 한도에 도달했습니다." });
        var comment = new PostComment { PostId = post.Id, AuthorId = Actor, ParentId = request.ParentId, Content = request.Content.Trim() };
        db.PostComments.Add(comment); await db.SaveChangesAsync(); await transaction.CommitAsync();
        return StatusCode(201, new { comment.Id });
    }
    [Authorize, HttpPut("comments/{id:guid}"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Edit(long postNumber, Guid id, EditCommentRequest request)
    {
        var post = await Readable(postNumber); if (post is null) return NotFound();
        var comment = await db.PostComments.SingleOrDefaultAsync(item => item.Id == id && item.PostId == post.Id && item.DeletedAtUtc == null);
        if (comment is null) return NotFound();
        if (comment.AuthorId != Actor) return Forbid();
        if (string.IsNullOrWhiteSpace(request.Content)) return BadRequest();
        if (comment.Revision != request.ExpectedRevision) return Conflict(new ProblemDetails { Title = "댓글이 변경되었습니다. 새로고침 후 다시 편집해 주세요." });
        comment.Content = request.Content.Trim(); comment.Revision++;
        try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Conflict(); }
        return NoContent();
    }
    [Authorize, HttpDelete("comments/{id:guid}"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Delete(long postNumber, Guid id)
    {
        var post = await Readable(postNumber); if (post is null) return NotFound();
        var comment = await db.PostComments.SingleOrDefaultAsync(item => item.Id == id && item.PostId == post.Id);
        if (comment is null) return NotFound();
        if (comment.AuthorId != Actor && !User.IsInRole(Roles.Owner)) return Forbid();
        comment.Content = ""; comment.DeletedAtUtc = DateTime.UtcNow; comment.Revision++;
        db.AuditEvents.Add(new AuditEvent { ActorId = Actor, Action = "comment.delete", Target = id.ToString() });
        try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Conflict(); }
        return NoContent();
    }
    [Authorize, HttpPut("bookmark"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Bookmark(long postNumber)
    {
        var post = await Readable(postNumber); if (post is null) return NotFound();
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT OR IGNORE INTO PostBookmarks (UserId, PostId) VALUES ({Actor}, {post.Id})");
        return NoContent();
    }
    [Authorize, HttpDelete("bookmark"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Unbookmark(long postNumber)
    {
        var post = await Readable(postNumber); if (post is null) return NotFound();
        await db.PostBookmarks.Where(item => item.UserId == Actor && item.PostId == post.Id).ExecuteDeleteAsync(); return NoContent();
    }
    [Authorize, HttpPost("reports"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Report(long postNumber, CreateReportRequest request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var post = await Readable(postNumber); if (post is null) return NotFound();
        if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest();
        if (request.CommentId.HasValue && !await db.PostComments.AnyAsync(item => item.Id == request.CommentId && item.PostId == post.Id && item.DeletedAtUtc == null)) return NotFound();
        if (await db.ContentReports.AnyAsync(item => item.PostId == post.Id && item.ReporterId == Actor && item.CommentId == request.CommentId && item.ResolvedAtUtc == null))
            return Conflict(new ProblemDetails { Title = "이미 접수한 신고를 확인 중입니다." });
        db.ContentReports.Add(new ContentReport { PostId = post.Id, ReporterId = Actor, CommentId = request.CommentId, Reason = request.Reason.Trim() });
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return StatusCode(201);
    }
}
public class CreateCommentRequest
{
    [Required, StringLength(10000, MinimumLength = 1)] public required string Content { get; init; }
    public Guid? ParentId { get; init; }
}
public sealed class EditCommentRequest : CreateCommentRequest
{
    [Range(1, long.MaxValue)] public long ExpectedRevision { get; init; }
}
public sealed class CreateReportRequest
{
    [Required, StringLength(1000, MinimumLength = 5)] public required string Reason { get; init; }
    public Guid? CommentId { get; init; }
}
