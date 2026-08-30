using System.ComponentModel.DataAnnotations;

namespace Blog.Api.Setup;

public sealed class CreateOwnerRequest
{
    [Required]
    [StringLength(256)]
    public string SetupCode { get; init; } = string.Empty;

    [Required]
    [StringLength(64, MinimumLength = 3)]
    [RegularExpression("^[a-zA-Z0-9._-]+$")]
    public string Username { get; init; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 8)]
    public string Password { get; init; } = string.Empty;
}
