using Blog.Api;

namespace Blog.Api.Tests;

public sealed class ReleaseInfoTests
{
    [Fact]
    public void Release_time_is_normalized_to_utc_and_does_not_follow_check_time()
    {
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllText(path, """{"commitSha":"034a6b5f9925b845e98732db5bd8fcb8c1c87206","updatedAtUtc":"2026-09-17T14:30:00+09:00"}""");
            var release = ReleaseInfo.Load(path);
            Assert.Equal("034a6b5f9925b845e98732db5bd8fcb8c1c87206", release.CommitSha);
            Assert.Equal(new DateTimeOffset(2026, 9, 17, 5, 30, 0, TimeSpan.Zero), release.UpdatedAtUtc);
            Assert.Equal(release, ReleaseInfo.Load(path));
        }
        finally { File.Delete(path); }
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("null")]
    [InlineData("invalid json")]
    [InlineData("""{"updatedAtUtc":"invalid"}""")]
    [InlineData("""{"updatedAtUtc":123}""")]
    public void Missing_or_invalid_metadata_never_invents_an_update_time(string content)
    {
        var path = Path.GetTempFileName();
        try { File.WriteAllText(path, content); Assert.Null(ReleaseInfo.Load(path).UpdatedAtUtc); }
        finally { File.Delete(path); }
        Assert.Null(ReleaseInfo.Load(path).UpdatedAtUtc);
    }

    [Theory]
    [InlineData("")]
    [InlineData("034a6b5")]
    [InlineData("034A6B5F9925B845E98732DB5BD8FCB8C1C87206")]
    [InlineData("z34a6b5f9925b845e98732db5bd8fcb8c1c8720")]
    public void Invalid_commit_sha_is_not_exposed(string commitSha)
    {
        var path = Path.GetTempFileName();
        try
        {
            File.WriteAllText(path, $$"""{"commitSha":"{{commitSha}}","updatedAtUtc":"2026-09-17T05:30:00Z"}""");
            var release = ReleaseInfo.Load(path);
            Assert.Null(release.CommitSha);
            Assert.NotNull(release.UpdatedAtUtc);
        }
        finally { File.Delete(path); }
    }
}
