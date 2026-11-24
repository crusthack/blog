using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/categories")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed partial class CategoriesController(BlogDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    [EnableRateLimiting("public-read")]
    public async Task<ActionResult<IReadOnlyList<CategoryResponse>>> GetCategories(CancellationToken cancellationToken)
    {
        var canManage = User.IsInRole(Roles.Owner);
        var headerCategoryId = await ReadHeaderCategoryId(cancellationToken);
        var query = db.Categories.AsNoTracking();
        if (!canManage)
            query = query.Where(category => category.IsVisible);

        var categories = await query
            .OrderBy(category => category.SortOrder)
            .ThenBy(category => category.Name)
            .Select(category => new CategoryResponse(
                category.Id,
                category.Name,
                category.Slug,
                category.Description,
                category.SortOrder,
                category.IsVisible,
                category.Posts.Count(post => canManage ||
                    post.Visibility == PostVisibility.Public || post.Visibility == PostVisibility.CodeProtected),
                category.Id == headerCategoryId,
                category.ParentId,
                category.IsLocallyVisible))
            .ToListAsync(cancellationToken);

        return Ok(categories);
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut("header-shortcut")]
    public async Task<IActionResult> SetHeaderShortcut(SetHeaderCategoryRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        if (request.CategoryId is Guid categoryId &&
            !await db.Categories.AnyAsync(category => category.Id == categoryId && category.IsVisible, cancellationToken))
        {
            return BadRequest(new ProblemDetails { Title = "공개 카테고리를 선택해 주세요." });
        }

        var setting = await db.SiteSettings.SingleOrDefaultAsync(
            item => item.Key == SiteSettingKeys.HeaderCategory, cancellationToken);

        if (request.CategoryId is null)
        {
            if (setting is not null) db.SiteSettings.Remove(setting);
        }
        else if (setting is null)
        {
            db.SiteSettings.Add(new SiteSetting
            {
                Key = SiteSettingKeys.HeaderCategory,
                Value = request.CategoryId.Value.ToString(),
            });
        }
        else
        {
            setting.Value = request.CategoryId.Value.ToString();
            setting.UpdatedAtUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPost]
    public async Task<ActionResult<CategoryResponse>> Create(SaveCategoryRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
            ModelState.AddModelError(nameof(request.Name), "카테고리 이름을 입력해 주세요.");
        var slug = NormalizeSlug(request.Slug);
        if (!SlugPattern().IsMatch(slug))
            ModelState.AddModelError(nameof(request.Slug), "Slug는 영문 소문자, 숫자와 하이픈만 사용할 수 있습니다.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var parent = request.ParentId is Guid parentId ? await db.Categories.FindAsync(parentId) : null;
        if (request.ParentId.HasValue && parent is null) return InvalidParent();
        if (await db.Categories.AnyAsync(category => category.Slug == slug))
            return Conflict(new ProblemDetails { Title = "이미 사용 중인 카테고리 slug입니다." });

        var category = new Category
        {
            Name = name,
            Slug = slug,
            Description = Normalize(request.Description),
            SortOrder = request.SortOrder,
            ParentId = parent?.Id,
            IsLocallyVisible = request.IsVisible,
            IsVisible = request.IsVisible && parent?.IsVisible != false,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Created($"/api/categories/{category.Id}", ToResponse(category, 0));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CategoryResponse>> Update(Guid id, SaveCategoryRequest request)
    {
        var name = request.Name.Trim();
        if (name.Length == 0)
            ModelState.AddModelError(nameof(request.Name), "카테고리 이름을 입력해 주세요.");
        var slug = NormalizeSlug(request.Slug);
        if (!SlugPattern().IsMatch(slug))
            ModelState.AddModelError(nameof(request.Slug), "Slug는 영문 소문자, 숫자와 하이픈만 사용할 수 있습니다.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var tree = await db.Categories.ToDictionaryAsync(item => item.Id);
        if (!tree.TryGetValue(id, out var category)) return NotFound();
        if (!IsValidParent(id, request.ParentId, tree)) return InvalidParent();
        if (tree.Values.Any(item => item.Id != id && item.Slug == slug))
            return Conflict(new ProblemDetails { Title = "이미 사용 중인 카테고리 slug입니다." });

        category.Name = name;
        category.Slug = slug;
        category.Description = Normalize(request.Description);
        category.SortOrder = request.SortOrder;
        category.IsLocallyVisible = request.IsVisible;
        MoveCategory(category, request.ParentId, tree);
        var postCount = await db.Posts.CountAsync(post => post.CategoryId == id);
        var headerCategoryId = await ReadHeaderCategoryId();
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(ToResponse(category, postCount, category.Id == headerCategoryId));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut("{id:guid}/parent")]
    public async Task<IActionResult> SetParent(Guid id, SetCategoryParentRequest request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var tree = await db.Categories.ToDictionaryAsync(item => item.Id);
        if (!tree.TryGetValue(id, out var category)) return NotFound();
        if (!IsValidParent(id, request.ParentId, tree)) return InvalidParent();
        MoveCategory(category, request.ParentId, tree);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();
        if (await db.Categories.AnyAsync(item => item.ParentId == id))
            return Conflict(new ProblemDetails { Title = "하위 카테고리를 먼저 이동하거나 삭제해 주세요." });
        if (await db.Posts.AnyAsync(post => post.CategoryId == id))
            return Conflict(new ProblemDetails
            {
                Title = "글이 연결된 카테고리는 삭제할 수 없습니다.",
                Detail = "먼저 글을 다른 카테고리로 이동해 주세요.",
            });

        db.Categories.Remove(category);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return NoContent();
    }

    private static bool IsValidParent(Guid categoryId, Guid? parentId, IReadOnlyDictionary<Guid, Category> tree)
    {
        while (parentId is Guid ancestorId)
        {
            if (ancestorId == categoryId || !tree.TryGetValue(ancestorId, out var ancestor))
                return false;
            parentId = ancestor.ParentId;
        }
        return true;
    }

    private static void MoveCategory(Category category, Guid? parentId, IReadOnlyDictionary<Guid, Category> tree)
    {
        category.ParentId = parentId;
        category.IsVisible = category.IsLocallyVisible && (parentId is null || tree[parentId.Value].IsVisible);
        var now = DateTime.UtcNow;
        category.UpdatedAtUtc = now;

        var children = tree.Values.ToLookup(item => item.ParentId);
        var queue = new Queue<Category>();
        queue.Enqueue(category);
        while (queue.TryDequeue(out var parent))
        {
            foreach (var child in children[parent.Id])
            {
                var isVisible = child.IsLocallyVisible && parent.IsVisible;
                if (child.IsVisible == isVisible) continue;
                child.IsVisible = isVisible;
                child.UpdatedAtUtc = now;
                queue.Enqueue(child);
            }
        }
    }

    private BadRequestObjectResult InvalidParent() =>
        BadRequest(new ProblemDetails { Title = "자신이나 자신의 하위 카테고리는 상위 카테고리로 지정할 수 없습니다. 존재하는 다른 카테고리를 선택해 주세요." });

    private static string NormalizeSlug(string value) => value.Trim().ToLowerInvariant();
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static CategoryResponse ToResponse(Category category, int postCount, bool isHeaderShortcut = false) => new(
        category.Id, category.Name, category.Slug, category.Description,
        category.SortOrder, category.IsVisible, postCount, isHeaderShortcut, category.ParentId, category.IsLocallyVisible);

    private async Task<Guid?> ReadHeaderCategoryId(CancellationToken cancellationToken = default)
    {
        var value = await db.SiteSettings
            .Where(item => item.Key == SiteSettingKeys.HeaderCategory)
            .Select(item => item.Value)
            .SingleOrDefaultAsync(cancellationToken);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();
}

public sealed class SetHeaderCategoryRequest
{
    public required Guid? CategoryId { get; init; }
}

public sealed class SetCategoryParentRequest
{
    public required Guid? ParentId { get; init; }
}

public sealed class SaveCategoryRequest
{
    [Required, StringLength(80, MinimumLength = 1)]
    public required string Name { get; init; }

    [Required, StringLength(80, MinimumLength = 1)]
    public required string Slug { get; init; }

    [StringLength(300)]
    public string? Description { get; init; }

    [Range(0, 10_000)]
    public int SortOrder { get; init; }

    public bool IsVisible { get; init; } = true;
    public Guid? ParentId { get; init; }
}

public sealed record CategoryResponse(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    bool IsVisible,
    int PostCount,
    bool IsHeaderShortcut = false,
    Guid? ParentId = null,
    bool IsLocallyVisible = true);
