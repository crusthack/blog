namespace Blog.Api.Models;

public sealed class CommunityInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string TokenHash { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? UsedAtUtc { get; set; }
}

public sealed class PostComment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostId { get; set; }
    public Guid AuthorId { get; set; }
    public ApplicationUser Author { get; set; } = null!;
    public Guid? ParentId { get; set; }
    public required string Content { get; set; }
    public long Revision { get; set; } = 1;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAtUtc { get; set; }
}

public sealed class PostBookmark
{
    public Guid UserId { get; set; }
    public Guid PostId { get; set; }
}

public sealed class ContentReport
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public Guid ReporterId { get; set; }
    public Guid? CommentId { get; set; }
    public required string Reason { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAtUtc { get; set; }
    public string? Resolution { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public Guid ActorId { get; set; }
    public required string Action { get; set; }
    public required string Target { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
