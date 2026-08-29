namespace Blog.Api.Models;

public sealed class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long PostNumber { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public string Content { get; set; } = string.Empty;
    public string Status { get; set; } = PostStatuses.Draft;
    public Guid OwnerId { get; set; }
    public ApplicationUser Owner { get; set; } = null!;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
}

public static class PostStatuses
{
    public const string Draft = "Draft";
    public const string Published = "Published";
}
