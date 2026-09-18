using System.Text.Json;

namespace Blog.Api;

public sealed record ReleaseInfo(string? CommitSha, DateTimeOffset? UpdatedAtUtc)
{
    public static ReleaseInfo Load(string path)
    {
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(path));
            if (json.RootElement.ValueKind != JsonValueKind.Object)
                return Empty;

            string? commitSha = null;
            if (json.RootElement.TryGetProperty("commitSha", out var commitValue) &&
                commitValue.ValueKind == JsonValueKind.String)
            {
                var candidate = commitValue.GetString();
                if (candidate is { Length: 40 } && candidate.All(IsLowerHexCharacter))
                    commitSha = candidate;
            }

            DateTimeOffset? updatedAtUtc = null;
            if (json.RootElement.TryGetProperty("updatedAtUtc", out var updatedValue) &&
                updatedValue.ValueKind == JsonValueKind.String &&
                updatedValue.TryGetDateTimeOffset(out var timestamp))
            {
                updatedAtUtc = timestamp.ToUniversalTime();
            }

            return new(commitSha, updatedAtUtc);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        catch (JsonException) { }
        return Empty;
    }

    private static ReleaseInfo Empty { get; } = new(null, null);

    private static bool IsLowerHexCharacter(char value) =>
        value is >= '0' and <= '9' or >= 'a' and <= 'f';
}
