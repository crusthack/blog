using System.ComponentModel.DataAnnotations;
using Blog.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/auth")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AuthController(
    SignInManager<ApplicationUser> signInManager,
    UserManager<ApplicationUser> userManager) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<ActionResult<CurrentUserResponse>> Login(LoginRequest request)
    {
        var username = request.Username.Trim();
        var result = await signInManager.PasswordSignInAsync(
            username,
            request.Password,
            isPersistent: true,
            lockoutOnFailure: true);

        if (!result.Succeeded)
        {
            return Unauthorized(new ProblemDetails
            {
                Title = "로그인 실패",
                Detail = "사용자명 또는 비밀번호를 확인해 주세요.",
                Status = StatusCodes.Status401Unauthorized,
            });
        }

        var user = await userManager.FindByNameAsync(username);
        return user is null ? Unauthorized() : Ok(await ToResponse(user));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me()
    {
        var user = await userManager.GetUserAsync(User);
        return user is null ? Unauthorized() : Ok(await ToResponse(user));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await signInManager.SignOutAsync();
        return NoContent();
    }

    private async Task<CurrentUserResponse> ToResponse(ApplicationUser user)
    {
        var roles = await userManager.GetRolesAsync(user);
        return new CurrentUserResponse(
            user.Id,
            user.UserName!,
            roles.Contains(Auth.Roles.Owner),
            user.CreatedAtUtc);
    }
}

public sealed class LoginRequest
{
    [Required, StringLength(64, MinimumLength = 3)]
    public required string Username { get; init; }

    [Required, StringLength(128)]
    public required string Password { get; init; }
}

public sealed record CurrentUserResponse(
    Guid Id,
    string Username,
    bool IsOwner,
    DateTimeOffset CreatedAtUtc);
