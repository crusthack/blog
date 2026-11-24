using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
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
[Authorize(Roles = Roles.Owner)]
[Route("api/posts/import")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed partial class PostImportsController(BlogDbContext db) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("community-write")]
    [RequestSizeLimit(16 * 1024 * 1024)]
    public async Task<ActionResult<IReadOnlyList<ImportedMarkdownFile>>> Import(
        ImportMarkdownRequest request,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var ownerId))
            return Unauthorized();

        var entries = new List<(ImportMarkdownFile File, string CategoryName)>();
        foreach (var file in request.Files)
        {
            var categoryName = file is null ? null : GetParentFolder(file.RelativePath);
            if (file is null || categoryName is null)
            {
                ModelState.AddModelError(nameof(request.Files), $"올바른 Markdown 폴더 경로가 필요합니다. ({file?.RelativePath})");
                return ValidationProblem(ModelState);
            }
            entries.Add((file, categoryName));
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var categories = await db.Categories.OrderBy(category => category.Slug).ToListAsync(cancellationToken);
        var categoriesByName = categories.ToLookup(category => category.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);
        var usedSlugs = categories.Select(category => category.Slug).ToHashSet(StringComparer.Ordinal);
        usedSlugs.Add("uncategorized");
        var counter = await db.PostCounters.SingleAsync(item => item.Id == 1, cancellationToken);
        var now = DateTime.UtcNow;
        var newCategoriesAreVisible = request.Visibility == PostVisibility.Public;
        var imported = new Dictionary<(Guid CategoryId, string Title, string? Description, string Content), long>();
        var results = new List<ImportedMarkdownFile>();

        foreach (var (file, categoryName) in entries)
        {
            if (!categoriesByName.TryGetValue(categoryName, out var category))
            {
                category = new Category
                {
                    Name = categoryName,
                    Slug = CreateSlug(categoryName, usedSlugs),
                    IsLocallyVisible = newCategoriesAreVisible,
                    IsVisible = newCategoriesAreVisible,
                };
                categoriesByName.Add(categoryName, category);
                db.Categories.Add(category);
            }

            var title = file.Title.Trim();
            var description = string.IsNullOrWhiteSpace(file.Description) ? null : file.Description.Trim();
            var content = file.Content.ReplaceLineEndings("\n");
            var key = (category.Id, title, description, content);
            if (!imported.TryGetValue(key, out var duplicateNumber))
            {
                duplicateNumber = await db.Posts.IgnoreQueryFilters()
                    .Where(post => post.CategoryId == category.Id && post.Title == title
                        && post.Description == description && post.Content == content)
                    .MinAsync(post => (long?)post.PostNumber, cancellationToken) ?? 0;
            }
            if (duplicateNumber != 0)
            {
                results.Add(new(file.RelativePath, duplicateNumber, true));
                continue;
            }

            var postNumber = ++counter.LastNumber;
            var originalDate = file.Date?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) ?? now;
            db.Posts.Add(new Post
            {
                PostNumber = postNumber,
                Title = title,
                Description = description,
                Content = content,
                Visibility = request.Visibility,
                Category = category,
                OwnerId = ownerId,
                CreatedAtUtc = originalDate,
                UpdatedAtUtc = now,
                PublishedAtUtc = originalDate,
            });
            db.AuditEvents.Add(new AuditEvent { ActorId = ownerId, Action = "post.import", Target = postNumber.ToString() });
            imported.Add(key, postNumber);
            results.Add(new(file.RelativePath, postNumber, false));
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return Ok(results);
    }

    private static string? GetParentFolder(string path)
    {
        var segments = path.Split('/');
        if (segments.Length < 2 || path.Contains('\\') ||
            segments.Any(segment => string.IsNullOrWhiteSpace(segment) || segment is "." or ".."))
            return null;
        var extension = Path.GetExtension(segments[^1]);
        if (!extension.Equals(".md", StringComparison.OrdinalIgnoreCase) &&
            !extension.Equals(".mdx", StringComparison.OrdinalIgnoreCase))
            return null;

        var name = segments[^2].Trim();
        return name.Length <= 80 ? name : null;
    }

    private static string CreateSlug(string name, HashSet<string> usedSlugs)
    {
        var slugBase = SlugSeparators().Replace(name.ToLowerInvariant(), "-").Trim('-');
        if (slugBase.Length == 0)
        {
            var hash = SHA256.HashData(Encoding.UTF8.GetBytes(name));
            slugBase = $"category-{Convert.ToHexStringLower(hash.AsSpan(0, 6))}";
        }

        var slug = slugBase;
        for (var number = 2; !usedSlugs.Add(slug); number++)
        {
            var suffix = $"-{number}";
            slug = slugBase[..Math.Min(slugBase.Length, 80 - suffix.Length)].TrimEnd('-') + suffix;
        }
        return slug;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex SlugSeparators();
}

public sealed class ImportMarkdownRequest
{
    [Required, MinLength(1), MaxLength(200)]
    public required ImportMarkdownFile?[] Files { get; init; }

    [Required, RegularExpression("^(Public|Private)$")]
    public string Visibility { get; init; } = PostVisibility.Private;
}

public sealed class ImportMarkdownFile
{
    [Required, StringLength(4096)]
    public required string RelativePath { get; init; }

    [Required, StringLength(240)]
    public required string Title { get; init; }

    [StringLength(500)]
    public string? Description { get; init; }

    [Required, StringLength(1_000_000)]
    public required string Content { get; init; }

    public DateOnly? Date { get; init; }
}

public sealed record ImportedMarkdownFile(string RelativePath, long PostNumber, bool Skipped);
