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

[ApiController, Route("api/admin/drive"), Authorize(Roles = Roles.Owner)]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[EnableRateLimiting("public-read")]
public sealed class AdminDriveController(BlogDbContext db, DriveStorage storage, ILogger<AdminDriveController> logger) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(Guid? parentId, bool trash = false, [StringLength(200)] string? query = null, [Range(1, 100000)] int page = 1)
    {
        var parent = parentId ?? Guid.Empty;
        if (!trash && !await ValidParent(parent)) return NotFound();
        var entries = db.DriveEntries.AsNoTracking().Where(e => trash ? e.DeletedAtUtc != null : e.DeletedAtUtc == null && e.ParentId == parent);
        if (!string.IsNullOrWhiteSpace(query)) entries = entries.Where(e => e.Name.Contains(query.Trim()));
        return Ok(new
        {
            Items = await entries.OrderByDescending(e => e.IsFolder).ThenBy(e => e.Name).ThenBy(e => e.Id).Skip((page - 1) * 50).Take(50).Select(e => new { e.Id, e.ParentId, e.Name, e.IsFolder, e.Size, e.Revision, UpdatedAtUtc = DateTime.SpecifyKind(e.UpdatedAtUtc, DateTimeKind.Utc) }).ToListAsync(),
            Total = await entries.CountAsync(),
            Folders = await db.DriveEntries.AsNoTracking().Where(e => e.IsFolder && e.DeletedAtUtc == null).OrderBy(e => e.Name).ToListAsync(),
            UsedBytes = await db.DriveEntries.SumAsync(e => e.Size),
            CapacityBytes = DriveStorage.Capacity,
            MaxFileBytes = DriveStorage.MaxFileSize
        });
    }

    [EnableRateLimiting("community-write")]
    [HttpPost("folders")]
    public async Task<IActionResult> Folder(DriveEditRequest request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock();
        var error = await Validate(request, null);
        if (error != null) return BadRequest(new ProblemDetails { Title = error });
        if (await db.DriveEntries.CountAsync() >= 10000 || await db.DriveEntries.CountAsync(e => e.IsFolder) >= 1000)
            return BadRequest(new ProblemDetails { Title = "파일 또는 폴더 개수 한도에 도달했습니다." });
        var entry = new DriveEntry { Name = request.Name.Trim(), NameKey = Key(request.Name), ParentId = request.ParentId, IsFolder = true };
        db.DriveEntries.Add(entry); Audit("drive.folder", entry.Id);
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return Ok(entry);
    }

    [EnableRateLimiting("community-write")]
    [HttpPost("files"), RequestSizeLimit(DriveStorage.MaxFileSize + 65536), RequestFormLimits(MultipartBodyLengthLimit = DriveStorage.MaxFileSize + 65536)]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] Guid? parentId, CancellationToken token)
    {
        var request = new DriveEditRequest { Name = file.FileName, ParentId = parentId ?? Guid.Empty };
        if (file.Length > DriveStorage.MaxFileSize) return BadRequest(new ProblemDetails { Title = "파일은 25MB 이하여야 합니다." });
        await using var transaction = await db.Database.BeginTransactionAsync(token); await Lock();
        var error = await Validate(request, null);
        if (error != null) return BadRequest(new ProblemDetails { Title = error });
        if (await db.DriveEntries.CountAsync(token) >= 10000 || await db.DriveEntries.SumAsync(e => e.Size, token) + file.Length > DriveStorage.Capacity)
            return BadRequest(new ProblemDetails { Title = "저장 한도를 초과했습니다. 휴지통을 정리해 주세요." });
        var entry = new DriveEntry { Name = request.Name.Trim(), NameKey = Key(request.Name), ParentId = request.ParentId, Size = file.Length };
        var written = false;
        try
        {
            await using var input = file.OpenReadStream(); await storage.Write(entry.Id, input, token); written = true;
            db.DriveEntries.Add(entry); Audit("drive.upload", entry.Id);
            await db.SaveChangesAsync(token); await transaction.CommitAsync(token); return Ok(entry);
        }
        catch { if (written) storage.Delete(entry.Id); throw; }
    }

    [HttpGet("{id:guid}/download")]
    public async Task<IActionResult> Download(Guid id)
    {
        var entry = await db.DriveEntries.AsNoTracking().SingleOrDefaultAsync(e => e.Id == id && !e.IsFolder && e.DeletedAtUtc == null);
        if (entry == null || !System.IO.File.Exists(storage.GetPath(id))) return NotFound();
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers["Content-Security-Policy"] = "sandbox";
        return PhysicalFile(storage.GetPath(id), "application/octet-stream", entry.Name, enableRangeProcessing: true);
    }

    [EnableRateLimiting("community-write")]
    [HttpPut("{id:guid}")]
    public Task<IActionResult> Update(Guid id, DriveEditRequest request) => Move(id, request, false);
    [EnableRateLimiting("community-write")]
    [HttpPost("{id:guid}/restore")]
    public Task<IActionResult> Restore(Guid id, DriveEditRequest request) => Move(id, request, true);
    private async Task<IActionResult> Move(Guid id, DriveEditRequest request, bool restore)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock();
        var entry = await db.DriveEntries.SingleOrDefaultAsync(e => e.Id == id);
        if (entry == null || (entry.DeletedAtUtc != null) != restore) return NotFound();
        if (request.ExpectedRevision != entry.Revision) return Conflict(new ProblemDetails { Title = "항목이 변경되었습니다. 새로고침해 주세요." });
        var error = await Validate(request, entry);
        if (error != null) return BadRequest(new ProblemDetails { Title = error });
        entry.Name = request.Name.Trim(); entry.NameKey = Key(request.Name); entry.ParentId = request.ParentId;
        entry.DeletedAtUtc = null; entry.UpdatedAtUtc = DateTime.UtcNow; entry.Revision++;
        Audit(restore ? "drive.restore" : "drive.update", id);
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return Ok(entry);
    }

    [EnableRateLimiting("community-write")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [Range(1, long.MaxValue)] long revision, bool permanent = false)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(); await Lock();
        var entry = await db.DriveEntries.SingleOrDefaultAsync(e => e.Id == id);
        if (entry == null || (entry.DeletedAtUtc != null) != permanent) return NotFound();
        if (entry.Revision != revision) return Conflict(new ProblemDetails { Title = "항목이 변경되었습니다. 새로고침해 주세요." });
        if (entry.IsFolder && await db.DriveEntries.AnyAsync(e => e.ParentId == id && e.DeletedAtUtc == null))
            return BadRequest(new ProblemDetails { Title = "폴더 안의 항목을 먼저 이동하거나 삭제해 주세요." });
        if (permanent) db.DriveEntries.Remove(entry);
        else { entry.DeletedAtUtc = DateTime.UtcNow; entry.Revision++; }
        Audit(permanent ? "drive.purge" : "drive.trash", id);
        await db.SaveChangesAsync(); await transaction.CommitAsync();
        if (permanent && !entry.IsFolder)
        {
            try { storage.Delete(id); }
            catch (IOException exception) { logger.LogError(exception, "Failed to delete drive blob {Id}", id); }
            catch (UnauthorizedAccessException exception) { logger.LogError(exception, "Failed to delete drive blob {Id}", id); }
        }
        return NoContent();
    }

    // Acquire SQLite's write lock before checking tree, duplicate names and capacity.
    private Task Lock() => db.Database.ExecuteSqlRawAsync("UPDATE SiteInstallations SET Id = Id WHERE Id = 1");
    private Task<bool> ValidParent(Guid id) => id == Guid.Empty ? Task.FromResult(true) : db.DriveEntries.AnyAsync(e => e.Id == id && e.IsFolder && e.DeletedAtUtc == null);
    private static string Key(string name) => name.Trim().Normalize().ToUpperInvariant();
    private async Task<string?> Validate(DriveEditRequest request, DriveEntry? entry)
    {
        var name = request.Name.Trim();
        if (name.Length is < 1 or > 200 || name is "." or ".." || name.Any(c => char.IsControl(c) || "<>:\"/\\|?*".Contains(c))) return "파일 이름에 사용할 수 없는 문자가 있습니다.";
        if (!await ValidParent(request.ParentId)) return "대상 폴더를 찾지 못했습니다.";
        var key = Key(name);
        if (await db.DriveEntries.AnyAsync(e => e.ParentId == request.ParentId && e.NameKey == key && e.DeletedAtUtc == null && (entry == null || e.Id != entry.Id))) return "같은 이름이 이미 있습니다.";
        var current = request.ParentId; var visited = new HashSet<Guid>();
        while (current != Guid.Empty)
        {
            if (current == entry?.Id || !visited.Add(current)) return "자기 자신이나 하위 폴더로 이동할 수 없습니다.";
            current = await db.DriveEntries.Where(e => e.Id == current).Select(e => e.ParentId).SingleAsync();
        }
        return null;
    }
    private void Audit(string action, Guid id) => db.AuditEvents.Add(new AuditEvent { ActorId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), Action = action, Target = id.ToString() });
}
public sealed class DriveEditRequest
{
    [Required, StringLength(200, MinimumLength = 1)] public string Name { get; init; } = "";
    public Guid ParentId { get; init; }
    [Range(0, long.MaxValue)] public long ExpectedRevision { get; init; }
}
