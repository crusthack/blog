namespace Blog.Api.Models;

public sealed class SiteInstallation
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;
    public bool IsInitialized { get; set; }
    public bool IsInitializationInProgress { get; set; }
    public Guid? OwnerUserId { get; set; }
    public DateTimeOffset? InitializedAtUtc { get; set; }
}
