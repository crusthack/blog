namespace Blog.Api.Models;

public sealed class DriveEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ParentId { get; set; }
    public required string Name { get; set; }
    public required string NameKey { get; set; }
    public bool IsFolder { get; set; }
    public long Size { get; set; }
    public long Revision { get; set; } = 1;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAtUtc { get; set; }
}
