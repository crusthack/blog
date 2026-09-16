namespace Blog.Api.Models;

public sealed class Post
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long PostNumber { get; set; }
    public long Revision { get; set; } = 1;
    public required string Title { get; set; }
    public string? Description { get; set; }
    public string Content { get; set; } = string.Empty;
    public string Visibility { get; set; } = PostVisibility.Public;
    public string? AccessCodeHash { get; set; }
    public Guid AccessCodeVersion { get; set; } = Guid.NewGuid();
    public Guid? CategoryId { get; set; }
    public Category? Category { get; set; }
    public Guid OwnerId { get; set; }
    public ApplicationUser Owner { get; set; } = null!;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? PublishedAtUtc { get; set; }
    public DateTime? DeletedAtUtc { get; set; }
    public ICollection<PostAsset> Assets { get; set; } = [];
}

public static class PostVisibility
{
    public const string Public = "Public";
    public const string Private = "Private";
    public const string CodeProtected = "CodeProtected";
}
