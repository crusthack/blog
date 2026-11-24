using System.Net.Http.Headers;
using Blog.Api.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Blog.Api.Controllers;

[ApiController, Authorize(Roles = Roles.Owner), Route("api/admin/pages-deploy")]
public sealed class PagesDeployController(IHttpClientFactory clients, IConfiguration config) : ControllerBase
{
    [HttpPost, EnableRateLimiting("community-write")]
    public async Task<IActionResult> Deploy(CancellationToken cancellationToken)
    {
        var token = config["Pages:DispatchToken"];
        if (string.IsNullOrWhiteSpace(token))
            return Problem(statusCode: 503, detail: "서버에 Pages 배포 토큰을 설정해 주세요.");

        using var request = new HttpRequestMessage(HttpMethod.Post,
            "https://api.github.com/repos/crusthack/blog/actions/workflows/pages.yml/dispatches");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.UserAgent.ParseAdd("crusthack-blog/1.0");
        request.Content = JsonContent.Create(new { @ref = "main", inputs = new { force = true } });
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        return response.IsSuccessStatusCode ? Accepted() : Problem(statusCode: 502,
            detail: $"GitHub에서 배포 요청을 받지 못했습니다 (HTTP {(int)response.StatusCode}).");
    }
}
