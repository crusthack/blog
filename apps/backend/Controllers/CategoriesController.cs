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
public sealed partial class CategoriesController(BlogDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    [EnableRateLimiting("public-read")]
    public async Task<ActionResult<IReadOnlyList<CategoryResponse>>> GetCategories()
    {
        var canManage = User.IsInRole(Roles.Owner);
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
                category.Posts.Count(post => canManage || post.Status == PostStatuses.Published)))
            .ToListAsync();

        return Ok(categories);
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPost]
    public async Task<ActionResult<CategoryResponse>> Create(SaveCategoryRequest request)
    {
        var slug = NormalizeSlug(request.Slug);
        if (!SlugPattern().IsMatch(slug))
            ModelState.AddModelError(nameof(request.Slug), "Slug는 영문 소문자, 숫자와 하이픈만 사용할 수 있습니다.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await db.Categories.AnyAsync(category => category.Slug == slug))
            return Conflict(new ProblemDetails { Title = "이미 사용 중인 카테고리 slug입니다." });

        var category = new Category
        {
            Name = request.Name.Trim(),
            Slug = slug,
            Description = Normalize(request.Description),
            SortOrder = request.SortOrder,
            IsVisible = request.IsVisible,
        };
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return Created($"/api/categories/{category.Id}", ToResponse(category, 0));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<CategoryResponse>> Update(Guid id, SaveCategoryRequest request)
    {
        var category = await db.Categories.Include(item => item.Posts)
            .SingleOrDefaultAsync(item => item.Id == id);
        if (category is null) return NotFound();

        var slug = NormalizeSlug(request.Slug);
        if (!SlugPattern().IsMatch(slug))
            ModelState.AddModelError(nameof(request.Slug), "Slug는 영문 소문자, 숫자와 하이픈만 사용할 수 있습니다.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);
        if (await db.Categories.AnyAsync(item => item.Id != id && item.Slug == slug))
            return Conflict(new ProblemDetails { Title = "이미 사용 중인 카테고리 slug입니다." });

        category.Name = request.Name.Trim();
        category.Slug = slug;
        category.Description = Normalize(request.Description);
        category.SortOrder = request.SortOrder;
        category.IsVisible = request.IsVisible;
        category.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ToResponse(category, category.Posts.Count));
    }

    [Authorize(Roles = Roles.Owner)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var category = await db.Categories.Include(item => item.Posts)
            .SingleOrDefaultAsync(item => item.Id == id);
        if (category is null) return NotFound();
        if (category.Posts.Count != 0)
            return Conflict(new ProblemDetails
            {
                Title = "글이 연결된 카테고리는 삭제할 수 없습니다.",
                Detail = "먼저 글을 다른 카테고리로 이동해 주세요.",
            });

        db.Categories.Remove(category);
        await db.SaveChangesAsync();
        return NoContent();
    }

    private static string NormalizeSlug(string value) => value.Trim().ToLowerInvariant();
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static CategoryResponse ToResponse(Category category, int postCount) => new(
        category.Id, category.Name, category.Slug, category.Description,
        category.SortOrder, category.IsVisible, postCount);

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    private static partial Regex SlugPattern();
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
}

public sealed record CategoryResponse(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    int SortOrder,
    bool IsVisible,
    int PostCount);
