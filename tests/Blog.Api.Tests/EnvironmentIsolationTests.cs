using Blog.Api.Setup;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Blog.Api.Tests;

public sealed class EnvironmentIsolationTests
{
    [Fact]
    public void Non_development_environment_does_not_register_development_owner()
    {
        using var factory = new SetupApiFactory();
        using var client = factory.CreateClient();

        Assert.Null(factory.Services.GetService<DevelopmentOwnerInitializer>());
    }

    [Fact]
    public void Production_rejects_development_owner_configuration()
    {
        using var factory = new WebApplicationFactory<Program>()
            .WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Production");
                builder.UseSetting("DevelopmentOwner:Enabled", "true");
                builder.UseSetting("DevelopmentOwner:Username", "must-not-run");
                builder.UseSetting("DevelopmentOwner:Email", "must-not-run@example.invalid");
                builder.UseSetting("DevelopmentOwner:Password", "password");
            });

        var exception = Assert.ThrowsAny<Exception>(() => _ = factory.Server);

        Assert.Contains(
            "DevelopmentOwner configuration is forbidden outside the Development environment.",
            exception.ToString());
    }
}
