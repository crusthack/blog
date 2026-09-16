using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Controllers;
using Blog.Api.Data;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Blog.Api.Tests;

public sealed class CommunityFlowTests
{
    private const string Password = "community-test-password";
    private static HttpClient Client(SetupApiFactory factory) => factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    private static async Task<HttpClient> Owner(SetupApiFactory factory)
    {
        var client = Client(factory);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/setup/owner", new CreateOwnerRequest { SetupCode = SetupApiFactory.SetupCode, Username = "owner", Password = Password })).StatusCode);
        await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "owner", Password = Password }); return client;
    }
    private static async Task<HttpClient> Member(SetupApiFactory factory, HttpClient owner, string name = "member")
    {
        var invite = await owner.PostAsync("/api/community/invites", null);
        var code = (await invite.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;
        var client = Client(factory);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/community/join", new JoinCommunityRequest { Username = name, Password = Password, InviteCode = code })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/community/join", new JoinCommunityRequest { Username = name + "again", Password = Password, InviteCode = code })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = name, Password = Password })).StatusCode);
        return client;
    }
    private static async Task<PostDetailResponse> Post(HttpClient client, string visibility = "Public", string title = "Community post")
    {
        var response = await client.PostAsJsonAsync("/api/posts", new CreatePostRequest { Title = title, Content = "# Markdown\n\nContent", Visibility = visibility, AccessCode = visibility == "CodeProtected" ? "secret-code" : null });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return (await response.Content.ReadFromJsonAsync<PostDetailResponse>())!;
    }
    private static string Root(PostDetailResponse post) => $"/api/posts/{post.PostNumber}/community";

    [Fact]
    public async Task Directory_sorts_by_actual_dates_and_supports_both_directions()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var visitor = Client(factory);
        var first = await Post(owner, title: "Alpha"); var second = await Post(owner, title: "Beta"); var third = await Post(owner, title: "Gamma");
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>();
        var day = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        await db.Posts.Where(p => p.PostNumber == first.PostNumber).ExecuteUpdateAsync(set => set
            .SetProperty(p => p.CreatedAtUtc, day.AddDays(2)).SetProperty(p => p.UpdatedAtUtc, day.AddDays(3)).SetProperty(p => p.Priority, 10));
        await db.Posts.Where(p => p.PostNumber == second.PostNumber).ExecuteUpdateAsync(set => set
            .SetProperty(p => p.CreatedAtUtc, day).SetProperty(p => p.UpdatedAtUtc, day.AddDays(5)).SetProperty(p => p.Priority, 20));
        await db.Posts.Where(p => p.PostNumber == third.PostNumber).ExecuteUpdateAsync(set => set
            .SetProperty(p => p.CreatedAtUtc, day.AddDays(1)).SetProperty(p => p.UpdatedAtUtc, day.AddDays(4)).SetProperty(p => p.Priority, 10));
        async Task<long[]> Numbers(string query)
        {
            var data = await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory" + query);
            return data.GetProperty("items").EnumerateArray().Select(item => item.GetProperty("postNumber").GetInt64()).ToArray();
        }
        Assert.Equal(new[] { second.PostNumber, first.PostNumber, third.PostNumber }, await Numbers(""));
        Assert.Equal(new[] { first.PostNumber, third.PostNumber, second.PostNumber }, await Numbers("?sort=priority&direction=asc"));
        Assert.Equal(new[] { first.PostNumber, third.PostNumber, second.PostNumber }, await Numbers("?sort=created&direction=desc"));
        Assert.Equal(new[] { second.PostNumber, third.PostNumber, first.PostNumber }, await Numbers("?sort=created&direction=asc"));
        Assert.Equal(new[] { second.PostNumber, third.PostNumber, first.PostNumber }, await Numbers("?sort=updated&direction=desc"));
        Assert.Equal(new[] { first.PostNumber, third.PostNumber, second.PostNumber }, await Numbers("?sort=updated&direction=asc"));
        Assert.Equal(new[] { first.PostNumber, second.PostNumber, third.PostNumber }, await Numbers("?sort=title&direction=asc"));
        Assert.Equal(new[] { third.PostNumber, second.PostNumber, first.PostNumber }, await Numbers("?sort=title&direction=desc"));
        Assert.Equal(await Numbers("?sort=created&direction=desc"), await Numbers("?sort=newest"));
        Assert.Equal(await Numbers("?sort=created&direction=asc"), await Numbers("?sort=oldest"));
        Assert.Equal(HttpStatusCode.BadRequest, (await visitor.GetAsync("/api/posts/directory?direction=invalid")).StatusCode);
    }

    [Fact]
    public async Task Post_priority_is_owner_only_validated_and_conflict_safe()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory);
        using var member = await Member(factory, owner); using var visitor = Client(factory);
        var post = await Post(member);
        var path = $"/api/posts/{post.PostNumber}/priority";
        var request = new { priority = 100, expectedRevision = post.Revision };
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.PutAsJsonAsync(path, request)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PutAsJsonAsync(path, request)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(path, new { priority = -1, expectedRevision = post.Revision })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(path, new { priority = 10001, expectedRevision = post.Revision })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync(path, new { priority = 100 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync(path, request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await owner.PutAsJsonAsync(path, request)).StatusCode);
        var after = await owner.GetFromJsonAsync<PostDetailResponse>($"/api/posts/{post.PostNumber}");
        Assert.Equal(post.Revision + 1, after!.Revision);
        Assert.Equal(post.UpdatedAtUtc, after.UpdatedAtUtc);
        Assert.Equal(post.Content, after.Content);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        Assert.Equal(HttpStatusCode.NotFound, (await owner.PutAsJsonAsync(path, new { priority = 10, expectedRevision = after.Revision + 1 })).StatusCode);
    }

    [Fact]
    public async Task Admin_overview_is_owner_only_and_counts_active_and_deleted_content_separately()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var member = await Member(factory, owner); using var visitor = Client(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync("/api/admin/overview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/admin/overview")).StatusCode);
        var active = await Post(owner); var trashed = await Post(member);
        await owner.DeleteAsync($"/api/posts/{trashed.PostNumber}");
        await member.PostAsJsonAsync(Root(active) + "/comments", new { content = "Overview comment" });
        await member.PostAsJsonAsync(Root(active) + "/reports", new { reason = "Review for overview" });
        var response = await owner.GetAsync("/api/admin/overview");
        Assert.True(response.Headers.CacheControl?.NoStore);
        var data = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, data.GetProperty("posts").GetInt32()); Assert.Equal(1, data.GetProperty("trash").GetInt32());
        Assert.Equal(2, data.GetProperty("members").GetInt32()); Assert.Equal(1, data.GetProperty("comments").GetInt32());
        Assert.Equal(1, data.GetProperty("reports").GetInt32()); Assert.Equal(0, data.GetProperty("assets").GetInt32());
        Assert.Equal(active.PostNumber, Assert.Single(data.GetProperty("recentPosts").EnumerateArray()).GetProperty("postNumber").GetInt64());
        Assert.EndsWith("Z", data.GetProperty("checkedAtUtc").GetString());
    }

    [Fact]
    public async Task Invitations_can_be_revoked_expire_and_survive_failed_registration()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var visitor = Client(factory);
        async Task<JsonElement> Invite() => (await (await owner.PostAsync("/api/community/invites", null)).Content.ReadFromJsonAsync<JsonElement>());
        Task<HttpResponseMessage> Join(JsonElement invitation, string name) => visitor.PostAsJsonAsync("/api/community/join", new { username = name, password = Password, inviteCode = invitation.GetProperty("code").GetString() });
        var revoked = await Invite();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/community/invites/{revoked.GetProperty("id").GetGuid()}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Join(revoked, "revoked")).StatusCode);
        var expired = await Invite();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>(); var id = expired.GetProperty("id").GetGuid();
            await db.CommunityInvites.Where(item => item.Id == id).ExecuteUpdateAsync(update => update.SetProperty(item => item.ExpiresAtUtc, DateTime.UtcNow.AddDays(-1)));
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await Join(expired, "expired")).StatusCode);
        var reusable = await Invite();
        Assert.Equal(HttpStatusCode.BadRequest, (await Join(reusable, "owner")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await Join(reusable, "joined")).StatusCode);
        Assert.Empty((await owner.GetFromJsonAsync<JsonElement>("/api/community/invites")).GetProperty("items").EnumerateArray());
        var members = (await owner.GetFromJsonAsync<JsonElement>("/api/community/members")).GetProperty("items").EnumerateArray();
        Assert.True(members.Single(item => item.GetProperty("userName").GetString() == "owner").GetProperty("isOwner").GetBoolean());
    }

    [Fact]
    public async Task Invited_members_manage_only_their_own_posts_and_edits_detect_conflicts()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var member = await Member(factory, owner); using var visitor = Client(factory);
        var post = await Post(member, "Private");
        Assert.True(post.CanEdit); Assert.NotEqual(Guid.Empty, post.AuthorId);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        var other = await Post(owner);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync($"/api/posts/{other.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync($"/api/posts/{other.PostNumber}/assets")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PostAsync("/api/community/invites", null)).StatusCode);
        var update = new UpdatePostRequest { Title = "Updated", Content = "# Changed", ExpectedRevision = post.Revision };
        Assert.Equal(HttpStatusCode.OK, (await member.PutAsJsonAsync($"/api/posts/{post.PostNumber}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await member.PutAsJsonAsync($"/api/posts/{post.PostNumber}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PutAsJsonAsync($"/api/posts/{other.PostNumber}", update)).StatusCode);
        using var form = new MultipartFormDataContent(); form.Add(new StringContent("attachment"), "name"); form.Add(new ByteArrayContent(System.Text.Encoding.ASCII.GetBytes("%PDF-1.4\nminimal\n%%EOF")), "file", "test.pdf");
        Assert.Equal(HttpStatusCode.Created, (await member.PostAsync($"/api/posts/{post.PostNumber}/assets", form)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.DeleteAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/posts/trash")).StatusCode);
    }

    [Fact]
    public async Task Comments_replies_bookmarks_and_reports_follow_content_access()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var member = await Member(factory, owner); using var visitor = Client(factory);
        var post = await Post(owner, "CodeProtected"); var root = Root(post);
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await member.PostAsJsonAsync(root + "/comments", new { content = "Blocked" })).StatusCode);
        await member.PostAsJsonAsync($"/api/posts/{post.PostNumber}/unlock", new UnlockPostRequest { Code = "secret-code" });
        var response = await member.PostAsJsonAsync(root + "/comments", new { content = "**Markdown** comment" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); var id = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync(root + "/comments", new { content = "Reply", parentId = id })).StatusCode);
        var discussion = await member.GetFromJsonAsync<JsonElement>(root);
        Assert.Equal(2, discussion.GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.PutAsJsonAsync(root + $"/comments/{id}", new { content = "Other edit", expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await member.PutAsJsonAsync(root + $"/comments/{id}", new { content = "Edited", expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await member.PutAsJsonAsync(root + $"/comments/{id}", new { content = "Stale", expectedRevision = 1 })).StatusCode);
        await member.PutAsync(root + "/bookmark", null); await member.PutAsync(root + "/bookmark", null);
        Assert.Equal(1, (await member.GetFromJsonAsync<JsonElement>("/api/posts/directory?bookmarked=true")).GetProperty("total").GetInt32());
        Assert.Equal(0, (await owner.GetFromJsonAsync<JsonElement>("/api/posts/directory?bookmarked=true")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.Created, (await member.PostAsJsonAsync(root + "/reports", new { reason = "Please review this comment", commentId = id })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await member.PostAsJsonAsync(root + "/reports", new { reason = "Duplicate report", commentId = id })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.GetAsync("/api/community/reports")).StatusCode);
        var reports = await owner.GetFromJsonAsync<JsonElement>("/api/community/reports"); var reportId = reports.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync($"/api/community/reports/{reportId}", new { resolution = "Reviewed and removed", hideContent = true })).StatusCode);
        var moderated = await member.GetFromJsonAsync<JsonElement>(root);
        Assert.Equal("", moderated.GetProperty("items")[0].GetProperty("content").GetString());
        Assert.Equal(2, moderated.GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(root)).StatusCode);
        await owner.DeleteAsync($"/api/posts/{post.PostNumber}");
        Assert.Equal(HttpStatusCode.NotFound, (await member.GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/posts/{post.PostNumber}/permanent")).StatusCode);
        using var scope = factory.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<BlogDbContext>();
        Assert.Equal(0, await db.PostComments.CountAsync()); Assert.Equal(0, await db.PostBookmarks.CountAsync()); Assert.Equal(0, await db.ContentReports.CountAsync());
        Assert.True(await db.AuditEvents.AnyAsync(item => item.Action == "report.hide"));
    }

    [Fact]
    public async Task Suspension_blocks_existing_sessions_and_owner_cannot_be_suspended()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var member = await Member(factory, owner);
        var me = await member.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me"); var admin = await owner.GetFromJsonAsync<CurrentUserResponse>("/api/auth/me");
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync($"/api/community/members/{admin!.Id}/suspension", new { suspended = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync($"/api/community/members/{me!.Id}/suspension", new { suspended = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await member.GetAsync("/api/auth/me")).StatusCode);
        using var newSession = Client(factory);
        Assert.Equal(HttpStatusCode.Unauthorized, (await newSession.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "member", Password = Password })).StatusCode);
        await owner.PutAsJsonAsync($"/api/community/members/{me.Id}/suspension", new { suspended = false });
        Assert.Equal(HttpStatusCode.Unauthorized, (await member.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await member.PostAsJsonAsync("/api/auth/login", new LoginRequest { Username = "member", Password = Password })).StatusCode);
        using var forged = new HttpRequestMessage(HttpMethod.Post, "/api/community/invites"); forged.Headers.Add("Sec-Fetch-Site", "cross-site");
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.SendAsync(forged)).StatusCode);
    }

    [Fact]
    public async Task Directory_paginates_stably_and_search_never_exposes_private_posts()
    {
        using var factory = new SetupApiFactory(); using var owner = await Owner(factory); using var visitor = Client(factory);
        for (var i = 0; i < 21; i++) await Post(owner, title: $"Topic {i:00}");
        await Post(owner, "Private", "Hidden Topic"); await Post(owner, title: "Literal 100% value");
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/posts/1/priority", new { priority = 100, expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/posts/2/priority", new { priority = 100, expectedRevision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/posts/22/priority", new { priority = 10000, expectedRevision = 1 })).StatusCode);
        var first = await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory"); var second = await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory?page=2");
        Assert.Equal(22, first.GetProperty("total").GetInt32()); Assert.Equal(20, first.GetProperty("items").GetArrayLength()); Assert.Equal(2, second.GetProperty("items").GetArrayLength());
        var ids = first.GetProperty("items").EnumerateArray().Concat(second.GetProperty("items").EnumerateArray()).Select(item => item.GetProperty("postNumber").GetInt64()).ToArray();
        Assert.Equal(ids.Length, ids.Distinct().Count());
        Assert.Equal(2, ids[0]); Assert.Equal(1, ids[1]); Assert.DoesNotContain(22L, ids);
        var newest = await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory?sort=newest");
        Assert.Equal(23, newest.GetProperty("items")[0].GetProperty("postNumber").GetInt64());
        var category = await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory?category=uncategorized&query=Topic");
        Assert.Equal(2, category.GetProperty("items")[0].GetProperty("postNumber").GetInt64());
        Assert.Equal(0, (await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory?query=Hidden")).GetProperty("total").GetInt32());
        Assert.Equal(1, (await visitor.GetFromJsonAsync<JsonElement>("/api/posts/directory?query=%25")).GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await visitor.GetAsync("/api/posts/directory?page=0")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync("/api/posts/directory?mine=true")).StatusCode);
    }
}
