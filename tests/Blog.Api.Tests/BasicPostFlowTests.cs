using System.Net;
using System.Net.Http.Json;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class BasicPostFlowTests
{
    [Fact]
    public async Task Owner_can_login_write_a_draft_and_publish_it()
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
                Email = "owner@example.com",
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

        var draftResponse = await ownerClient.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Markdown test",
                Description = "basic post flow",
                Content = "# Hello\n\n- one\n- two",
                Publish = false,
            });
        Assert.Equal(HttpStatusCode.Created, draftResponse.StatusCode);
        var draft = await draftResponse.Content.ReadFromJsonAsync<PostDetailResponse>();
        Assert.NotNull(draft);
        Assert.Equal("Draft", draft.Status);

        var ownerListResponse = await ownerClient.GetAsync("/api/posts");
        Assert.Equal(HttpStatusCode.OK, ownerListResponse.StatusCode);
        var ownerPosts = await ownerListResponse.Content.ReadFromJsonAsync<PostSummaryResponse[]>();
        Assert.Contains(ownerPosts!, post => post.PostNumber == draft.PostNumber);

        var hiddenResponse = await anonymousClient.GetAsync($"/api/posts/{draft.PostNumber}");
        Assert.Equal(HttpStatusCode.NotFound, hiddenResponse.StatusCode);

        var publishedResponse = await ownerClient.PutAsJsonAsync(
            $"/api/posts/{draft.PostNumber}",
            new UpdatePostRequest
            {
                Title = draft.Title,
                Description = draft.Description,
                Content = draft.Content,
                Publish = true,
            });
        Assert.Equal(HttpStatusCode.OK, publishedResponse.StatusCode);

        var publicResponse = await anonymousClient.GetAsync($"/api/posts/{draft.PostNumber}");
        Assert.Equal(HttpStatusCode.OK, publicResponse.StatusCode);
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
