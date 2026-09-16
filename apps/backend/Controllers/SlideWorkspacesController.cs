using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
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
[Authorize]
[Route("api/posts/{postNumber:long}/slide-workspace")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[EnableRateLimiting("workspace")]
public sealed class SlideWorkspacesController(BlogDbContext db, PostAccessService access) : ControllerBase
{
    private const int MaxBytes = 5 * 1024 * 1024;

    [HttpGet]
    public async Task<IActionResult> Get(long postNumber, [FromQuery] WorkspaceScope scope)
    {
        var post = await FindPost(postNumber);
        if (post is null) return NotFound();
        if (!Matches(post, scope)) return Conflict(new ProblemDetails { Title = "본문이 변경되었습니다. 글을 다시 열어 주세요." });
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var workspace = await db.SlideWorkspaces.AsNoTracking().SingleOrDefaultAsync(item => item.PostId == post.Id && item.UserId == userId && item.SourceHash == scope.SourceHash && item.Mode == scope.Mode);
        return workspace is null ? NoContent() : Ok(ToResponse(workspace));
    }

    [HttpPut]
    [RequestSizeLimit(MaxBytes + 65536)]
    public async Task<IActionResult> Save(long postNumber, SaveWorkspaceRequest request)
    {
        var post = await FindPost(postNumber);
        if (post is null) return NotFound();
        if (!Matches(post, request)) return Conflict(new ProblemDetails { Title = "본문이 변경되었습니다. 글을 다시 열어 주세요." });
        if (!ValidWorkspace(request.Workspace))
            return BadRequest(new ProblemDetails { Title = "작업 공간 형식 또는 크기가 올바르지 않습니다. 최대 5MB입니다." });
        var payload = request.Workspace.GetRawText();
        if (Encoding.UTF8.GetByteCount(payload) > MaxBytes)
            return BadRequest(new ProblemDetails { Title = "작업 공간은 최대 5MB입니다." });
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await using var transaction = await db.Database.BeginTransactionAsync();
        var workspace = await db.SlideWorkspaces.SingleOrDefaultAsync(item => item.PostId == post.Id && item.UserId == userId && item.SourceHash == request.SourceHash && item.Mode == request.Mode);
        if ((workspace?.Revision ?? 0) != request.ExpectedRevision)
            return Conflict(new ProblemDetails { Title = "다른 기기에서 저장한 내용이 있습니다. 서버 상태를 확인하고 다시 저장해 주세요." });
        if (workspace is null)
        {
            if (await db.SlideWorkspaces.CountAsync(item => item.UserId == userId) >= 100)
                return Conflict(new ProblemDetails { Title = "서버 작업 공간이 100개를 넘었습니다. 저장 관리에서 이전 작업을 정리해 주세요." });
            workspace = new SlideWorkspace { PostId = post.Id, UserId = userId, SourceHash = request.SourceHash, Mode = request.Mode, Payload = payload };
            db.SlideWorkspaces.Add(workspace);
        }
        workspace.Payload = payload;
        workspace.Revision++;
        workspace.SavedAtUtc = DateTime.UtcNow;
        try { await db.SaveChangesAsync(); await transaction.CommitAsync(); }
        catch (DbUpdateException) { return Conflict(new ProblemDetails { Title = "동시에 저장된 작업이 있습니다. 서버 상태를 다시 확인해 주세요." }); }
        return Ok(ToResponse(workspace));
    }

    private async Task<Post?> FindPost(long number)
    {
        var post = await db.Posts.AsNoTracking().Include(item => item.Category).SingleOrDefaultAsync(item => item.PostNumber == number);
        return post is not null && access.CanRead(post, HttpContext) ? post : null;
    }
    private static bool Matches(Post post, WorkspaceScope scope) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(post.Content))) == scope.SourceHash;
    private static object ToResponse(SlideWorkspace workspace) => new
    {
        workspace.Revision,
        SavedAt = DateTime.SpecifyKind(workspace.SavedAtUtc, DateTimeKind.Utc),
        Workspace = JsonSerializer.Deserialize<JsonElement>(workspace.Payload),
    };

    private static bool ValidWorkspace(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("annotations", out var annotations) || annotations.ValueKind != JsonValueKind.Object ||
            !root.TryGetProperty("blanks", out var blanks) || blanks.ValueKind != JsonValueKind.Array || blanks.GetArrayLength() > 100) return false;
        var entries = annotations.EnumerateObject().ToArray();
        if (entries.Length > 2000) return false;
        foreach (var blank in blanks.EnumerateArray())
            if (!Text(blank, "id", 100) || !Text(blank, "after", 100)) return false;
        foreach (var entry in entries)
        {
            var value = entry.Value;
            if (entry.Name.Length > 100 || value.ValueKind != JsonValueKind.Object || !value.TryGetProperty("strokes", out var strokes) || strokes.ValueKind != JsonValueKind.Array || strokes.GetArrayLength() > 500 ||
                !value.TryGetProperty("memos", out var memos) || memos.ValueKind != JsonValueKind.Array || memos.GetArrayLength() > 20) return false;
            foreach (var stroke in strokes.EnumerateArray())
            {
                if (!Text(stroke, "id", 100) || !Text(stroke, "color", 7) || !Regex.IsMatch(stroke.GetProperty("color").GetString()!, "^#[0-9a-fA-F]{6}$") || !Number(stroke, "size", 1, 30) ||
                    !stroke.TryGetProperty("points", out var points) || points.ValueKind != JsonValueKind.Array || points.GetArrayLength() > 4000 || points.GetArrayLength() < 1) return false;
                foreach (var point in points.EnumerateArray()) if (!Number(point, "x", 0, 1201) || !Number(point, "y", 0, 750)) return false;
            }
            foreach (var memo in memos.EnumerateArray())
                if (!Text(memo, "id", 100) || !Text(memo, "text", 20000) || !Number(memo, "x", 0, 1200) || !Number(memo, "y", 0, 750) || !Number(memo, "width", 200, 1200) || !Number(memo, "height", 120, 750) ||
                    !memo.TryGetProperty("collapsed", out var collapsed) || collapsed.ValueKind is not JsonValueKind.True and not JsonValueKind.False) return false;
        }
        return true;
    }
    private static bool Text(JsonElement node, string name, int max) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= max;
    private static bool Number(JsonElement node, string name, double min, double max) => node.ValueKind == JsonValueKind.Object && node.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) && number >= min && number <= max;
}

