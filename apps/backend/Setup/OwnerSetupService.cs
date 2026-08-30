using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Blog.Api.Setup;

public sealed class OwnerSetupService(
    BlogDbContext db,
    UserManager<ApplicationUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    BootstrapTokenProvider tokenProvider)
{
    public async Task<SetupStatusResponse> GetStatusAsync(CancellationToken cancellationToken)
    {
        var isInitialized = await db.SiteInstallations
            .Where(installation => installation.Id == SiteInstallation.SingletonId)
            .Select(installation => installation.IsInitialized)
            .SingleAsync(cancellationToken);

        return new SetupStatusResponse(
            RequiresSetup: !isInitialized,
            SetupCodeConfigured: !isInitialized && await tokenProvider.IsConfiguredAsync(cancellationToken));
    }

    public async Task<CreateOwnerResult> CreateOwnerAsync(
        CreateOwnerRequest request,
        CancellationToken cancellationToken)
    {
        if (!await tokenProvider.IsConfiguredAsync(cancellationToken))
            return CreateOwnerResult.BootstrapNotConfigured();

        if (!await tokenProvider.ValidateAsync(request.SetupCode, cancellationToken))
            return CreateOwnerResult.InvalidSetupCode();

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        var claimed = await db.SiteInstallations
            .Where(installation =>
                installation.Id == SiteInstallation.SingletonId &&
                !installation.IsInitialized &&
                !installation.IsInitializationInProgress)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(
                    installation => installation.IsInitializationInProgress,
                    true),
                cancellationToken);

        if (claimed == 0)
            return CreateOwnerResult.AlreadyInitialized();

        var role = await roleManager.FindByNameAsync(Roles.Owner);
        if (role is null)
        {
            role = new IdentityRole<Guid>(Roles.Owner);
            var roleResult = await roleManager.CreateAsync(role);
            if (!roleResult.Succeeded)
                return CreateOwnerResult.ValidationFailed(roleResult.Errors.Select(error => error.Description));
        }

        var owner = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Username.Trim(),
        };

        var createResult = await userManager.CreateAsync(owner, request.Password);
        if (!createResult.Succeeded)
            return CreateOwnerResult.ValidationFailed(createResult.Errors.Select(error => error.Description));

        var roleAssignment = await userManager.AddToRoleAsync(owner, Roles.Owner);
        if (!roleAssignment.Succeeded)
            return CreateOwnerResult.ValidationFailed(roleAssignment.Errors.Select(error => error.Description));

        var installation = await db.SiteInstallations
            .SingleAsync(item => item.Id == SiteInstallation.SingletonId, cancellationToken);
        installation.IsInitialized = true;
        installation.IsInitializationInProgress = false;
        installation.OwnerUserId = owner.Id;
        installation.InitializedAtUtc = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return CreateOwnerResult.Created(new OwnerResponse(owner.Id, owner.UserName!));
    }
}

public sealed record SetupStatusResponse(bool RequiresSetup, bool SetupCodeConfigured);

public sealed record OwnerResponse(Guid Id, string Username);

public enum CreateOwnerStatus
{
    Created,
    AlreadyInitialized,
    BootstrapNotConfigured,
    InvalidSetupCode,
    ValidationFailed,
}

public sealed record CreateOwnerResult(
    CreateOwnerStatus Status,
    OwnerResponse? Owner = null,
    IReadOnlyList<string>? Errors = null)
{
    public static CreateOwnerResult Created(OwnerResponse owner) =>
        new(CreateOwnerStatus.Created, owner);

    public static CreateOwnerResult AlreadyInitialized() =>
        new(CreateOwnerStatus.AlreadyInitialized);

    public static CreateOwnerResult BootstrapNotConfigured() =>
        new(CreateOwnerStatus.BootstrapNotConfigured);

    public static CreateOwnerResult InvalidSetupCode() =>
        new(CreateOwnerStatus.InvalidSetupCode);

    public static CreateOwnerResult ValidationFailed(IEnumerable<string> errors) =>
        new(CreateOwnerStatus.ValidationFailed, Errors: errors.ToArray());
}
