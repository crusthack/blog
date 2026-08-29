using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blog.Api.Setup;

public sealed class DevelopmentOwnerInitializer(
    BlogDbContext db,
    UserManager<ApplicationUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    IOptions<DevelopmentOwnerOptions> options,
    ILogger<DevelopmentOwnerInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        if (!options.Value.Enabled) return;

        var configured = options.Value;
        var role = await roleManager.FindByNameAsync(Roles.Owner);
        if (role is null)
        {
            role = new IdentityRole<Guid>(Roles.Owner);
            EnsureSucceeded(await roleManager.CreateAsync(role), "create the Owner role");
        }

        var owners = await userManager.GetUsersInRoleAsync(Roles.Owner);
        var owner = owners.SingleOrDefault();
        if (owner is null)
        {
            owner = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = configured.Username,
                Email = configured.Email,
                EmailConfirmed = true,
            };
            EnsureSucceeded(
                await userManager.CreateAsync(owner, configured.Password),
                "create the development Owner");
            EnsureSucceeded(
                await userManager.AddToRoleAsync(owner, Roles.Owner),
                "assign the development Owner role");
        }
        else
        {
            var passwordMatches = owner.PasswordHash is not null &&
                userManager.PasswordHasher.VerifyHashedPassword(
                    owner,
                    owner.PasswordHash,
                    configured.Password) != PasswordVerificationResult.Failed;
            var requiresUpdate =
                owner.UserName != configured.Username ||
                owner.Email != configured.Email ||
                !owner.EmailConfirmed ||
                !passwordMatches ||
                owner.AccessFailedCount != 0 ||
                owner.LockoutEnd is not null;

            if (requiresUpdate)
            {
                owner.UserName = configured.Username;
                owner.Email = configured.Email;
                owner.EmailConfirmed = true;
                owner.AccessFailedCount = 0;
                owner.LockoutEnd = null;
                if (!passwordMatches)
                {
                    owner.PasswordHash = userManager.PasswordHasher.HashPassword(
                        owner,
                        configured.Password);
                    owner.SecurityStamp = Guid.NewGuid().ToString();
                }
                EnsureSucceeded(
                    await userManager.UpdateAsync(owner),
                    "synchronize the development Owner");
            }
        }

        var installation = await db.SiteInstallations
            .SingleAsync(item => item.Id == SiteInstallation.SingletonId, cancellationToken);
        installation.IsInitialized = true;
        installation.IsInitializationInProgress = false;
        installation.OwnerUserId = owner.Id;
        installation.InitializedAtUtc ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Development Owner '{Username}' is ready.",
            configured.Username);
    }

    private static void EnsureSucceeded(IdentityResult result, string operation)
    {
        if (result.Succeeded) return;

        throw new InvalidOperationException(
            $"Failed to {operation}: {string.Join(" ", result.Errors.Select(error => error.Description))}");
    }
}
