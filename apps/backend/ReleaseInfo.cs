using System.Text.Json;

namespace Blog.Api;

public sealed record ReleaseInfo(DateTimeOffset? UpdatedAtUtc)
{
    public static ReleaseInfo Load(string path)
    {
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            if (json.RootElement.ValueKind == JsonValueKind.Object &&
                json.RootElement.TryGetProperty("updatedAtUtc", out var value) &&
                value.ValueKind == JsonValueKind.String && value.TryGetDateTimeOffset(out var timestamp))
                return new(timestamp.ToUniversalTime());
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        catch (JsonException) { }
        return new((DateTimeOffset?)null);
    }
}
