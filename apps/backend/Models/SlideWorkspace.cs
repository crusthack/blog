namespace Blog.Api.Models;

public sealed class SlideWorkspace
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid PostId { get; set; }
    public required string SourceHash { get; set; }
    public required string Mode { get; set; }
    public required string Payload { get; set; }
    public long Revision { get; set; }
    public DateTime SavedAtUtc { get; set; }
}

public sealed class PostCounter
{
    public int Id { get; set; }
    public long LastNumber { get; set; }
}
