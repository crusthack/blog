using Microsoft.AspNetCore.Identity;

namespace Blog.Api.Models;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}
