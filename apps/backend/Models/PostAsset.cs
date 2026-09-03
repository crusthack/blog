namespace Blog.Api.Models;

public sealed class PostAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public required string Name { get; set; }
    public required string Extension { get; set; }
    public required string StorageFileName { get; set; }
    public required string ContentType { get; set; }
    public long Size { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
