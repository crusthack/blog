using Microsoft.Extensions.Options;

namespace Blog.Api.Storage;

public sealed class PostAssetStorage
{
    private readonly string rootPath;

    public PostAssetStorage(
        IOptions<PostAssetStorageOptions> options,
        IWebHostEnvironment environment)
    {
        var configuredPath = options.Value.StoragePath.Trim();
        rootPath = Path.GetFullPath(
            string.IsNullOrEmpty(configuredPath)
                ? Path.Combine(environment.ContentRootPath, "runtime", "post-assets")
                : Path.IsPathRooted(configuredPath)
                    ? configuredPath
                    : Path.Combine(environment.ContentRootPath, configuredPath));
    }

    public string CreateStorageFileName(string extension) =>
        $"{Guid.NewGuid():N}{extension}";

    public async Task WriteAsync(
        string storageFileName,
        ReadOnlyMemory<byte> content,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(rootPath);
        await using var stream = new FileStream(
            GetPath(storageFileName),
            FileMode.CreateNew,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 64 * 1024,
            useAsync: true);
        await stream.WriteAsync(content, cancellationToken);
    }

    public string GetPath(string storageFileName)
    {
        if (string.IsNullOrWhiteSpace(storageFileName) ||
            Path.GetFileName(storageFileName) != storageFileName)
        {
            throw new InvalidOperationException("The stored asset file name is invalid.");
        }

        return Path.Combine(rootPath, storageFileName);
    }

    public void DeleteIfExists(string storageFileName) =>
        File.Delete(GetPath(storageFileName));

    public IReadOnlyList<StoredAssetInfo> Inventory() => !Directory.Exists(rootPath) ? [] :
        new DirectoryInfo(rootPath).EnumerateFiles()
            .Where(file => !file.Attributes.HasFlag(FileAttributes.ReparsePoint))
            .Select(file => new StoredAssetInfo(file.Name, file.Length, file.LastWriteTimeUtc)).ToArray();
}

public sealed record StoredAssetInfo(string Name, long Size, DateTime ModifiedAtUtc);
