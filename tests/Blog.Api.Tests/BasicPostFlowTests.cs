using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class BasicPostFlowTests
{
    [Fact]
    public async Task Owner_can_create_and_update_an_immediately_public_post()
    {
        using var factory = new SetupApiFactory();
        var clientOptions = new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
        };
        using var ownerClient = factory.CreateClient(clientOptions);
        using var anonymousClient = factory.CreateClient(clientOptions);

        var setupResponse = await ownerClient.PostAsJsonAsync(
            "/api/setup/owner",
            new CreateOwnerRequest
            {
                SetupCode = SetupApiFactory.SetupCode,
                Username = "owner",
                Password = "correct horse battery staple",
            });
        Assert.Equal(HttpStatusCode.Created, setupResponse.StatusCode);

        var loginResponse = await ownerClient.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest
            {
                Username = "owner",
                Password = "correct horse battery staple",
            });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        Assert.NotEmpty(loginResponse.Headers.GetValues("Set-Cookie"));
        var currentUser = await loginResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("owner", currentUser.GetProperty("username").GetString());
        Assert.False(currentUser.TryGetProperty("email", out _));

        var createdResponse = await ownerClient.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Markdown test",
                Description = "basic post flow",
                Content = "# Hello\n\n- one\n- two",
            });
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);
        var created = await createdResponse.Content.ReadFromJsonAsync<PostDetailResponse>();
        Assert.NotNull(created);
        Assert.NotNull(created.PublishedAtUtc);

        var ownerListResponse = await ownerClient.GetAsync("/api/posts");
        Assert.Equal(HttpStatusCode.OK, ownerListResponse.StatusCode);
        var ownerPosts = await ownerListResponse.Content.ReadFromJsonAsync<PostSummaryResponse[]>();
        Assert.Contains(ownerPosts!, post => post.PostNumber == created.PostNumber);

        var initialPublicResponse = await anonymousClient.GetAsync($"/api/posts/{created.PostNumber}");
        Assert.Equal(HttpStatusCode.OK, initialPublicResponse.StatusCode);

        var publishedResponse = await ownerClient.PutAsJsonAsync(
            $"/api/posts/{created.PostNumber}",
            new UpdatePostRequest
            {
                Title = created.Title,
                Description = created.Description,
                Content = "Updated public content",
            });
        Assert.Equal(HttpStatusCode.OK, publishedResponse.StatusCode);

        var publicResponse = await anonymousClient.GetAsync($"/api/posts/{created.PostNumber}");
        Assert.Equal(HttpStatusCode.OK, publicResponse.StatusCode);
        var updated = await publicResponse.Content.ReadFromJsonAsync<PostDetailResponse>();
        Assert.NotNull(updated);
        Assert.Equal("Updated public content", updated.Content);
        Assert.Equal(created.PublishedAtUtc, updated.PublishedAtUtc);
        var publicPosts = await anonymousClient.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts");
        Assert.Contains(publicPosts!, post => post.PostNumber == created.PostNumber);
    }

    [Fact]
    public async Task Anonymous_user_cannot_create_a_post()
    {
        using var factory = new SetupApiFactory();
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Unauthorized",
                Content = "content",
            });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
