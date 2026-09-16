using System.Security.Cryptography;
using System.Text.Json;
using Blog.Api.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Auth;

public sealed class PostAccessService(IDataProtectionProvider protection, IWebHostEnvironment environment)
{
    private readonly IDataProtector protector = protection.CreateProtector("Blog.PostAccess.v1");
    private readonly PasswordHasher<Post> hasher = new();
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(12);

    public static bool IsListed(Post post, HttpContext context) =>
        post.DeletedAtUtc == null && (context.User.IsInRole(Roles.Owner) ||
        post.Category is not { IsVisible: false } &&
        post.Visibility is PostVisibility.Public or PostVisibility.CodeProtected);

    public bool CanRead(Post post, HttpContext context)
    {
        if (post.DeletedAtUtc != null) return false;
        if (context.User.IsInRole(Roles.Owner)) return true;
        if (!IsListed(post, context)) return false;
        if (post.Visibility == PostVisibility.Public) return true;
        if (!context.Request.Cookies.TryGetValue(CookieName(post), out var cookie)) return false;
        try
        {
            var grant = JsonSerializer.Deserialize<AccessGrant>(protector.Unprotect(cookie));
            return grant is not null && grant.PostId == post.Id &&
                grant.Version == post.AccessCodeVersion && grant.ExpiresAt > DateTimeOffset.UtcNow;
        }
        catch (Exception exception) when (exception is CryptographicException or JsonException)
        {
            return false;
        }
    }

    public string? Configure(Post post, string visibility, string? code)
    {
        if (visibility == PostVisibility.CodeProtected &&
            string.IsNullOrEmpty(code) && post.AccessCodeHash is null)
            return "코드로 열람할 글에는 4~128자의 접근 코드를 지정해 주세요.";

        if (visibility != post.Visibility || !string.IsNullOrEmpty(code))
            post.AccessCodeVersion = Guid.NewGuid();
        post.Visibility = visibility;
        if (visibility != PostVisibility.CodeProtected)
            post.AccessCodeHash = null;
        else if (!string.IsNullOrEmpty(code))
            post.AccessCodeHash = hasher.HashPassword(post, code);
        return null;
    }

    public bool VerifyCode(Post post, string code) =>
        post.AccessCodeHash is not null &&
        hasher.VerifyHashedPassword(post, post.AccessCodeHash, code) != PasswordVerificationResult.Failed;

    public void Grant(Post post, HttpContext context)
    {
        var expires = DateTimeOffset.UtcNow.Add(Lifetime);
        var grant = new AccessGrant(post.Id, post.AccessCodeVersion, expires);
        context.Response.Cookies.Append(CookieName(post), protector.Protect(JsonSerializer.Serialize(grant)),
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !environment.IsDevelopment() || context.Request.IsHttps,
                SameSite = SameSiteMode.Strict,
                Path = $"/api/posts/{post.PostNumber}",
                Expires = expires,
                IsEssential = true,
            });
    }

    private static string CookieName(Post post) => $"blog.post.{post.PostNumber}";
    private sealed record AccessGrant(Guid PostId, Guid Version, DateTimeOffset ExpiresAt);
}
