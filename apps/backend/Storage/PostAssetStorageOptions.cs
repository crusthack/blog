namespace Blog.Api.Storage;

public sealed class PostAssetStorageOptions
{
    public const string SectionName = "PostAssets";

    public string StoragePath { get; set; } = string.Empty;
}
