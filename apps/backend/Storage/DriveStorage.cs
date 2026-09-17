using Microsoft.Extensions.Options;

namespace Blog.Api.Storage;

public sealed class DriveStorageOptions
{
    public string StoragePath { get; set; } = "runtime/private-drive";
}

public sealed class DriveStorage(IOptions<DriveStorageOptions> options, IWebHostEnvironment environment)
{
    public const long MaxFileSize = 25 * 1024 * 1024;
    public const long Capacity = 5L * 1024 * 1024 * 1024;
    private readonly string root = Path.GetFullPath(options.Value.StoragePath, environment.ContentRootPath);
    public string GetPath(Guid id) => Path.Combine(root, id.ToString("N"));
    public async Task Write(Guid id, Stream input, CancellationToken token)
    {
        Directory.CreateDirectory(root);
        try
        {
            await using var output = new FileStream(GetPath(id), FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, true);
            var buffer = new byte[65536]; long total = 0; int count;
            while ((count = await input.ReadAsync(buffer, token)) > 0)
            {
                total += count;
                if (total > MaxFileSize) throw new InvalidDataException("파일은 25MB 이하여야 합니다.");
                await output.WriteAsync(buffer.AsMemory(0, count), token);
            }
        }
        catch { File.Delete(GetPath(id)); throw; }
    }
    public void Delete(Guid id) => File.Delete(GetPath(id));
}
