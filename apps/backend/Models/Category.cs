namespace Blog.Api.Models;

public sealed class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string Slug { get; set; }
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public Guid? ParentId { get; set; }
    public Category? Parent { get; set; }
    public bool IsLocallyVisible { get; set; } = true;
    // Includes the visibility of all ancestors.
    public bool IsVisible { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public ICollection<Post> Posts { get; set; } = [];
}
