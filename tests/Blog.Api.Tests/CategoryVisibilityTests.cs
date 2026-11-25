using System.Net;
using System.Net.Http.Json;
using Blog.Api.Controllers;
using Blog.Api.Models;
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
        var child = await CreateCategory(owner, "child", category.Id);
        var leaf = await CreateCategory(owner, "leaf", child.Id);
        var sibling = await CreateCategory(owner, "sibling", category.Id);
        Assert.Equal(child.Id, leaf.ParentId);
        Assert.False(leaf.IsVisible);
        Assert.True(leaf.IsLocallyVisible);
        Assert.Empty((await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!);

        Assert.Equal(HttpStatusCode.BadRequest, await SetParent(owner, category.Id, leaf.Id));
        Assert.Equal(HttpStatusCode.Unauthorized, await SetParent(visitor, child.Id, null));

        var postResponse = await owner.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = "Published but hidden",
                Content = "# Hidden",
                CategoryId = leaf.Id,
            });
        Assert.Equal(HttpStatusCode.Created, postResponse.StatusCode);
        var post = Assert.IsType<PostDetailResponse>(
            await postResponse.Content.ReadFromJsonAsync<PostDetailResponse>());
        Assert.Equal(PostVisibility.Public, post.Visibility);
        Assert.True(post.CategoryIsHidden);

        var protectedResponse = await owner.PostAsJsonAsync("/api/posts", new CreatePostRequest
        {
            Title = "Code protected",
            Content = "# Code protected",
            CategoryId = leaf.Id,
            Visibility = PostVisibility.CodeProtected,
            AccessCode = "example-code",
        });
        Assert.Equal(HttpStatusCode.Created, protectedResponse.StatusCode);
        var protectedPost = Assert.IsType<PostDetailResponse>(
            await protectedResponse.Content.ReadFromJsonAsync<PostDetailResponse>());
        Assert.True(protectedPost.CategoryIsHidden);

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.DoesNotContain(
            (await visitor.GetFromJsonAsync<PostSummaryResponse[]>("/api/posts"))!,
            candidate => candidate.PostNumber == post.PostNumber);
        Assert.Equal(
            HttpStatusCode.OK,
            (await owner.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);

        const string directory = "/api/posts/directory?visibility=";
        var privateResults = await owner.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.Private);
        Assert.NotNull(privateResults);
        Assert.Equal(2, privateResults.Items.Length);
        Assert.All(privateResults.Items, item => Assert.True(item.CategoryIsHidden));
        Assert.Empty((await owner.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.Public))!.Items);
        Assert.Empty((await owner.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.CodeProtected))!.Items);
        Assert.Empty((await visitor.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.Private))!.Items);

        var subtreeDirectory = $"/api/posts/directory?visibility=Public&category={category.Slug}&includeDescendants=true";
        Assert.Empty((await visitor.GetFromJsonAsync<DirectoryResult>(subtreeDirectory))!.Items);

        var batch = new[] { child.Id, leaf.Id, sibling.Id };
        Assert.Equal(HttpStatusCode.Unauthorized, await SetParents(visitor, batch, null));
        Assert.Equal(HttpStatusCode.BadRequest, await SetParents(owner, batch, leaf.Id));
        Assert.Equal(HttpStatusCode.NotFound, await SetParents(owner, [child.Id, Guid.NewGuid()], null));
        var unchanged = (await owner.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!;
        Assert.Equal(category.Id, Assert.Single(unchanged, item => item.Id == child.Id).ParentId);
        Assert.Equal(category.Id, Assert.Single(unchanged, item => item.Id == sibling.Id).ParentId);

        Assert.Equal(HttpStatusCode.NoContent, await SetParents(owner, batch, null));
        var movedCategories = (await visitor.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!;
        Assert.Null(Assert.Single(movedCategories, item => item.Id == child.Id).ParentId);
        Assert.Null(Assert.Single(movedCategories, item => item.Id == sibling.Id).ParentId);
        Assert.Contains(movedCategories, item => item.Id == leaf.Id && item.ParentId == child.Id && item.IsVisible);
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, await SetParent(owner, child.Id, category.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, await SetCategoryVisibility(owner, leaf.Id, false, true));
        Assert.Equal(HttpStatusCode.Conflict, await SetPostVisibility(owner, post, PostVisibility.Private));
        Assert.Equal(HttpStatusCode.Unauthorized, await SetCategoryVisibility(visitor, category.Id, true, false));
        Assert.Equal(HttpStatusCode.NoContent, await SetCategoryVisibility(owner, category.Id, true, false));
        Assert.Equal(HttpStatusCode.Conflict, await SetCategoryVisibility(owner, category.Id, true, false));
        var published = Assert.Single((await visitor.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.Public))!.Items);
        Assert.Equal(post.PostNumber, published.PostNumber);
        Assert.False(published.CategoryIsHidden);
        var descendant = Assert.Single((await visitor.GetFromJsonAsync<DirectoryResult>(subtreeDirectory))!.Items);
        Assert.Equal(post.PostNumber, descendant.PostNumber);
        Assert.Empty((await visitor.GetFromJsonAsync<DirectoryResult>($"/api/posts/directory?category={category.Slug}"))!.Items);
        var codeProtected = Assert.Single((await visitor.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.CodeProtected))!.Items);
        Assert.Equal(protectedPost.PostNumber, codeProtected.PostNumber);
        Assert.False(codeProtected.CategoryIsHidden);
        Assert.Empty((await owner.GetFromJsonAsync<DirectoryResult>(directory + PostVisibility.Private))!.Items);

        Assert.Equal(HttpStatusCode.Unauthorized, await SetPostVisibility(visitor, post, PostVisibility.Private));
        Assert.Equal(HttpStatusCode.Conflict, await SetPostVisibility(owner, protectedPost, PostVisibility.Public));
        Assert.Equal(HttpStatusCode.OK, await SetPostVisibility(owner, post, PostVisibility.Private));
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, await SetPostVisibility(owner, post, PostVisibility.Public));
        var privatePost = (await owner.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}"))!;
        Assert.Equal(post.Content, privatePost.Content);
        Assert.Equal(post.CategoryId, privatePost.CategoryId);
        Assert.Equal(HttpStatusCode.OK, await SetPostVisibility(owner, privatePost, PostVisibility.Public));
        Assert.Equal(HttpStatusCode.OK, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.DeleteAsync($"/api/categories/{category.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/categories/{category.Id}")).StatusCode);
        var remaining = Assert.Single((await owner.GetFromJsonAsync<CategoryResponse[]>("/api/categories"))!);
        Assert.Equal(sibling.Id, remaining.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/posts/{protectedPost.PostNumber}")).StatusCode);

        var trash = (await owner.GetFromJsonAsync<TrashItem[]>("/api/posts/trash"))!;
        Assert.Equal(2, trash.Length);
        Assert.Contains(trash, item => item.PostNumber == post.PostNumber);
        Assert.Contains(trash, item => item.PostNumber == protectedPost.PostNumber);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PostAsync($"/api/posts/{post.PostNumber}/restore", null)).StatusCode);
        var restored = await owner.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}");
        Assert.NotNull(restored);
        Assert.Null(restored.CategoryId);
        Assert.Equal(PostVisibility.Private, restored.Visibility);
    }

    private static async Task<CategoryResponse> CreateCategory(HttpClient owner, string slug, Guid parentId)
    {
        var response = await owner.PostAsJsonAsync("/api/categories", new SaveCategoryRequest
        {
            Name = slug,
            Slug = slug,
            ParentId = parentId,
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<CategoryResponse>(await response.Content.ReadFromJsonAsync<CategoryResponse>());
    }

    private static async Task<HttpStatusCode> SetParent(HttpClient client, Guid id, Guid? parentId) =>
        (await client.PutAsJsonAsync($"/api/categories/{id}/parent", new SetCategoryParentRequest { ParentId = parentId })).StatusCode;

    private static async Task<HttpStatusCode> SetParents(HttpClient client, Guid[] ids, Guid? parentId) =>
        (await client.PutAsJsonAsync("/api/categories/parents", new SetCategoryParentsRequest { CategoryIds = ids, ParentId = parentId })).StatusCode;

    private static async Task<HttpStatusCode> SetCategoryVisibility(HttpClient client, Guid id, bool isVisible, bool expected) =>
        (await client.PutAsJsonAsync($"/api/categories/{id}/visibility", new SetCategoryVisibilityRequest
        {
            IsVisible = isVisible,
            ExpectedIsVisible = expected,
        })).StatusCode;

    private static async Task<HttpStatusCode> SetPostVisibility(HttpClient client, PostDetailResponse post, string visibility) =>
        (await client.PutAsJsonAsync($"/api/posts/{post.PostNumber}/visibility", new SetPostVisibilityRequest
        {
            Visibility = visibility,
            ExpectedRevision = post.Revision,
        })).StatusCode;

    private sealed record DirectoryResult(PostSummaryResponse[] Items);
    private sealed record TrashItem(long PostNumber);
}
