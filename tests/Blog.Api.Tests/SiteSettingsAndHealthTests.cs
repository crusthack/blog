using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class SiteSettingsAndHealthTests
{
    private const string OwnerPassword = "correct horse battery staple";

    [Fact]
    public async Task External_links_return_defaults_but_an_explicit_empty_list_stays_empty()
    {
        using var factory = new SetupApiFactory();
        var options = ClientOptions();
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);

        var defaults = await visitor.GetFromJsonAsync<ExternalLinkPayload[]>(
            "/api/site-settings/external-links");
        Assert.NotNull(defaults);
        Assert.NotEmpty(defaults);
        Assert.All(defaults, link => Assert.True(link.IsVisible));
        Assert.Equal(
            defaults.OrderBy(link => link.SortOrder).ThenBy(link => link.Name),
            defaults);

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await visitor.GetAsync("/api/site-settings/external-links/manage")).StatusCode);
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await visitor.PutAsJsonAsync(
                "/api/site-settings/external-links",
                new SaveExternalLinksPayload([]))).StatusCode);

        await CreateAndLoginOwnerAsync(owner, "settings-empty-owner");
        var managedDefaults = await owner.GetFromJsonAsync<ExternalLinkPayload[]>(
            "/api/site-settings/external-links/manage");
        Assert.Equal(defaults, managedDefaults);

        var update = await owner.PutAsJsonAsync(
            "/api/site-settings/external-links",
            new SaveExternalLinksPayload([]));
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        Assert.Empty((await update.Content.ReadFromJsonAsync<ExternalLinkPayload[]>())!);
        Assert.Empty((await visitor.GetFromJsonAsync<ExternalLinkPayload[]>(
            "/api/site-settings/external-links"))!);
        Assert.Empty((await owner.GetFromJsonAsync<ExternalLinkPayload[]>(
            "/api/site-settings/external-links/manage"))!);
    }

    [Fact]
    public async Task Owner_can_save_normalized_links_while_public_reads_hide_invisible_links()
    {
        using var factory = new SetupApiFactory();
        var options = ClientOptions();
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);
        await CreateAndLoginOwnerAsync(owner, "settings-owner");

        var request = new SaveExternalLinksPayload(
        [
            new("Beta", "https://example.net/path", 10, true),
            new("Hidden", "https://example.org", 0, false),
            new("  Alpha  ", "  https://example.com  ", 0, true),
        ]);
        var update = await owner.PutAsJsonAsync("/api/site-settings/external-links", request);
        Assert.Equal(HttpStatusCode.OK, update.StatusCode);
        var saved = Assert.IsType<ExternalLinkPayload[]>(
            await update.Content.ReadFromJsonAsync<ExternalLinkPayload[]>());
        Assert.Equal(["Alpha", "Hidden", "Beta"], saved.Select(link => link.Name));
        Assert.Equal("https://example.com/", saved[0].Url);

        var managed = Assert.IsType<ExternalLinkPayload[]>(
            await owner.GetFromJsonAsync<ExternalLinkPayload[]>(
                "/api/site-settings/external-links/manage"));
        Assert.Equal(saved, managed);

        var publicLinks = Assert.IsType<ExternalLinkPayload[]>(
            await visitor.GetFromJsonAsync<ExternalLinkPayload[]>(
                "/api/site-settings/external-links"));
        Assert.Equal(["Alpha", "Beta"], publicLinks.Select(link => link.Name));
        Assert.All(publicLinks, link => Assert.True(link.IsVisible));
    }

    [Fact]
    public async Task Invalid_external_link_sets_are_rejected_without_replacing_defaults()
    {
        using var factory = new SetupApiFactory();
        using var owner = factory.CreateClient(ClientOptions());
        await CreateAndLoginOwnerAsync(owner, "settings-validation-owner");

        var invalidRequests = new SaveExternalLinksPayload[]
        {
            new([new(" ", "https://example.com", 0, true)]),
            new([new(new string('n', 41), "https://example.com", 0, true)]),
            new([new("Unsafe", "javascript:alert(1)", 0, true)]),
            new([new("Wrong scheme", "ftp://example.com/file", 0, true)]),
            new([new("Too long URL", $"https://example.com/{new string('a', 2048)}", 0, true)]),
            new([new("Negative order", "https://example.com", -1, true)]),
            new([new("Large order", "https://example.com", 10_001, true)]),
            new(Enumerable.Range(0, 21)
                .Select(index => new ExternalLinkPayload(
                    $"Link {index}", $"https://example.com/{index}", index, true))
                .ToArray()),
        };

        foreach (var request in invalidRequests)
        {
            using var response = await owner.PutAsJsonAsync(
                "/api/site-settings/external-links",
                request);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        var defaults = await owner.GetFromJsonAsync<ExternalLinkPayload[]>(
            "/api/site-settings/external-links/manage");
        Assert.NotEmpty(defaults!);
    }

    [Fact]
    public async Task Health_reports_api_database_provider_and_check_time()
    {
        using var factory = new SetupApiFactory();
        using var client = factory.CreateClient();
        var before = DateTime.UtcNow.AddSeconds(-1);

        using var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var health = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Healthy", health.GetProperty("status").GetString());
        Assert.Equal("Healthy", health.GetProperty("api").GetProperty("status").GetString());
        Assert.Equal("SQLite", health.GetProperty("database").GetProperty("provider").GetString());
        Assert.Equal("Healthy", health.GetProperty("database").GetProperty("status").GetString());
        Assert.True(health.GetProperty("checkedAtUtc").TryGetDateTime(out var checkedAtUtc));
        Assert.InRange(checkedAtUtc, before, DateTime.UtcNow.AddSeconds(1));
    }

    private static WebApplicationFactoryClientOptions ClientOptions() => new()
    {
        BaseAddress = new Uri("https://localhost"),
    };

    private static async Task CreateAndLoginOwnerAsync(HttpClient client, string username)
    {
        Assert.Equal(
            HttpStatusCode.Created,
            (await client.PostAsJsonAsync(
                "/api/setup/owner",
                new CreateOwnerRequest
                {
                    SetupCode = SetupApiFactory.SetupCode,
                    Username = username,
                    Password = OwnerPassword,
                })).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await client.PostAsJsonAsync(
                "/api/auth/login",
                new LoginRequest
                {
                    Username = username,
                    Password = OwnerPassword,
                })).StatusCode);
    }

    private sealed record SaveExternalLinksPayload(IReadOnlyList<ExternalLinkPayload> Links);

    private sealed record ExternalLinkPayload(
        string Name,
        string Url,
        int SortOrder,
        bool IsVisible);
}
