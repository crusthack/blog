using System.Net;
using System.Net.Http.Json;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class CategoryVisibilityTests
{
    [Fact]
    public async Task Visitor_cannot_fetch_a_published_post_in_a_hidden_category_by_number()
    {
        using var factory = new SetupApiFactory();
        var options = new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
        };
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);

        Assert.Equal(
            HttpStatusCode.Created,
            (await owner.PostAsJsonAsync(
                "/api/setup/owner",
                new CreateOwnerRequest
                {
                    SetupCode = SetupApiFactory.SetupCode,
                    Username = "hidden-category-owner",
                    Password = "correct horse battery staple",
                })).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await owner.PostAsJsonAsync(
                "/api/auth/login",
                new LoginRequest
                {
                    Username = "hidden-category-owner",
                    Password = "correct horse battery staple",
                })).StatusCode);

        var categoryResponse = await owner.PostAsJsonAsync(
            "/api/categories",
            new SaveCategoryRequest
            {
                Name = "Hidden category",
                Slug = "hidden-category",
                IsVisible = false,
            });
        Assert.Equal(HttpStatusCode.Created, categoryResponse.StatusCode);
        var category = Assert.IsType<CategoryResponse>(
            await categoryResponse.Content.ReadFromJsonAsync<CategoryResponse>());

        var postResponse = await owner.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Published but hidden",
                Content = "# Hidden",
                CategoryId = category.Id,
                Publish = true,
            });
        Assert.Equal(HttpStatusCode.Created, postResponse.StatusCode);
        var post = Assert.IsType<PostDetailResponse>(
            await postResponse.Content.ReadFromJsonAsync<PostDetailResponse>());

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.DoesNotContain(
            (await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!,
            candidate => candidate.PostNumber == post.PostNumber);
        Assert.Equal(
            HttpStatusCode.OK,
            (await owner.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
    }
}
