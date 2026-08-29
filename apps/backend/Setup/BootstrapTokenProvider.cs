using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;

namespace Blog.Api.Setup;

public sealed class BootstrapTokenProvider(
    IOptions<BootstrapOptions> options,
    IWebHostEnvironment environment,
    ILogger<BootstrapTokenProvider> logger)
{
    private const int MinimumTokenBytes = 32;

    public async Task<bool> IsConfiguredAsync(CancellationToken cancellationToken)
    {
        var configuredToken = await ReadConfiguredTokenAsync(cancellationToken);
        if (configuredToken is null) return false;

        CryptographicOperations.ZeroMemory(configuredToken);
        return true;
    }

    public async Task<bool> ValidateAsync(string suppliedToken, CancellationToken cancellationToken)
    {
        var configuredToken = await ReadConfiguredTokenAsync(cancellationToken);
        if (configuredToken is null) return false;

        var suppliedBytes = Encoding.UTF8.GetBytes(suppliedToken.Trim());
        var expectedHash = SHA256.HashData(configuredToken);
        var suppliedHash = SHA256.HashData(suppliedBytes);

        try
        {
            return CryptographicOperations.FixedTimeEquals(expectedHash, suppliedHash);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(configuredToken);
            CryptographicOperations.ZeroMemory(suppliedBytes);
            CryptographicOperations.ZeroMemory(expectedHash);
            CryptographicOperations.ZeroMemory(suppliedHash);
        }
    }

    private async Task<byte[]?> ReadConfiguredTokenAsync(CancellationToken cancellationToken)
    {
        var configuredPath = options.Value.TokenFile.Trim();
        if (configuredPath.Length == 0) return null;

        var tokenPath = Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.GetFullPath(configuredPath, environment.ContentRootPath);

        try
        {
            var value = (await File.ReadAllTextAsync(tokenPath, cancellationToken)).Trim();
            var bytes = Encoding.UTF8.GetBytes(value);
            if (bytes.Length >= MinimumTokenBytes) return bytes;

            CryptographicOperations.ZeroMemory(bytes);
            logger.LogWarning("The configured Owner setup token is shorter than {MinimumTokenBytes} bytes.", MinimumTokenBytes);
            return null;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("The Owner setup token file could not be read.");
            return null;
        }
    }
}
