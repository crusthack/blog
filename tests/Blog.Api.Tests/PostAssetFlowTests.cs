using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using Blog.Api.Controllers;
using Blog.Api.Setup;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Blog.Api.Tests;

public sealed class PostAssetFlowTests
{
    private const string OwnerPassword = "correct horse battery staple";

    private static readonly byte[] PngBytes = Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVBhXY/jPwPCfoYHhPwMDw38wAABD1Al4TlSdlQAAAABJRU5ErkJggg==");

    private static readonly byte[] JpegBytes = Convert.FromBase64String(
        "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7V/Z2+C3w91v9n74ZajqPgTwzf6heeF9MuLm7utHt5JZ5XtImd3dkJZmJJJJySSTRRRXyOL/3ip/if5nwmO/3qr/il+bP/9k=");

    private static readonly byte[] PdfBytes = Encoding.ASCII.GetBytes(
        "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

    [Fact]
    public async Task Owner_can_manage_supported_assets_and_visitors_can_download_public_assets()
    {
        using var factory = new SetupApiFactory();
        var options = ClientOptions();
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);
        await CreateAndLoginOwnerAsync(owner, "asset-owner");
        var post = await CreatePostAsync(owner, "Public assets", publish: true);
        var route = $"/api/posts/{post.PostNumber}/assets";

        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.GetAsync(route)).StatusCode);
        using (var anonymousUpload = await UploadAsync(
                   visitor, post.PostNumber, PngBytes, "anonymous.png", "Anonymous", "image/png"))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, anonymousUpload.StatusCode);
        }

        AssetPayload png;
        using (var response = await UploadAsync(
                   owner, post.PostNumber, PngBytes, "hero.PNG", "  Hero  ", "image/png"))
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            png = Assert.IsType<AssetPayload>(await response.Content.ReadFromJsonAsync<AssetPayload>());
            Assert.Equal("Hero", png.Name);
            Assert.Equal(".png", png.Extension);
            Assert.Equal("image/png", png.ContentType);
            Assert.Equal($"/api/posts/{post.PostNumber}/assets/{png.Id}", png.Url);
            Assert.Equal(png.Url, response.Headers.Location?.OriginalString);
            Assert.True(png.Size > 0);
        }

        AssetPayload jpeg;
        using (var response = await UploadAsync(
                   owner, post.PostNumber, JpegBytes, "portrait.jpeg", "Portrait", "image/jpeg"))
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            jpeg = Assert.IsType<AssetPayload>(await response.Content.ReadFromJsonAsync<AssetPayload>());
            Assert.Equal(".jpg", jpeg.Extension);
            Assert.Equal("image/jpeg", jpeg.ContentType);
        }

        AssetPayload pdf;
        using (var response = await UploadAsync(
                   owner, post.PostNumber, PdfBytes, "guide.pdf", "Guide", "application/pdf"))
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            pdf = Assert.IsType<AssetPayload>(await response.Content.ReadFromJsonAsync<AssetPayload>());
            Assert.Equal(".pdf", pdf.Extension);
            Assert.Equal("application/pdf", pdf.ContentType);
        }

        var assets = await owner.GetFromJsonAsync<AssetPayload[]>(route);
        Assert.Equal(["Guide", "Hero", "Portrait"], assets!.Select(asset => asset.Name));
        Assert.Equal(3, Directory.EnumerateFiles(factory.AssetStoragePath).Count());

        using (var download = await visitor.GetAsync(png.Url))
        {
            Assert.Equal(HttpStatusCode.OK, download.StatusCode);
            Assert.Equal("image/png", download.Content.Headers.ContentType?.MediaType);
            Assert.Equal("nosniff", download.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.Contains("no-store", download.Headers.CacheControl?.ToString());
            Assert.Contains("Cookie", download.Headers.Vary);
            var bytes = await download.Content.ReadAsByteArrayAsync();
            Assert.True(bytes.AsSpan(0, 8).SequenceEqual(PngBytes.AsSpan(0, 8)));
        }

        using (var download = await visitor.GetAsync(pdf.Url))
        {
            Assert.Equal(HttpStatusCode.OK, download.StatusCode);
            Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
            Assert.Contains("sandbox", download.Headers.GetValues("Content-Security-Policy"));
        }

        using (var rename = await owner.PatchAsJsonAsync(
                   png.Url,
                   new { name = "  Cover Image  " }))
        {
            Assert.Equal(HttpStatusCode.OK, rename.StatusCode);
            var renamed = await rename.Content.ReadFromJsonAsync<AssetPayload>();
            Assert.Equal("Cover Image", renamed?.Name);
        }

        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await visitor.PatchAsJsonAsync(png.Url, new { name = "Forbidden" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await visitor.DeleteAsync(jpeg.Url)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync(png.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(png.Url)).StatusCode);
        Assert.Equal(2, Directory.EnumerateFiles(factory.AssetStoragePath).Count());

        Assert.Equal(
            HttpStatusCode.NoContent,
            (await owner.DeleteAsync($"/api/posts/{post.PostNumber}")).StatusCode);
        Assert.Empty(Directory.EnumerateFiles(factory.AssetStoragePath));
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(jpeg.Url)).StatusCode);
    }

    [Fact]
    public async Task Draft_and_hidden_category_assets_are_not_exposed_to_visitors()
    {
        using var factory = new SetupApiFactory();
        var options = ClientOptions();
        using var owner = factory.CreateClient(options);
        using var visitor = factory.CreateClient(options);
        await CreateAndLoginOwnerAsync(owner, "private-asset-owner");

        var draft = await CreatePostAsync(owner, "Draft asset", publish: false);
        AssetPayload draftAsset;
        using (var upload = await UploadAsync(
                   owner, draft.PostNumber, PngBytes, "draft.png", "Draft", "image/png"))
        {
            Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
            draftAsset = Assert.IsType<AssetPayload>(await upload.Content.ReadFromJsonAsync<AssetPayload>());
        }

        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(draftAsset.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(draftAsset.Url)).StatusCode);

        var categoryResponse = await owner.PostAsJsonAsync(
            "/api/categories",
            new SaveCategoryRequest
            {
                Name = "Hidden",
                Slug = "hidden-assets",
                IsVisible = false,
            });
        Assert.Equal(HttpStatusCode.Created, categoryResponse.StatusCode);
        var category = Assert.IsType<CategoryResponse>(
            await categoryResponse.Content.ReadFromJsonAsync<CategoryResponse>());
        var hiddenPost = await CreatePostAsync(
            owner,
            "Hidden category asset",
            publish: true,
            category.Id);

        AssetPayload hiddenAsset;
        using (var upload = await UploadAsync(
                   owner, hiddenPost.PostNumber, PngBytes, "hidden.png", "Hidden", "image/png"))
        {
            Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
            hiddenAsset = Assert.IsType<AssetPayload>(await upload.Content.ReadFromJsonAsync<AssetPayload>());
        }

        Assert.Equal(
            HttpStatusCode.NotFound,
            (await visitor.GetAsync($"/api/posts/{hiddenPost.PostNumber}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await visitor.GetAsync(hiddenAsset.Url)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await owner.GetAsync(hiddenAsset.Url)).StatusCode);
    }

    [Fact]
    public async Task Invalid_asset_uploads_and_names_are_rejected_without_writing_files()
    {
        using var factory = new SetupApiFactory();
        using var owner = factory.CreateClient(ClientOptions());
        await CreateAndLoginOwnerAsync(owner, "asset-validation-owner");
        var post = await CreatePostAsync(owner, "Asset validation", publish: false);

        AssetPayload first;
        using (var response = await UploadAsync(
                   owner, post.PostNumber, PngBytes, "first.png", "Primary", "image/png"))
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            first = Assert.IsType<AssetPayload>(await response.Content.ReadFromJsonAsync<AssetPayload>());
        }

        await AssertUploadStatusAsync(
            owner, post.PostNumber, PngBytes, "duplicate.png", " Primary ", "image/png",
            HttpStatusCode.Conflict);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, PngBytes, "too-long.png", new string('n', 121), "image/png",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, [], "empty.png", "Empty", "image/png",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, PngBytes, "notes.txt", "Text", "text/plain",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, PngBytes, "mismatch.jpg", "Mismatch", "image/jpeg",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, "not an image"u8.ToArray(), "broken.png", "Broken", "image/png",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber, "%PDF-1.4\nmissing eof"u8.ToArray(), "broken.pdf", "Broken PDF", "application/pdf",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner,
            post.PostNumber,
            new byte[10 * 1024 * 1024 + 1],
            "too-large.png",
            "Too Large",
            "image/png",
            HttpStatusCode.BadRequest);
        await AssertUploadStatusAsync(
            owner, post.PostNumber + 1000, PngBytes, "missing.png", "Missing", "image/png",
            HttpStatusCode.NotFound);

        using (var invalidRename = await owner.PatchAsJsonAsync(
                   first.Url,
                   new { name = new string('n', 121) }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, invalidRename.StatusCode);
        }

        Assert.Single(Directory.EnumerateFiles(factory.AssetStoragePath));
        var remaining = await owner.GetFromJsonAsync<AssetPayload[]>(
            $"/api/posts/{post.PostNumber}/assets");
        Assert.Equal("Primary", Assert.Single(remaining!).Name);
    }

    private static WebApplicationFactoryClientOptions ClientOptions() => new()
    {
        BaseAddress = new Uri("https://localhost"),
    };

    private static async Task CreateAndLoginOwnerAsync(HttpClient client, string username)
    {
        var setup = await client.PostAsJsonAsync(
            "/api/setup/owner",
            new CreateOwnerRequest
            {
                SetupCode = SetupApiFactory.SetupCode,
                Username = username,
                Password = OwnerPassword,
            });
        Assert.Equal(HttpStatusCode.Created, setup.StatusCode);

        var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new LoginRequest
            {
                Username = username,
                Password = OwnerPassword,
            });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    private static async Task<PostDetailResponse> CreatePostAsync(
        HttpClient owner,
        string title,
        bool publish,
        Guid? categoryId = null)
    {
        var response = await owner.PostAsJsonAsync(
            "/api/posts",
            new CreatePostRequest
            {
                Title = title,
                Content = $"# {title}",
                CategoryId = categoryId,
                Publish = publish,
            });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return Assert.IsType<PostDetailResponse>(
            await response.Content.ReadFromJsonAsync<PostDetailResponse>());
    }

    private static async Task<HttpResponseMessage> UploadAsync(
        HttpClient client,
        long postNumber,
        byte[] bytes,
        string fileName,
        string name,
        string contentType)
    {
        using var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        form.Add(file, "file", fileName);
        form.Add(new StringContent(name), "name");
        return await client.PostAsync($"/api/posts/{postNumber}/assets", form);
    }

    private static async Task AssertUploadStatusAsync(
        HttpClient client,
        long postNumber,
        byte[] bytes,
        string fileName,
        string name,
        string contentType,
        HttpStatusCode expectedStatus)
    {
        using var response = await UploadAsync(
            client, postNumber, bytes, fileName, name, contentType);
        Assert.Equal(expectedStatus, response.StatusCode);
    }

    private sealed record AssetPayload(
        Guid Id,
        string Name,
        string Extension,
        string ContentType,
        long Size,
        string Url,
        DateTime CreatedAtUtc,
        DateTime UpdatedAtUtc);
}
