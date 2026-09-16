using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace FITX.API.Controllers;

[Route("api/auth")]
public sealed class AuthController(IAuthService auth) : ApiControllerBase
{
    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("login")]
    public async Task<ActionResult<ApiResponse<TokenResponse>>> Login(LoginRequest request, CancellationToken ct) =>
        OkResponse(await auth.LoginAsync(request, HttpContext.Connection.RemoteIpAddress?.ToString(), ct));

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("refresh")]
    public async Task<ActionResult<ApiResponse<TokenResponse>>> Refresh(RefreshRequest request, CancellationToken ct) =>
        OkResponse(await auth.RefreshAsync(request.RefreshToken, HttpContext.Connection.RemoteIpAddress?.ToString(), ct));

    [Authorize, HttpPost("revoke")]
    public async Task<ActionResult<ApiResponse<object>>> Revoke(RefreshRequest request, CancellationToken ct)
    {
        await auth.RevokeAsync(request.RefreshToken, HttpContext.Connection.RemoteIpAddress?.ToString(), ct);
        return OkResponse<object>(new { }, "Session revoked.");
    }

    [AllowAnonymous, EnableRateLimiting("password"), HttpPost("forgot-password")]
    public async Task<ActionResult<ApiResponse<ForgotPasswordResult>>> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct) =>
        OkResponse(await auth.ForgotPasswordAsync(request.Email, ct));

    [AllowAnonymous, EnableRateLimiting("password"), HttpPost("reset-password")]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return OkResponse<object>(new { }, "Password reset successfully.");
    }

    [Authorize, HttpGet("me")]
    public async Task<ActionResult<ApiResponse<UserSummary>>> Me(CancellationToken ct) => OkResponse(await auth.GetCurrentUserAsync(UserId, ct));
}
