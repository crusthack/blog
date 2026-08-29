using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace Blog.Api.Setup;

public sealed class DevelopmentOwnerOptions
{
    public const string SectionName = "DevelopmentOwner";

    public bool Enabled { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;

    public bool IsValid() =>
        Username.Length is >= 3 and <= 64 &&
        Regex.IsMatch(Username, "^[a-zA-Z0-9._-]+$") &&
        Email.Length is >= 3 and <= 254 &&
        new EmailAddressAttribute().IsValid(Email) &&
        Password.Length is >= 8 and <= 128 &&
        Password.Distinct().Take(4).Count() == 4;
}
