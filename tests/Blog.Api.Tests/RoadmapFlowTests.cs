using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Blog.Api.Controllers;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Blog.Api.Tests;

public sealed class RoadmapFlowTests
{
    private const string Password = "correct horse battery staple";
    private static HttpClient Client(SetupApiFactory factory) => factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    private static async Task<HttpClient> Owner(SetupApiFactory factory)
    {
        var client = Client(factory);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/setup/owner", new CreateOwnerRequest { SetupCode = SetupApiFactory.SetupCode, Username = "owner", Password = Password })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "owner", Password = Password })).StatusCode);
        return client;
    }
    private static async Task<PostDetailResponse> Create(HttpClient client, string visibility = "Public")
    {
        var response = await client.PostAsJsonAsync("/api/posts", new CreatePostRequest { Title = "Roadmap", Content = "# Original", Visibility = visibility, AccessCode = visibility == "CodeProtected" ? "test-code" : null });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PostDetailResponse>())!;
    }
    private static string Hash(PostDetailResponse post) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(post.Content)));
    private static string Route(PostDetailResponse post) => $"/api/posts/{post.PostNumber}/slide-workspace";
    private static object Payload(PostDetailResponse post, long revision = 0) => new
    {
        sourceHash = Hash(post),
        mode = "auto",
        expectedRevision = revision,
        workspace = new { annotations = new { title = new { strokes = Array.Empty<object>(), memos = new[] { new { id = "memo1", text = "saved memo", x = 10, y = 20, width = 300, height = 200, collapsed = false } } } }, blanks = Array.Empty<object>() },
    };

    [Fact]
    public async Task Trash_restores_privately_and_permanent_deletion_never_reuses_numbers()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var visitor = Client(factory);
        var post = await Create(owner);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"/api/posts/{post.PostNumber}/permanent")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync("/api/posts/trash")).StatusCode);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        Assert.Empty((await owner.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Single((await owner.GetFromJsonAsync<JsonElement[]>("/api/posts/trash"))!);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/posts/{post.PostNumber}/restore", null)).StatusCode);
        Assert.Equal("Private", (await owner.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}"))!.Visibility);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}/permanent");
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement[]>("/api/posts/trash"))!);
        Assert.True((await Create(owner)).PostNumber > post.PostNumber);
    }

    [Fact]
    public async Task Server_workspaces_require_explicit_save_and_are_private_to_the_user()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var secondDevice = Client(factory); using var visitor = Client(factory);
        await secondDevice.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "owner", Password = Password });
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        Assert.True((await users.CreateAsync(new ApplicationUser { UserName = "reader" }, Password)).Succeeded);
        using var reader = Client(factory); await reader.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "reader", Password = Password });
        var post = await Create(owner);
        var query = $"{Route(post)}?sourceHash={Hash(post)}&mode=auto";
        Assert.Equal(HttpStatusCode.NoContent, (await owner.GetAsync(query)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
        var saved = await secondDevice.GetFromJsonAsync<JsonElement>(query);
        Assert.EndsWith("Z", saved.GetProperty("savedAt").GetString());
        Assert.Equal("saved memo", saved.GetProperty("workspace").GetProperty("annotations").GetProperty("title").GetProperty("memos")[0].GetProperty("text").GetString());
        Assert.Equal(HttpStatusCode.NoContent, (await reader.GetAsync(query)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await secondDevice.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await secondDevice.PutAsJsonAsync(Route(post), Payload(post, 1))).StatusCode);
        var stored = Assert.Single((await owner.GetFromJsonAsync<JsonElement[]>("/api/me/slide-workspaces"))!);
        Assert.EndsWith("Z", stored.GetProperty("savedAtUtc").GetString());
        var id = stored.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await reader.DeleteAsync($"/api/me/slide-workspaces/{id}")).StatusCode);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(query)).StatusCode);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}/permanent");
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement[]>("/api/me/slide-workspaces"))!);
    }

    [Fact]
    public async Task Workspaces_enforce_post_access_current_source_and_payload_shape()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory);
        using var scope = factory.Services.CreateScope();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        await users.CreateAsync(new ApplicationUser { UserName = "reader" }, Password);
        using var reader = Client(factory); await reader.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "reader", Password = Password });
        var post = await Create(owner, "CodeProtected");
        Assert.Equal(HttpStatusCode.NotFound, (await reader.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
        await reader.PostAsJsonAsync($"/api/posts/{post.PostNumber}/unlock", new UnlockPostRequest { Code = "test-code" });
        Assert.Equal(HttpStatusCode.OK, (await reader.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(Route(post), new { sourceHash = Hash(post), mode = "auto" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(Route(post), new { sourceHash = Hash(post), mode = "auto", workspace = new { annotations = new { invalid = new { strokes = new[] { new { color = "url(evil)" } }, memos = Array.Empty<object>() } }, blanks = Array.Empty<object>() } })).StatusCode);
        await owner.PutAsJsonAsync($"/api/posts/{post.PostNumber}", new UpdatePostRequest { Title = post.Title, Content = "changed", Visibility = "Private" });
        Assert.Equal(HttpStatusCode.NotFound, (await reader.GetAsync($"{Route(post)}?sourceHash={Hash(post)}&mode=auto")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PutAsJsonAsync(Route(post), Payload(post))).StatusCode);
    }

    [Fact]
    public async Task Asset_audit_includes_trash_and_reports_missing_orphan_and_size_errors_without_deleting()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var visitor = Client(factory);
        var post = await Create(owner);
        Directory.CreateDirectory(factory.AssetStoragePath);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>();
        var entity = await db.Posts.SingleAsync();
        db.PostAssets.Add(new PostAsset { PostId = entity.Id, Name = "missing", StorageFileName = "missing.png", Extension = ".png", ContentType = "image/png", Size = 10 });
        db.PostAssets.Add(new PostAsset { PostId = entity.Id, Name = "size", StorageFileName = "size.png", Extension = ".png", ContentType = "image/png", Size = 10 });
        await db.SaveChangesAsync();
        await File.WriteAllTextAsync(Path.Combine(factory.AssetStoragePath, "size.png"), "x");
        var orphan = Path.Combine(factory.AssetStoragePath, "orphan.png");
        await File.WriteAllTextAsync(orphan, "test"); File.SetLastWriteTimeUtc(orphan, DateTime.UtcNow.AddHours(-2));
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync("/api/admin/storage-audit")).StatusCode);
        var audit = await owner.GetFromJsonAsync<JsonElement>("/api/admin/storage-audit");
        Assert.Equal(1, audit.GetProperty("missing").GetArrayLength());
        Assert.True(audit.GetProperty("missing")[0].GetProperty("inTrash").GetBoolean());
        Assert.Equal(1, audit.GetProperty("sizeMismatches").GetArrayLength());
        Assert.Equal(1, audit.GetProperty("orphanCandidates").GetArrayLength());
        Assert.True(File.Exists(orphan));
    }
}
