using System.Net;
using System.Net.Http.Json;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class CategoryFlowTests
{
    [Fact]
    public async Task Owner_can_categorize_and_visitors_can_filter_posts()
    {
        using var factory = new SetupApiFactory();
        var options = new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") };
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);

        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync(
            "/api/setup/owner",
            new CreateOwnerRequest
            {
                SetupCode = SetupApiFactory.SetupCode,
                Username = "category-owner",
                Password = "correct horse battery staple",
            })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest
            {
                Username = "category-owner",
                Password = "correct horse battery staple",
            })).StatusCode);

        var categoryResponse = await owner.PostAsJsonAsync(
            "/api/categories",
            new SaveCategoryRequest
            {
                Name = "Computer Science",
                Slug = "computer-science",
                Description = "원리와 이론",
            });
        Assert.Equal(HttpStatusCode.Created, categoryResponse.StatusCode);
        var category = await categoryResponse.Content.ReadFromJsonAsync<CategoryResponse>();
        Assert.NotNull(category);

        var postResponse = await owner.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Finite automata",
                Description = "A small state machine",
                Content = "# DFA",
                CategoryId = category.Id,
            });
        Assert.Equal(HttpStatusCode.Created, postResponse.StatusCode);

        var filtered = await visitor.GetFromJsonAsync<PostSummaryResponse[]>(
            $"/api/posts?categoryId={category.Id}&query=automata");
        var post = Assert.Single(filtered!);
        Assert.Equal(category.Id, post.CategoryId);
        Assert.Equal(category.Name, post.CategoryName);
        Assert.Equal(category.Slug, post.CategorySlug);

        var renamed = await owner.PutAsJsonAsync($"/api/categories/{category.Id}", new SaveCategoryRequest
        {
            Name = category.Name,
            Slug = "renamed-category",
        });
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        var existing = await visitor.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}");
        Assert.NotNull(existing);
        Assert.Equal("renamed-category", existing.CategorySlug);
        Assert.Equal(post.PostNumber, existing.PostNumber);
        var renamedList = await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts");
        Assert.Equal("renamed-category", Assert.Single(renamedList!).CategorySlug);

        var publicCategories = await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories");
        Assert.Equal(1, Assert.Single(publicCategories!).PostCount);

        var moved = await owner.PutAsJsonAsync($"/api/posts/{post.PostNumber}", new UpdatePostRequest
        {
            Title = existing.Title,
            Content = existing.Content,
            CategoryId = null,
        });
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var uncategorized = await visitor.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}");
        Assert.Null(uncategorized!.CategorySlug);
    }
}
