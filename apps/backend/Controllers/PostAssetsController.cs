using System.ComponentModel.DataAnnotations;
using Blog.Api.Auth;
using Blog.Api.Data;
using Blog.Api.Models;
using Blog.Api.Storage;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/posts/{postNumber:long}/assets")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class PostAssetsController(
    BlogDbContext db,
    PostAssetStorage storage,
    PostAccessService access,
    ILogger<PostAssetsController> logger) : ControllerBase
{
    private const long MaxImageFileSize = 10 * 1024 * 1024;
    private const long MaxPdfFileSize = 25 * 1024 * 1024;
    private const long MaxPixelCount = 40_000_000;

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<PostAssetResponse>>> List(
        long postNumber,
        CancellationToken cancellationToken)
    {
        var postId = await GetPostId(postNumber, cancellationToken);
        if (postId is null) return NotFound();

        var assets = await db.PostAssets
            .AsNoTracking()
            .Where(asset => asset.PostId == postId.Value)
            .OrderBy(asset => asset.Name)
            .Select(asset => ToResponse(postNumber, asset))
            .ToListAsync(cancellationToken);

        return Ok(assets);
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [RequestSizeLimit(MaxPdfFileSize + 64 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxPdfFileSize + 64 * 1024)]
    [HttpPost]
    public async Task<ActionResult<PostAssetResponse>> Upload(
        long postNumber,
        [FromForm] IFormFile file,
        [FromForm] string name,
        CancellationToken cancellationToken)
    {
        var postId = await GetPostId(postNumber, cancellationToken);
        if (postId is null) return NotFound();

        var normalizedName = NormalizeName(name);
        if (normalizedName is null)
            return BadRequestProblem("파일 이름은 1~120자여야 합니다.");
        if (file.Length <= 0)
            return BadRequestProblem("빈 파일은 업로드할 수 없습니다.");

        var suppliedExtension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (suppliedExtension is not ".jpg" and not ".jpeg" and not ".png" and not ".pdf")
            return BadRequestProblem("JPG, PNG 또는 PDF 파일만 업로드할 수 있습니다.");

        var isPdf = suppliedExtension == ".pdf";
        var maximumSize = isPdf ? MaxPdfFileSize : MaxImageFileSize;
        if (file.Length > maximumSize)
            return BadRequestProblem(isPdf ? "PDF는 25MB 이하여야 합니다." : "이미지는 10MB 이하여야 합니다.");

        if (await db.PostAssets.AnyAsync(
                asset => asset.PostId == postId.Value && asset.Name == normalizedName,
                cancellationToken))
        {
            return Conflict(new ProblemDetails
            {
                Title = "이미 사용 중인 첨부 파일 이름입니다.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        await using var input = file.OpenReadStream();
        await using var buffer = new MemoryStream((int)file.Length);
        await input.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length > maximumSize)
            return BadRequestProblem(isPdf ? "PDF는 25MB 이하여야 합니다." : "이미지는 10MB 이하여야 합니다.");

        var uploadedBytes = buffer.ToArray();
        var validation = NormalizeContent(suppliedExtension, uploadedBytes);
        if (!validation.Succeeded)
            return BadRequestProblem(validation.Error!);

        var extension = validation.Extension!;
        var storedBytes = validation.Content!;
        var storageFileName = storage.CreateStorageFileName(extension);
        var asset = new PostAsset
        {
            PostId = postId.Value,
            Name = normalizedName,
            Extension = extension,
            StorageFileName = storageFileName,
            ContentType = extension switch
            {
                ".png" => "image/png",
                ".pdf" => "application/pdf",
                _ => "image/jpeg",
            },
            Size = storedBytes.LongLength,
        };

        try
        {
            await storage.WriteAsync(storageFileName, storedBytes, cancellationToken);
            db.PostAssets.Add(asset);
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            TryDeleteStorageFile(
                storageFileName,
                "rolling back a failed asset upload",
                exception);
            throw;
        }

        return Created(AssetUrl(postNumber, asset.Id), ToResponse(postNumber, asset));
    }

    [AllowAnonymous]
    [EnableRateLimiting("image-read")]
    [HttpGet("{assetId:guid}")]
    public async Task<IActionResult> Download(
        long postNumber,
        Guid assetId,
        CancellationToken cancellationToken)
    {
        var asset = await db.PostAssets
            .AsNoTracking()
            .Include(candidate => candidate.Post)
            .ThenInclude(post => post.Category)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == assetId && candidate.Post.PostNumber == postNumber,
                cancellationToken);
        if (asset is null) return NotFound();
        if (!access.CanRead(asset.Post, HttpContext))
        {
            return NotFound();
        }

        var path = storage.GetPath(asset.StorageFileName);
        if (!System.IO.File.Exists(path)) return NotFound();

        Response.Headers.XContentTypeOptions = "nosniff";
        // A category can later be hidden, so intermediaries must not retain its assets.
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.Vary = "Cookie";
        if (asset.ContentType == "application/pdf")
            Response.Headers.ContentSecurityPolicy = "sandbox";

        return PhysicalFile(path, asset.ContentType, enableRangeProcessing: true);
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpPatch("{assetId:guid}")]
    public async Task<ActionResult<PostAssetResponse>> Rename(
        long postNumber,
        Guid assetId,
        RenamePostAssetRequest request,
        CancellationToken cancellationToken)
    {
        var asset = await db.PostAssets
            .Include(candidate => candidate.Post)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == assetId && candidate.Post.PostNumber == postNumber,
                cancellationToken);
        if (asset is null) return NotFound();
        if (!PostAccessService.CanManage(asset.Post, HttpContext)) return Forbid();

        var normalizedName = NormalizeName(request.Name);
        if (normalizedName is null)
            return BadRequestProblem("파일 이름은 1~120자여야 합니다.");
        if (await db.PostAssets.AnyAsync(
                candidate => candidate.PostId == asset.PostId &&
                    candidate.Id != asset.Id &&
                    candidate.Name == normalizedName,
                cancellationToken))
        {
            return Conflict(new ProblemDetails
            {
                Title = "이미 사용 중인 첨부 파일 이름입니다.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        asset.Name = normalizedName;
        asset.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return Ok(ToResponse(postNumber, asset));
    }

    [Authorize]
    [EnableRateLimiting("community-write")]
    [HttpDelete("{assetId:guid}")]
    public async Task<IActionResult> Delete(
        long postNumber,
        Guid assetId,
        CancellationToken cancellationToken)
    {
        var asset = await db.PostAssets
            .Include(candidate => candidate.Post)
            .SingleOrDefaultAsync(
                candidate => candidate.Id == assetId && candidate.Post.PostNumber == postNumber,
                cancellationToken);
        if (asset is null) return NotFound();
        if (!PostAccessService.CanManage(asset.Post, HttpContext)) return Forbid();

        db.PostAssets.Remove(asset);
        await db.SaveChangesAsync(cancellationToken);
        TryDeleteStorageFile(
            asset.StorageFileName,
            $"deleting asset {asset.Id}");

        return NoContent();
    }

    private async Task<Guid?> GetPostId(long postNumber, CancellationToken cancellationToken)
    {
        var actor = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var owner = User.IsInRole(Roles.Owner);
        return await db.Posts
            .Where(post => post.PostNumber == postNumber && (owner || post.OwnerId == actor))
            .Select(post => (Guid?)post.Id)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static string? NormalizeName(string value)
    {
        var normalized = value.Trim();
        return normalized.Length is >= 1 and <= 120 && !normalized.Any(char.IsControl)
            ? normalized
            : null;
    }

    private static AssetContentValidation NormalizeContent(string extension, byte[] uploadedBytes)
    {
        if (extension == ".pdf")
        {
            var tailLength = Math.Min(2048, uploadedBytes.Length);
            if (uploadedBytes.Length < 10 ||
                !uploadedBytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8) ||
                !System.Text.Encoding.ASCII.GetString(uploadedBytes[^tailLength..])
                    .Contains("%%EOF", StringComparison.Ordinal))
            {
                return AssetContentValidation.Failure("올바른 PDF 파일이 아닙니다.");
            }

            return AssetContentValidation.Success(".pdf", uploadedBytes);
        }

        using var codec = SKCodec.Create(new SKMemoryStream(uploadedBytes));
        if (codec is null)
            return AssetContentValidation.Failure("파일 내용이 올바른 JPG 또는 PNG 이미지가 아닙니다.");
        if (codec.Info.Width <= 0 || codec.Info.Height <= 0 ||
            (long)codec.Info.Width * codec.Info.Height > MaxPixelCount)
        {
            return AssetContentValidation.Failure("이미지는 총 4천만 픽셀을 초과할 수 없습니다.");
        }

        var isPng = extension == ".png";
        if (isPng && codec.EncodedFormat != SKEncodedImageFormat.Png ||
            !isPng && codec.EncodedFormat != SKEncodedImageFormat.Jpeg)
        {
            return AssetContentValidation.Failure("파일 확장자와 실제 이미지 형식이 일치하지 않습니다.");
        }

        using var decoded = SKBitmap.Decode(uploadedBytes);
        if (decoded is null)
            return AssetContentValidation.Failure("이미지를 완전히 디코딩하지 못했습니다.");
        using var normalizedImage = SKImage.FromBitmap(decoded);
        using var normalizedData = normalizedImage.Encode(
            isPng ? SKEncodedImageFormat.Png : SKEncodedImageFormat.Jpeg,
            isPng ? 100 : 90);
        if (normalizedData is null)
            return AssetContentValidation.Failure("이미지를 안전한 형식으로 변환하지 못했습니다.");

        return AssetContentValidation.Success(
            isPng ? ".png" : ".jpg",
            normalizedData.ToArray());
    }

    private BadRequestObjectResult BadRequestProblem(string detail) =>
        BadRequest(new ProblemDetails
        {
            Title = "첨부 파일 요청이 올바르지 않습니다.",
            Detail = detail,
            Status = StatusCodes.Status400BadRequest,
        });

    private void TryDeleteStorageFile(
        string storageFileName,
        string operation,
        Exception? originalException = null)
    {
        try
        {
            storage.DeleteIfExists(storageFileName);
        }
        catch (Exception cleanupException) when (
            cleanupException is IOException or UnauthorizedAccessException)
        {
            logger.LogError(
                cleanupException,
                "Failed to remove asset file {StorageFileName} while {Operation}. Original error: {OriginalError}",
                storageFileName,
                operation,
                originalException?.Message);
        }
    }

    private static string AssetUrl(long postNumber, Guid assetId) =>
        $"/api/posts/{postNumber}/assets/{assetId}";

    private static PostAssetResponse ToResponse(long postNumber, PostAsset asset) =>
        new(
            asset.Id,
            asset.Name,
            asset.Extension,
            asset.ContentType,
            asset.Size,
            AssetUrl(postNumber, asset.Id),
            asset.CreatedAtUtc,
            asset.UpdatedAtUtc);

    private sealed record AssetContentValidation(
        bool Succeeded,
        string? Extension,
        byte[]? Content,
        string? Error)
    {
        public static AssetContentValidation Success(string extension, byte[] content) =>
            new(true, extension, content, null);

        public static AssetContentValidation Failure(string error) =>
            new(false, null, null, error);
    }
}

public sealed class RenamePostAssetRequest
{
    [Required, StringLength(120, MinimumLength = 1)]
    public required string Name { get; init; }
}

public sealed record PostAssetResponse(
    Guid Id,
    string Name,
    string Extension,
    string ContentType,
    long Size,
    string Url,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);
