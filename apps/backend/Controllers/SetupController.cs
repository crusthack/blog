using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/setup")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class SetupController(OwnerSetupService setupService) : ControllerBase
{
    [HttpGet("status")]
    [ProducesResponseType<SetupStatusResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SetupStatusResponse>> GetStatus(CancellationToken cancellationToken) =>
        Ok(await setupService.GetStatusAsync(cancellationToken));

    [HttpPost("owner")]
    [EnableRateLimiting("owner-setup")]
    [ProducesResponseType<OwnerResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult<OwnerResponse>> CreateOwner(
        CreateOwnerRequest request,
        CancellationToken cancellationToken)
    {
        var result = await setupService.CreateOwnerAsync(request, cancellationToken);

        return result.Status switch
        {
            CreateOwnerStatus.Created => StatusCode(StatusCodes.Status201Created, result.Owner),
            CreateOwnerStatus.AlreadyInitialized => Conflict(new ProblemDetails
            {
                Title = "Site setup is already complete.",
                Status = StatusCodes.Status409Conflict,
            }),
            CreateOwnerStatus.BootstrapNotConfigured => StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                new ProblemDetails
                {
                    Title = "Owner setup is not configured.",
                    Detail = "Configure a bootstrap token file before creating the Owner account.",
                    Status = StatusCodes.Status503ServiceUnavailable,
                }),
            CreateOwnerStatus.InvalidSetupCode => Unauthorized(new ProblemDetails
            {
                Title = "The setup code is invalid.",
                Status = StatusCodes.Status401Unauthorized,
            }),
            CreateOwnerStatus.ValidationFailed => BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]>
                {
                    ["owner"] = result.Errors?.ToArray() ?? ["Owner creation failed."],
                })),
            _ => throw new InvalidOperationException("Unknown Owner setup result."),
        };
    }
}
