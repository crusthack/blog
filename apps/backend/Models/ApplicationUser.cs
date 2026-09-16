using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Models;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public bool IsSuspended { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
