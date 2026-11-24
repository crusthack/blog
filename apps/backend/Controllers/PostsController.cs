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
        [FromQuery, StringLength(120)] string? query,
        [FromQuery, Range(1, 100000)] int page = 1)
    {
        var canManage = User.IsInRole(Roles.Owner);
        TryGetUserId(out var actor);
        var postsQuery = db.Posts.AsNoTracking();
        if (!canManage)
            postsQuery = postsQuery.Where(post =>
                post.OwnerId == actor || (post.Visibility == PostVisibility.Public || post.Visibility == PostVisibility.CodeProtected) &&
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
            .ThenByDescending(post => post.PostNumber).Skip((page - 1) * 100).Take(100)
            .Select(post => new PostSummaryResponse(
                post.PostNumber,
                post.Title,
                post.Description,
                post.CategoryId,
                post.Category == null ? null : post.Category.Name,
                post.Category == null ? null : post.Category.Slug,
                post.Visibility,
                post.UpdatedAtUtc,
                post.PublishedAtUtc,
                post.Category != null && !post.Category.IsVisible))
            .ToListAsync();

        return Ok(posts);
    }

    [AllowAnonymous]
    [HttpGet("{postNumber:long}")]
    [EnableRateLimiting("public-read")]
    public async Task<ActionResult<PostDetailResponse>> GetPost(long postNumber)
    {
        var post = await db.Posts.AsNoTracking()
            .Include(candidate => candidate.Category).Include(candidate => candidate.Owner)
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
        if (PostAccessService.CanManage(post, HttpContext) || post.Visibility == PostVisibility.Public) return NoContent();
        if (post.Visibility != PostVisibility.CodeProtected || !access.VerifyCode(post, request.Code))
            return BadRequest(new ProblemDetails { Title = "접근 코드가 올바르지 않습니다." });
        access.Grant(post, HttpContext);
        return NoContent();
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpPost]
    public async Task<ActionResult<PostDetailResponse>> Create(CreatePostRequest request)
    {
        if (!TryGetUserId(out var ownerId)) return Unauthorized();

        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            ModelState.AddModelError(nameof(request.Title), "제목을 입력해 주세요.");
            return ValidationProblem(ModelState);
        }

        Category? category = null;
        if (request.CategoryId.HasValue)
        {
            category = await db.Categories.SingleOrDefaultAsync(item => item.Id == request.CategoryId);
            if (category is null || !User.IsInRole(Roles.Owner) && !category.IsVisible)
                return BadRequest(new ProblemDetails { Title = "존재하지 않는 카테고리입니다." });
        }

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.PostCounters.Where(counter => counter.Id == 1)
            .ExecuteUpdateAsync(update => update.SetProperty(counter => counter.LastNumber, counter => counter.LastNumber + 1));
        var postNumber = await db.PostCounters.Where(counter => counter.Id == 1).Select(counter => counter.LastNumber).SingleAsync();
        var now = DateTime.UtcNow;
        var post = new Post
        {
            PostNumber = postNumber,
            Title = title,
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
        Audit("post.create", postNumber);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Created($"/api/posts/{post.PostNumber}", ToDetail(post));
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpPut("{postNumber:long}")]
    public async Task<ActionResult<PostDetailResponse>> Update(
        long postNumber,
        UpdatePostRequest request)
    {
        var post = await db.Posts.Include(candidate => candidate.Category).Include(candidate => candidate.Owner)
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber);
        if (post is null) return NotFound();
        if (!PostAccessService.CanManage(post, HttpContext)) return Forbid();
        if (request.ExpectedRevision != post.Revision) return Conflict(new ProblemDetails { Title = "다른 화면에서 글이 수정되었습니다. 현재 내용을 복사한 뒤 새로고침해 주세요." });

        var title = request.Title.Trim();
        if (title.Length == 0)
        {
            ModelState.AddModelError(nameof(request.Title), "제목을 입력해 주세요.");
            return ValidationProblem(ModelState);
        }

        var accessError = access.Configure(post, request.Visibility, request.AccessCode);
        if (accessError is not null) return BadRequest(new ProblemDetails { Title = accessError });
        post.Title = title;
        post.Description = Normalize(request.Description);
        post.Content = request.Content;
        Category? category = null;
        if (request.CategoryId.HasValue)
        {
            category = await db.Categories.SingleOrDefaultAsync(item => item.Id == request.CategoryId);
            if (category is null || !User.IsInRole(Roles.Owner) && !category.IsVisible)
                return BadRequest(new ProblemDetails { Title = "존재하지 않는 카테고리입니다." });
        }
        post.CategoryId = request.CategoryId;
        post.Category = category;
        post.UpdatedAtUtc = DateTime.UtcNow;
        post.PublishedAtUtc ??= post.UpdatedAtUtc;

        post.Revision++;
        Audit("post.update", post.PostNumber);
        try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Conflict(new ProblemDetails { Title = "글이 변경되었습니다. 다시 확인해 주세요." }); }
        return Ok(ToDetail(post));
    }

    [Authorize(Roles = Roles.Owner)]
    [EnableRateLimiting("community-write")]
    [HttpPut("{postNumber:long}/priority")]
    public async Task<IActionResult> SetPriority(long postNumber, SetPostPriorityRequest request)
    {
        var post = await db.Posts.SingleOrDefaultAsync(post => post.PostNumber == postNumber);
        if (post is null) return NotFound();
        if (post.Revision != request.ExpectedRevision)
            return Conflict(new ProblemDetails { Title = "글이 변경되었습니다. 목록을 새로고침한 뒤 다시 설정해 주세요." });
        post.Priority = request.Priority;
        post.Revision++;
        Audit("post.priority", postNumber);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { return Conflict(new ProblemDetails { Title = "글이 변경되었습니다. 목록을 새로고침해 주세요." }); }
        return NoContent();
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpDelete("{postNumber:long}")]
    public async Task<IActionResult> Delete(long postNumber)
    {
        var post = await db.Posts.SingleOrDefaultAsync(post => post.PostNumber == postNumber);
        if (post is null) return NotFound();
        if (!PostAccessService.CanManage(post, HttpContext)) return Forbid();
        post.Revision++;
        Audit("post.trash", postNumber);
        post.DeletedAtUtc = DateTime.UtcNow;
        post.AccessCodeVersion = Guid.NewGuid();
        try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Conflict(); }
        logger.LogInformation("Post {PostNumber} moved to trash by {UserId}.", postNumber, User.FindFirstValue(ClaimTypes.NameIdentifier));
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpGet("trash")]
    public async Task<IActionResult> Trash() => Ok(await db.Posts.IgnoreQueryFilters().AsNoTracking()
        .Where(post => post.DeletedAtUtc != null).OrderByDescending(post => post.DeletedAtUtc)
        .Select(post => new { post.PostNumber, post.Title, post.Visibility, DeletedAtUtc = DateTime.SpecifyKind(post.DeletedAtUtc!.Value, DateTimeKind.Utc), AssetCount = post.Assets.Count })
        .ToListAsync());

    [Authorize(Roles = Roles.Owner)]
    [HttpPost("{postNumber:long}/restore")]
    public async Task<IActionResult> Restore(long postNumber)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Restoring never republishes content without an explicit visibility choice.
        var restored = await db.Posts.IgnoreQueryFilters().Where(post => post.PostNumber == postNumber && post.DeletedAtUtc != null)
            .ExecuteUpdateAsync(update => update.SetProperty(post => post.DeletedAtUtc, (DateTime?)null)
                .SetProperty(post => post.Visibility, PostVisibility.Private).SetProperty(post => post.UpdatedAtUtc, DateTime.UtcNow).SetProperty(post => post.Revision, post => post.Revision + 1));
        if (restored == 0) return NotFound();
        Audit("post.restore", postNumber); await db.SaveChangesAsync(); await transaction.CommitAsync();
        logger.LogInformation("Post {PostNumber} restored privately by {UserId}.", postNumber, User.FindFirstValue(ClaimTypes.NameIdentifier));
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpDelete("{postNumber:long}/permanent")]
    public async Task<IActionResult> PermanentlyDelete(long postNumber)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var post = await db.Posts.IgnoreQueryFilters()
            .Include(candidate => candidate.Assets)
            .SingleOrDefaultAsync(candidate => candidate.PostNumber == postNumber && candidate.DeletedAtUtc != null);
        if (post is null) return NotFound();

        var storageFileNames = post.Assets
            .Select(asset => asset.StorageFileName)
            .ToArray();
        var removed = await db.Posts.IgnoreQueryFilters().Where(candidate => candidate.Id == post.Id && candidate.DeletedAtUtc != null).ExecuteDeleteAsync();
        if (removed == 0) return NotFound();
        Audit("post.purge", postNumber); await db.SaveChangesAsync(); await transaction.CommitAsync();
        logger.LogInformation("Post {PostNumber} permanently deleted by {UserId}.", postNumber, User.FindFirstValue(ClaimTypes.NameIdentifier));

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

    private PostDetailResponse ToDetail(Post post) => new(
        post.PostNumber,
        post.Title,
        post.Description,
        post.CategoryId,
        post.Category?.Name,
        post.Category?.Slug,
        post.Visibility,
        post.Content,
        DateTime.SpecifyKind(post.CreatedAtUtc, DateTimeKind.Utc),
        DateTime.SpecifyKind(post.UpdatedAtUtc, DateTimeKind.Utc),
        post.PublishedAtUtc is DateTime published ? DateTime.SpecifyKind(published, DateTimeKind.Utc) : null,
        post.OwnerId, post.Revision, PostAccessService.CanManage(post, HttpContext), post.Owner?.UserName,
        post.Category is { IsVisible: false });

    private void Audit(string action, long number)
    {
        if (TryGetUserId(out var actor)) db.AuditEvents.Add(new AuditEvent { ActorId = actor, Action = action, Target = number.ToString() });
    }
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
    DateTime? PublishedAtUtc,
    bool CategoryIsHidden = false);

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
    DateTime? PublishedAtUtc,
    Guid AuthorId = default, long Revision = 1, bool CanEdit = false, string? AuthorName = null,
    bool CategoryIsHidden = false);

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

public sealed class UpdatePostRequest : CreatePostRequest
{
    [Range(1, long.MaxValue)] public long ExpectedRevision { get; init; } = 1;
}

public sealed class UnlockPostRequest
{
    [Required, StringLength(128, MinimumLength = 4)]
    public required string Code { get; init; }
}

public sealed class SetPostPriorityRequest
{
    [Range(0, 10000)] public int Priority { get; init; }
    [Range(1, long.MaxValue)] public long ExpectedRevision { get; init; }
}
