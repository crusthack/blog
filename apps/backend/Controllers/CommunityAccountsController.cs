using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Controllers;

[ApiController, Route("api/community"), ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class CommunityAccountsController(BlogDbContext db, UserManager<ApplicationUser> users) : ControllerBase
{
    [AllowAnonymous, HttpPost("join"), EnableRateLimiting("owner-setup")]
    public async Task<IActionResult> Join(JoinCommunityRequest request)
    {
        var hash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(request.InviteCode.Trim())));
        await using var transaction = await db.Database.BeginTransactionAsync();
        var claimed = await db.CommunityInvites.Where(item => item.TokenHash == hash && item.UsedAtUtc == null && item.ExpiresAtUtc > DateTime.UtcNow)
            .ExecuteUpdateAsync(update => update.SetProperty(item => item.UsedAtUtc, DateTime.UtcNow));
        if (claimed == 0) return BadRequest(new ProblemDetails { Title = "유효한 초대 코드를 입력해 주세요." });
        var user = new ApplicationUser { UserName = request.Username.Trim() };
        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded) return BadRequest(new ProblemDetails { Title = "가입 실패", Detail = string.Join(" ", result.Errors.Select(item => item.Description)) });
        db.AuditEvents.Add(new AuditEvent { ActorId = user.Id, Action = "member.join", Target = user.Id.ToString() });
        await db.SaveChangesAsync(); await transaction.CommitAsync();
        return StatusCode(201);
    }

    [Authorize(Roles = Roles.Owner), HttpPost("invites"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Invite()
    {
        var code = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
        var invite = new CommunityInvite { TokenHash = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(code))), ExpiresAtUtc = DateTime.UtcNow.AddDays(7) };
        db.CommunityInvites.Add(invite);
        Audit("invite.create", invite.Id.ToString()); await db.SaveChangesAsync();
        return Ok(new { invite.Id, Code = code, invite.ExpiresAtUtc });
    }

    [Authorize(Roles = Roles.Owner), HttpGet("invites")]
    public async Task<IActionResult> Invites([FromQuery, Range(1, 100000)] int page = 1)
    {
        var query = db.CommunityInvites.AsNoTracking().Where(item => item.UsedAtUtc == null && item.ExpiresAtUtc > DateTime.UtcNow);
        return Ok(new
        {
            Total = await query.CountAsync(),
            Items = await query.OrderBy(item => item.ExpiresAtUtc).ThenBy(item => item.Id).Skip((page - 1) * 30).Take(30)
            .Select(item => new { item.Id, ExpiresAtUtc = DateTime.SpecifyKind(item.ExpiresAtUtc, DateTimeKind.Utc) }).ToListAsync()
        });
    }
    [Authorize(Roles = Roles.Owner), HttpDelete("invites/{id:guid}"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Revoke(Guid id)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var changed = await db.CommunityInvites.Where(item => item.Id == id && item.UsedAtUtc == null && item.ExpiresAtUtc > DateTime.UtcNow)
            .ExecuteUpdateAsync(update => update.SetProperty(item => item.ExpiresAtUtc, DateTime.UtcNow));
        if (changed == 0) return NotFound();
        Audit("invite.revoke", id.ToString()); await db.SaveChangesAsync(); await transaction.CommitAsync(); return NoContent();
    }

    [Authorize(Roles = Roles.Owner), HttpGet("members")]
    public async Task<IActionResult> Members([FromQuery, Range(1, 100000)] int page = 1)
    {
        var query = db.Users.AsNoTracking();
        return Ok(new
        {
            Total = await query.CountAsync(),
            Page = page,
            Items = await query.OrderBy(item => item.UserName).ThenBy(item => item.Id).Skip((page - 1) * 30).Take(30)
            .Select(item => new
            {
                item.Id,
                item.UserName,
                item.IsSuspended,
                item.CreatedAtUtc,
                IsOwner = db.UserRoles.Any(role => role.UserId == item.Id && db.Roles.Any(definition => definition.Id == role.RoleId && definition.Name == Roles.Owner))
            }).ToListAsync()
        });
    }

    [Authorize(Roles = Roles.Owner), HttpPut("members/{id:guid}/suspension"), EnableRateLimiting("community-write")]
    public async Task<IActionResult> Suspend(Guid id, SuspensionRequest request)
    {
        var member = await users.FindByIdAsync(id.ToString());
        if (member is null) return NotFound();
        if (await users.IsInRoleAsync(member, Roles.Owner)) return BadRequest(new ProblemDetails { Title = "Owner 계정은 정지할 수 없습니다." });
        member.IsSuspended = request.Suspended;
        var result = await users.UpdateAsync(member);
        if (!result.Succeeded) return Conflict();
        Audit(request.Suspended ? "member.suspend" : "member.restore", id.ToString()); await db.SaveChangesAsync();
        return NoContent();
    }

    [Authorize(Roles = Roles.Owner), HttpGet("audit")]
    public async Task<IActionResult> Events([FromQuery, Range(1, 100000)] int page = 1) => Ok(new
    {
        Total = await db.AuditEvents.CountAsync(),
        Page = page,
        Items = await db.AuditEvents.AsNoTracking().OrderByDescending(item => item.Id).Skip((page - 1) * 30).Take(30)
            .Select(item => new { item.Id, item.ActorId, item.Action, item.Target, CreatedAtUtc = DateTime.SpecifyKind(item.CreatedAtUtc, DateTimeKind.Utc) }).ToListAsync(),
    });
    private void Audit(string action, string target) => db.AuditEvents.Add(new AuditEvent { ActorId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!), Action = action, Target = target });
}

public sealed class JoinCommunityRequest
{
    [Required, StringLength(64), RegularExpression("^[a-zA-Z0-9._-]{3,64}$")] public required string Username { get; init; }
    [Required, StringLength(128, MinimumLength = 12)] public required string Password { get; init; }
    [Required, StringLength(64, MinimumLength = 32)] public required string InviteCode { get; init; }
}
public sealed record SuspensionRequest(bool Suspended);
