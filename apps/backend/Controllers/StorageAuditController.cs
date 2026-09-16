using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Owner)]
[Route("api/admin/storage-audit")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class StorageAuditController(BlogDbContext db, PostAssetStorage storage, ILogger<StorageAuditController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Audit()
    {
        var files = storage.Inventory();
        var assets = await db.PostAssets.IgnoreQueryFilters().AsNoTracking()
            .Select(asset => new { asset.Id, asset.StorageFileName, asset.Size, PostNumber = asset.Post.PostNumber, InTrash = asset.Post.DeletedAtUtc != null }).ToListAsync();
        var known = assets.Select(asset => asset.StorageFileName).ToHashSet(StringComparer.Ordinal);
        var present = files.ToDictionary(file => file.Name, StringComparer.Ordinal);
        var missing = assets.Where(asset => !present.ContainsKey(asset.StorageFileName)).ToArray();
        var mismatched = assets.Where(asset => present.TryGetValue(asset.StorageFileName, out var file) && file.Size != asset.Size).ToArray();
        var orphaned = files.Where(file => !known.Contains(file.Name) && file.ModifiedAtUtc < DateTime.UtcNow.AddHours(-1)).ToArray();
        logger.LogInformation("Storage audit: {Missing} missing, {Mismatched} size mismatches, {Orphans} orphan candidates.", missing.Length, mismatched.Length, orphaned.Length);
        return Ok(new
        {
            CheckedAtUtc = DateTime.UtcNow,
            FileCount = files.Count,
            TotalBytes = files.Sum(file => file.Size),
            RegisteredCount = assets.Count,
            Missing = missing,
            SizeMismatches = mismatched,
            OrphanCandidates = orphaned,
            RecentUnregisteredCount = files.Count(file => !known.Contains(file.Name) && file.ModifiedAtUtc >= DateTime.UtcNow.AddHours(-1)),
        });
    }
}
