namespace Blog.Api.Setup;

public sealed class BootstrapOptions
{
    public const string SectionName = "Bootstrap";

    public string TokenFile { get; set; } = string.Empty;
}
