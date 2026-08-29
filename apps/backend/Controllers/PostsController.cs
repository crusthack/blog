using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/posts")]
public sealed class PostsController(BlogDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PostSummaryResponse>>> GetPosts()
    {
        var canManage = User.IsInRole(Roles.Owner);
        var query = db.Posts.AsNoTracking();
        if (!canManage)
            query = query.Where(post => post.Status == PostStatuses.Published);

        var posts = await query
            .OrderByDescending(post => post.UpdatedAtUtc)
            .Select(post => new PostSummaryResponse(
                post.PostNumber,
                post.Title,
                post.Description,
                post.Status,
                post.UpdatedAtUtc,
                post.PublishedAtUtc))
            .ToListAsync();

        return Ok(posts);
    }

    [AllowAnonymous]
    [HttpGet("{postNumber:long}")]
    public async Task<ActionResult<PostDetailResponse>> GetPost(long postNumber)
    {
        var post = await db.Posts.AsNoTracking()
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);

        if (post is null ||
            post.Status != PostStatuses.Published && !User.IsInRole(Roles.Owner))
            return NotFound();

        return Ok(ToDetail(post));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPost]
    public async Task<ActionResult<PostDetailResponse>> Create(CreatePostRequest request)
    {
        if (!TryGetUserId(out var ownerId)) return Unauthorized();

        var postNumber = (await db.Posts.MaxAsync(post => (long?)post.PostNumber) ?? 0) + 1;
        var now = DateTime.UtcNow;
        var post = new Post
        {
            PostNumber = postNumber,
            Title = request.Title.Trim(),
            Description = Normalize(request.Description),
            Content = request.Content,
            Status = request.Publish ? PostStatuses.Published : PostStatuses.Draft,
            OwnerId = ownerId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            PublishedAtUtc = request.Publish ? now : null,
        };

        db.Posts.Add(post);
        await db.SaveChangesAsync();
        return Created($"/api/posts/{post.PostNumber}", ToDetail(post));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut("{postNumber:long}")]
    public async Task<ActionResult<PostDetailResponse>> Update(
        long postNumber,
        UpdatePostRequest request)
    {
        var post = await db.Posts.SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);
        if (post is null) return NotFound();

        post.Title = request.Title.Trim();
        post.Description = Normalize(request.Description);
        post.Content = request.Content;
        post.Status = request.Publish ? PostStatuses.Published : PostStatuses.Draft;
        post.UpdatedAtUtc = DateTime.UtcNow;
        post.PublishedAtUtc = request.Publish
            ? post.PublishedAtUtc ?? post.UpdatedAtUtc
            : null;

        await db.SaveChangesAsync();
        return Ok(ToDetail(post));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpDelete("{postNumber:long}")]
    public async Task<IActionResult> Delete(long postNumber)
    {
        var post = await db.Posts.SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);
        if (post is null) return NotFound();

        db.Posts.Remove(post);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private bool TryGetUserId(out Guid userId) =>
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out userId);

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static PostDetailResponse ToDetail(Post post) => new(
        post.PostNumber,
        post.Title,
        post.Description,
        post.Content,
        post.Status,
        post.CreatedAtUtc,
        post.UpdatedAtUtc,
        post.PublishedAtUtc);
}

public sealed record PostSummaryResponse(
    long PostNumber,
    string Title,
    string? Description,
    string Status,
    DateTime UpdatedAtUtc,
    DateTime? PublishedAtUtc);

public sealed record PostDetailResponse(
    long PostNumber,
    string Title,
    string? Description,
    string Content,
    string Status,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? PublishedAtUtc);

public class CreatePostRequest
{
    [Required, StringLength(240, MinimumLength = 1)]
    public required string Title { get; init; }

    [StringLength(500)]
    public string? Description { get; init; }

    [Required, StringLength(1_000_000, MinimumLength = 1)]
    public required string Content { get; init; }

    public bool Publish { get; init; }
}

public sealed class UpdatePostRequest : CreatePostRequest;
