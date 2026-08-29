using System.Net;
using System.Net.Http.Json;
using Blog.Api.Auth;
using Blog.Api.Models;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace Blog.Api.Tests;

public sealed class OwnerSetupTests
{
    [Fact]
    public async Task Status_requires_setup_when_token_is_configured()
    {
        using var factory = new SetupApiFactory();
        using var client = factory.CreateClient();

        var status = await client.GetFromJsonAsync<SetupStatusResponse>("/api/setup/status");

        Assert.NotNull(status);
        Assert.True(status.RequiresSetup);
        Assert.True(status.SetupCodeConfigured);
    }

    [Fact]
    public async Task Valid_code_creates_exactly_one_owner_and_closes_setup()
    {
        using var factory = new SetupApiFactory();
        using var client = factory.CreateClient();

        var invalidResponse = await client.PostAsJsonAsync("/api/setup/owner", CreateRequest("invalid-code"));
        Assert.Equal(HttpStatusCode.Unauthorized, invalidResponse.StatusCode);

        var createdResponse = await client.PostAsJsonAsync(
            "/api/setup/owner",
            CreateRequest(SetupApiFactory.SetupCode));
        Assert.Equal(HttpStatusCode.Created, createdResponse.StatusCode);

        var owner = await createdResponse.Content.ReadFromJsonAsync<OwnerResponse>();
        Assert.NotNull(owner);
        Assert.Equal("owner", owner.Username);

        var repeatedResponse = await client.PostAsJsonAsync(
            "/api/setup/owner",
            CreateRequest(SetupApiFactory.SetupCode));
        Assert.Equal(HttpStatusCode.Conflict, repeatedResponse.StatusCode);

        var status = await client.GetFromJsonAsync<SetupStatusResponse>("/api/setup/status");
        Assert.NotNull(status);
        Assert.False(status.RequiresSetup);
        Assert.False(status.SetupCodeConfigured);

        using var scope = factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var owners = await userManager.GetUsersInRoleAsync(Roles.Owner);
        Assert.Single(owners);
    }

    [Fact]
    public async Task Concurrent_requests_cannot_create_two_owners()
    {
        using var factory = new SetupApiFactory();
        using var firstClient = factory.CreateClient();
        using var secondClient = factory.CreateClient();

        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync(
                "/api/setup/owner",
                CreateRequest(SetupApiFactory.SetupCode, "owner-one", "owner-one@example.com")),
            secondClient.PostAsJsonAsync(
                "/api/setup/owner",
                CreateRequest(SetupApiFactory.SetupCode, "owner-two", "owner-two@example.com")));

        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Created);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);

        using var scope = factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var owners = await userManager.GetUsersInRoleAsync(Roles.Owner);
        Assert.Single(owners);
    }

    private static CreateOwnerRequest CreateRequest(
        string setupCode,
        string username = "owner",
        string email = "owner@example.com") =>
        new()
        {
            SetupCode = setupCode,
            Username = username,
            Email = email,
            Password = "passw0rd",
        };
}
