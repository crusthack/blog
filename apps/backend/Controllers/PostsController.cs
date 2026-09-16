using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/posts")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PostsController(
    BlogDbContext db,
    PostAssetStorage assetStorage,
    PostAccessService access,
    ILogger<PostsController> logger) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    [EnableRateLimiting("public-read")]
    public async Task<ActionResult<IReadOnlyList<PostSummaryResponse>>> GetPosts(
        [FromQuery] Guid? categoryId,
        [FromQuery, StringLength(120)] string? query)
    {
        var canManage = User.IsInRole(Roles.Owner);
        var postsQuery = db.Posts.AsNoTracking();
        if (!canManage)
            postsQuery = postsQuery.Where(post =>
                (post.Visibility == PostVisibility.Public || post.Visibility == PostVisibility.CodeProtected) &&
                (post.Category == null || post.Category.IsVisible));

        if (categoryId.HasValue)
            postsQuery = postsQuery.Where(post => post.CategoryId == categoryId);

        var search = Normalize(query);
        if (search is not null)
            postsQuery = postsQuery.Where(post =>
                EF.Functions.Like(post.Title, $"%{search}%") ||
                post.Description != null && EF.Functions.Like(post.Description, $"%{search}%"));

        var posts = await postsQuery
            .OrderByDescending(post => post.UpdatedAtUtc)
            .Select(post => new PostSummaryResponse(
                post.PostNumber,
                post.Title,
                post.Description,
                post.CategoryId,
                post.Category == null ? null : post.Category.Name,
                post.Category == null ? null : post.Category.Slug,
                post.Visibility,
                post.UpdatedAtUtc,
                post.PublishedAtUtc))
            .ToListAsync();

        return Ok(posts);
    }

    [AllowAnonymous]
    [HttpGet("{postNumber:long}")]
    [EnableRateLimiting("public-read")]
    public async Task<ActionResult<PostDetailResponse>> GetPost(long postNumber)
    {
        var post = await db.Posts.AsNoTracking()
            .Include(candidate => candidate.Category)
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);

        if (post is null || !PostAccessService.IsListed(post, HttpContext))
            return NotFound();
        if (!access.CanRead(post, HttpContext))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                RequiresAccessCode = true,
                post.Title,
                post.PostNumber,
                CategorySlug = post.Category?.Slug,
            });

        return Ok(ToDetail(post));
    }

    [AllowAnonymous]
    [HttpPost("{postNumber:long}/unlock")]
    [EnableRateLimiting("post-unlock")]
    public async Task<IActionResult> Unlock(long postNumber, UnlockPostRequest request)
    {
        var post = await db.Posts.AsNoTracking().Include(item => item.Category)
            .SingleOrDefaultAsync(item => item.PostNumber == postNumber);
        if (post is null || !PostAccessService.IsListed(post, HttpContext)) return NotFound();
        if (User.IsInRole(Roles.Owner) || post.Visibility == PostVisibility.Public) return NoContent();
        if (post.Visibility != PostVisibility.CodeProtected || !access.VerifyCode(post, request.Code))
            return BadRequest(new ProblemDetails { Title = "접근 코드가 올바르지 않습니다." });
        access.Grant(post, HttpContext);
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPost]
    public async Task<ActionResult<PostDetailResponse>> Create(CreatePostRequest request)
    {
        if (!TryGetUserId(out var ownerId)) return Unauthorized();

        Category? category = null;
        if (request.CategoryId.HasValue)
        {
            category = await db.Categories.SingleOrDefaultAsync(item => item.Id == request.CategoryId);
            if (category is null)
                return BadRequest(new ProblemDetails { Title = "존재하지 않는 카테고리입니다." });
        }

        var postNumber = (await db.Posts.MaxAsync(post => (long?)post.PostNumber) ?? 0) + 1;
        var now = DateTime.UtcNow;
        var post = new Post
        {
            PostNumber = postNumber,
            Title = request.Title.Trim(),
            Description = Normalize(request.Description),
            Content = request.Content,
            CategoryId = request.CategoryId,
            Category = category,
            OwnerId = ownerId,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            PublishedAtUtc = now,
        };

        var accessError = access.Configure(post, request.Visibility, request.AccessCode);
        if (accessError is not null) return BadRequest(new ProblemDetails { Title = accessError });
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
        var post = await db.Posts.Include(candidate => candidate.Category)
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);
        if (post is null) return NotFound();

        var accessError = access.Configure(post, request.Visibility, request.AccessCode);
        if (accessError is not null) return BadRequest(new ProblemDetails { Title = accessError });
        post.Title = request.Title.Trim();
        post.Description = Normalize(request.Description);
        post.Content = request.Content;
        Category? category = null;
        if (request.CategoryId.HasValue)
        {
            category = await db.Categories.SingleOrDefaultAsync(item => item.Id == request.CategoryId);
            if (category is null)
                return BadRequest(new ProblemDetails { Title = "존재하지 않는 카테고리입니다." });
        }
        post.CategoryId = request.CategoryId;
        post.Category = category;
        post.UpdatedAtUtc = DateTime.UtcNow;
        post.PublishedAtUtc ??= post.UpdatedAtUtc;

        await db.SaveChangesAsync();
        return Ok(ToDetail(post));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpDelete("{postNumber:long}")]
    public async Task<IActionResult> Delete(long postNumber)
    {
        var post = await db.Posts
            .Include(candidate => candidate.Assets)
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);
        if (post is null) return NotFound();

        var storageFileNames = post.Assets
            .Select(asset => asset.StorageFileName)
            .ToArray();
        db.Posts.Remove(post);
        await db.SaveChangesAsync();

        foreach (var storageFileName in storageFileNames)
        {
            try
            {
                assetStorage.DeleteIfExists(storageFileName);
            }
            catch (IOException exception)
            {
                logger.LogError(
                    exception,
                    "Failed to remove post asset {StorageFileName} after deleting post {PostNumber}.",
                    storageFileName,
                    postNumber);
            }
            catch (UnauthorizedAccessException exception)
            {
                logger.LogError(
                    exception,
                    "Failed to remove post asset {StorageFileName} after deleting post {PostNumber}.",
                    storageFileName,
                    postNumber);
            }
        }

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
        post.CategoryId,
        post.Category?.Name,
        post.Category?.Slug,
        post.Visibility,
        post.Content,
        post.CreatedAtUtc,
        post.UpdatedAtUtc,
        post.PublishedAtUtc);
}

public sealed record PostSummaryResponse(
    long PostNumber,
    string Title,
    string? Description,
    Guid? CategoryId,
    string? CategoryName,
    string? CategorySlug,
    string Visibility,
    DateTime UpdatedAtUtc,
    DateTime? PublishedAtUtc);

public sealed record PostDetailResponse(
    long PostNumber,
    string Title,
    string? Description,
    Guid? CategoryId,
    string? CategoryName,
    string? CategorySlug,
    string Visibility,
    string Content,
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

    public Guid? CategoryId { get; init; }

    [Required, RegularExpression("^(Public|Private|CodeProtected)$")]
    public string Visibility { get; init; } = PostVisibility.Public;

    [StringLength(128, MinimumLength = 4)]
    public string? AccessCode { get; init; }
}

public sealed class UpdatePostRequest : CreatePostRequest;

public sealed class UnlockPostRequest
{
    [Required, StringLength(128, MinimumLength = 4)]
    public required string Code { get; init; }
}
