using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Blog.Api.Controllers;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Setup;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Blog.Api.Tests;

public sealed class PostAccessTests
{
    [Fact]
    public async Task Visibility_controls_lists_search_counts_body_and_assets()
    {
        using var factory = new SetupApiFactory();
        using var owner = await Owner(factory);
        using var visitor = Client(factory);
        var categoryResponse = await owner.PostAsJsonAsync("/api/categories",
            new SaveCategoryRequest { Name = "Access", Slug = "access", IsVisible = true });
        var category = (await categoryResponse.Content.ReadFromJsonAsync<CategoryResponse>())!;
        var publicPost = await Create(owner, PostVisibility.Public, categoryId: category.Id);
        var privatePost = await Create(owner, PostVisibility.Private, categoryId: category.Id);
        var protectedPost = await Create(owner, PostVisibility.CodeProtected, "shared-code", category.Id);
        var posts = (await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!;
        Assert.Equal(2, posts.Length);
        Assert.DoesNotContain(posts, post => post.PostNumber == privatePost.PostNumber);
        Assert.Empty((await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts?query=Private"))!);
        var categories = (await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!;
        Assert.Equal(2, Assert.Single(categories).PostCount);
        Assert.Equal(3, (await owner.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!.Length);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(Route(publicPost))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(Route(privatePost))).StatusCode);
        var locked = await visitor.GetAsync(Route(protectedPost));
        Assert.Equal(HttpStatusCode.Forbidden, locked.StatusCode);
        Assert.True(locked.Headers.CacheControl!.NoStore);
        var lockedJson = await locked.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(lockedJson.GetProperty("requiresAccessCode").GetBoolean());
        Assert.Equal(category.Slug, lockedJson.GetProperty("categorySlug").GetString());
        Assert.False(lockedJson.TryGetProperty("content", out _));
        var ownerResponse = await owner.GetAsync(Route(protectedPost));
        var ownerJson = await ownerResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(ownerJson.TryGetProperty("accessCodeHash", out _));
        Assert.False(ownerJson.TryGetProperty("accessCode", out _));

        var protectedAsset = await Upload(owner, protectedPost);
        var privateAsset = await Upload(owner, privatePost);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(protectedAsset)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(privateAsset)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(privateAsset)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Unlock(visitor, protectedPost, "wrong-code")).StatusCode);
        var unlock = await Unlock(visitor, protectedPost, "shared-code");
        Assert.Equal(HttpStatusCode.NoContent, unlock.StatusCode);
        var cookie = Assert.Single(unlock.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(Route(protectedPost))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(protectedAsset)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Unlock(visitor, privatePost, "shared-code")).StatusCode);

        await owner.PutAsJsonAsync($"/api/categories/{category.Id}",
            new SaveCategoryRequest { Name = "Access", Slug = "access", IsVisible = false });
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(Route(protectedPost))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(protectedAsset)).StatusCode);
    }

    [Fact]
    public async Task Code_rotation_and_visibility_changes_revoke_existing_grants()
    {
        using var factory = new SetupApiFactory();
        using var owner = await Owner(factory);
        using var visitor = Client(factory);
        var post = await Create(owner, PostVisibility.CodeProtected, "first-code");
        var asset = await Upload(owner, post);
        Assert.Equal(HttpStatusCode.NoContent, (await Unlock(visitor, post, "first-code")).StatusCode);
        await Update(owner, post, PostVisibility.CodeProtected, null);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(Route(post))).StatusCode);
        await Update(owner, post, PostVisibility.CodeProtected, "second-code");
        Assert.Equal(HttpStatusCode.Forbidden, (await visitor.GetAsync(Route(post))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(asset)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Unlock(visitor, post, "first-code")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Unlock(visitor, post, "second-code")).StatusCode);
        await Update(owner, post, PostVisibility.Private, null);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(Route(post))).StatusCode);
        await Update(owner, post, PostVisibility.CodeProtected, "second-code");
        Assert.Equal(HttpStatusCode.Forbidden, (await visitor.GetAsync(Route(post))).StatusCode);
        await Update(owner, post, PostVisibility.Public, null);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync(asset)).StatusCode);
        using var scope = factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<BlogDbContext>().Posts.SingleAsync();
        Assert.Null(stored.AccessCodeHash);
    }

    [Fact]
    public async Task Invalid_expired_and_other_post_grants_are_rejected_and_attempts_are_limited()
    {
        using var factory = new SetupApiFactory();
        using var owner = await Owner(factory);
        using var visitor = Client(factory);
        var post = await Create(owner, PostVisibility.CodeProtected, "shared-code");
        var another = await Create(owner, PostVisibility.CodeProtected, "shared-code");
        var unlocked = await Unlock(visitor, post, "shared-code");
        Assert.Equal(HttpStatusCode.Forbidden, (await visitor.GetAsync(Route(another))).StatusCode);
        using var scope = factory.Services.CreateScope();
        var stored = await scope.ServiceProvider.GetRequiredService<BlogDbContext>().Posts
            .SingleAsync(item => item.PostNumber == post.PostNumber);
        Assert.NotEqual("shared-code", stored.AccessCodeHash);
        var protector = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>()
            .CreateProtector("Blog.PostAccess.v1");
        var expired = protector.Protect(JsonSerializer.Serialize(new
        {
            PostId = stored.Id,
            Version = stored.AccessCodeVersion,
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
        }));
        var validCookieValue = Assert.Single(unlocked.Headers.GetValues("Set-Cookie")).Split(';')[0].Split('=', 2)[1];
        using var raw = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = false,
        });
        foreach (var token in new[] { "tampered-token", expired })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, Route(post));
            request.Headers.Add("Cookie", $"blog.post.{post.PostNumber}={token}");
            Assert.Equal(HttpStatusCode.Forbidden, (await raw.SendAsync(request)).StatusCode);
        }
        using var crossPost = new HttpRequestMessage(HttpMethod.Get, Route(another));
        crossPost.Headers.Add("Cookie", $"blog.post.{another.PostNumber}={validCookieValue}");
        Assert.Equal(HttpStatusCode.Forbidden, (await raw.SendAsync(crossPost)).StatusCode);
        for (var attempt = 0; attempt < 9; attempt++)
            Assert.Equal(HttpStatusCode.BadRequest, (await Unlock(visitor, post, "wrong-code")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Unlock(visitor, post, "shared-code")).StatusCode);
    }

    [Theory]
    [InlineData("CodeProtected", null)]
    [InlineData("CodeProtected", "123")]
    [InlineData("Unknown", null)]
    public async Task Invalid_access_configuration_is_rejected(string visibility, string? code)
    {
        using var factory = new SetupApiFactory();
        using var owner = await Owner(factory);
        var response = await owner.PostAsJsonAsync("/api/posts", new CreatePostRequest
        {
            Title = "Invalid",
            Content = "Content",
            Visibility = visibility,
            AccessCode = code,
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static HttpClient Client(SetupApiFactory factory) => factory.CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
    });

    private static async Task<HttpClient> Owner(SetupApiFactory factory)
    {
        var client = Client(factory);
        const string password = "correct horse battery staple";
        var setup = await client.PostAsJsonAsync("/api/setup/owner", new CreateOwnerRequest
        {
            SetupCode = SetupApiFactory.SetupCode,
            Username = "access-owner",
            Password = password,
        });
        Assert.Equal(HttpStatusCode.Created, setup.StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Username = "access-owner",
            Password = password,
        });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        return client;
    }

    private static async Task<PostDetailResponse> Create(HttpClient owner, string visibility,
        string? code = null, Guid? categoryId = null)
    {
        var response = await owner.PostAsJsonAsync("/api/posts", new CreatePostRequest
        {
            Title = visibility,
            Content = "Protected body",
            Visibility = visibility,
            AccessCode = code,
            CategoryId = categoryId,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PostDetailResponse>())!;
    }

    private static async Task Update(HttpClient owner, PostDetailResponse post, string visibility, string? code)
    {
        var current = (await owner.GetFromJsonAsync<PostDetailResponse>(Route(post)))!;
        var response = await owner.PutAsJsonAsync(Route(post), new UpdatePostRequest
        {
            Title = post.Title,
            Content = post.Content,
            Visibility = visibility,
            AccessCode = code,
            ExpectedRevision = current.Revision,
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static string Route(PostDetailResponse post) => $"/api/posts/{post.PostNumber}";
    private static Task<HttpResponseMessage> Unlock(HttpClient client, PostDetailResponse post, string code) =>
        client.PostAsJsonAsync($"{Route(post)}/unlock", new { code });

    private static async Task<string> Upload(HttpClient owner, PostDetailResponse post)
    {
        using var form = new MultipartFormDataContent();
        using var file = new ByteArrayContent(Encoding.ASCII.GetBytes("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"));
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "protected.pdf");
        form.Add(new StringContent("Protected"), "name");
        var response = await owner.PostAsync($"{Route(post)}/assets", form);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("url").GetString()!;
    }
}
