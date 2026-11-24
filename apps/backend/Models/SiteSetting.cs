namespace Blog.Api.Models;

public sealed class SiteSetting
{
    public int Id { get; set; }
    public required string Key { get; set; }
    public required string Value { get; set; }
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public static class SiteSettingKeys
{
    public const string ExternalLinks = "external-links";
    public const string HeaderCategory = "header-category";
}