public class WorkspaceScope
{
    [Required, RegularExpression("^[a-f0-9]{64}$")]
    public string SourceHash { get; set; } = "";
    [Required, RegularExpression("^(auto|manual)$")]
    public string Mode { get; set; } = "auto";
}

public sealed class SaveWorkspaceRequest : WorkspaceScope
{
    [Range(0, long.MaxValue)] public long ExpectedRevision { get; set; }
    [Required] public JsonElement Workspace { get; set; }
}

[ApiController]
[Authorize]
[Route("api/me/slide-workspaces")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class MySlideWorkspacesController(BlogDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var owner = User.IsInRole(Roles.Owner);
        return Ok(await db.SlideWorkspaces.AsNoTracking().Where(item => item.UserId == userId)
            .OrderByDescending(item => item.SavedAtUtc)
            .Select(item => new
            {
                item.Id,
                item.Mode,
                SavedAtUtc = DateTime.SpecifyKind(item.SavedAtUtc, DateTimeKind.Utc),
                item.Revision,
                Title = db.Posts.Where(post => post.Id == item.PostId && (owner || post.OwnerId == userId || post.Visibility != PostVisibility.Private && (post.Category == null || post.Category.IsVisible))).Select(post => post.Title).FirstOrDefault(),
                PostNumber = db.Posts.Where(post => post.Id == item.PostId && (owner || post.OwnerId == userId || post.Visibility != PostVisibility.Private && (post.Category == null || post.Category.IsVisible))).Select(post => (long?)post.PostNumber).FirstOrDefault(),
            }).ToListAsync());
    }
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return await db.SlideWorkspaces.Where(item => item.Id == id && item.UserId == userId).ExecuteDeleteAsync() == 0 ? NotFound() : NoContent();
    }
}
