using System.Net;
using System.Net.Http.Json;
using Blog.Api.Controllers;
using Blog.Api.Models;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class PostImportTests
{
    [Fact]
    public async Task Folder_import_reuses_and_creates_categories_and_skips_retries()
    {
        using var factory = new SetupApiFactory();
        var options = new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") };
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);
        const string endpoint = "/api/posts/import";
        const string username = "import-owner";
        const string password = "correct horse battery staple";

        var request = new ImportMarkdownRequest
        {
            Files =
            [
                new() { RelativePath = "posts/Theory/Network/TCP.mdx", Title = "TCP", Content = "# TCP", Date = new(2025, 12, 27) },
                new() { RelativePath = "posts/Practice/Network/UDP.md", Title = "UDP", Content = "# UDP" },
                new() { RelativePath = "posts/한글/소개.MDX", Title = "소개", Content = "# 소개" },
                new() { RelativePath = "posts/Root.md", Title = "Root", Content = "# Root" },
            ],
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.PostAsJsonAsync(endpoint, request)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync("/api/setup/owner", new CreateOwnerRequest
        {
            SetupCode = SetupApiFactory.SetupCode,
            Username = username,
            Password = password,
        })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.PostAsJsonAsync("/api/auth/login", new LoginRequest
        {
            Username = username,
            Password = password,
        })).StatusCode);
        var categoryResponse = await owner.PostAsJsonAsync("/api/categories", new SaveCategoryRequest
        {
            Name = "Network",
            Slug = "existing-network",
        });
        Assert.Equal(HttpStatusCode.Created, categoryResponse.StatusCode);

        var invalid = new ImportMarkdownRequest
        {
            Files = [request.Files[0], new() { RelativePath = "no-folder.md", Title = "Invalid", Content = "Body" }],
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync(endpoint, invalid)).StatusCode);
        Assert.Empty((await owner.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!);

        var response = await owner.PostAsJsonAsync(endpoint, request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var imported = await response.Content.ReadFromJsonAsync<ImportedMarkdownFile[]>();
        Assert.NotNull(imported);
        Assert.Equal(4, imported.Length);
        Assert.All(imported, item => Assert.False(item.Skipped));

        var posts = await owner.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts");
        Assert.NotNull(posts);
        Assert.Equal(
            ["existing-network", "existing-network"],
            posts.Where(post => post.CategoryName == "Network").Select(post => post.CategorySlug));
        Assert.Contains(posts, post => post.Title == "Root" && post.CategoryName == "posts");
        Assert.Contains(posts, post => post.Title == "소개" && post.CategoryName == "한글");
        Assert.All(posts, post => Assert.Equal(PostVisibility.Private, post.Visibility));
        var importedCategories = (await owner.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!;
        Assert.True(Assert.Single(importedCategories, item => item.Name == "Network").IsVisible);
        Assert.All(importedCategories.Where(item => item.Name != "Network"), category =>
        {
            Assert.False(category.IsVisible);
            Assert.False(category.IsLocallyVisible);
        });
        Assert.Equal("Network", Assert.Single((await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!).Name);
        Assert.Empty((await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!);
        var first = await owner.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{imported[0].PostNumber}");
        Assert.Equal(new DateTime(2025, 12, 27, 0, 0, 0, DateTimeKind.Utc), first!.CreatedAtUtc);

        var retry = await owner.PostAsJsonAsync(endpoint, request);
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        var skipped = await retry.Content.ReadFromJsonAsync<ImportedMarkdownFile[]>();
        Assert.NotNull(skipped);
        Assert.Equal(imported.Select(item => item.PostNumber), skipped.Select(item => item.PostNumber));
        Assert.All(skipped, item => Assert.True(item.Skipped));

        var publicImport = await owner.PostAsJsonAsync(endpoint, new ImportMarkdownRequest
        {
            Files = [new() { RelativePath = "posts/Published/intro.md", Title = "Intro", Content = "# Intro" }],
            Visibility = PostVisibility.Public,
        });
        Assert.Equal(HttpStatusCode.OK, publicImport.StatusCode);
        Assert.Contains((await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!, item => item.Name == "Published");
        Assert.Equal(PostVisibility.Public, Assert.Single((await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!).Visibility);
    }
}
