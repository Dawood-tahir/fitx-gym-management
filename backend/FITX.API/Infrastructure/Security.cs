using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace FITX.API.Infrastructure;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";
    public string Issuer { get; init; } = "FITX.API";
    public string Audience { get; init; } = "FITX.Web";
    public string Secret { get; init; } = "";
    public int AccessTokenMinutes { get; init; } = 20;
    public int RefreshTokenDays { get; init; } = 7;
    public int RememberMeRefreshTokenDays { get; init; } = 30;
}

public interface ICurrentUser
{
    Guid? Id { get; }
    string? IpAddress { get; }
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public Guid? Id => Guid.TryParse(accessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    public string? IpAddress => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
}

public interface IAuditWriter
{
    void Add(string action, string entityType, object? entityId, object? previous = null, object? current = null);
}

public sealed class AuditWriter(FitxDbContext db, ICurrentUser currentUser) : IAuditWriter
{
    public void Add(string action, string entityType, object? entityId, object? previous = null, object? current = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            UserId = currentUser.Id,
            Action = action,
            EntityType = entityType,
            EntityId = entityId?.ToString(),
            IpAddress = currentUser.IpAddress,
            PreviousValuesJson = previous is null ? null : System.Text.Json.JsonSerializer.Serialize(previous),
            NewValuesJson = current is null ? null : System.Text.Json.JsonSerializer.Serialize(current)
        });
    }
}

public interface IAuthService
{
    Task<TokenResponse> LoginAsync(LoginRequest request, string? ipAddress, CancellationToken ct);
    Task<TokenResponse> RefreshAsync(string refreshToken, string? ipAddress, CancellationToken ct);
    Task RevokeAsync(string refreshToken, string? ipAddress, CancellationToken ct);
    Task<ForgotPasswordResult> ForgotPasswordAsync(string email, CancellationToken ct);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct);
    Task<UserSummary> GetCurrentUserAsync(Guid userId, CancellationToken ct);
}

public sealed class AuthService(
    FitxDbContext db,
    IOptions<JwtOptions> options,
    IHostEnvironment environment,
    ILogger<AuthService> logger) : IAuthService
{
    private readonly JwtOptions _jwt = options.Value;

    public async Task<TokenResponse> LoginAsync(LoginRequest request, string? ipAddress, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Email == email, ct);
        if (user is null || user.Status != UserStatus.Active || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid email or password.");

        user.LastLoginAt = DateTimeOffset.UtcNow;
        RemoveOldRefreshTokens(user);
        var response = CreateTokens(user, request.RememberMe, ipAddress);
        await db.SaveChangesAsync(ct);
        return response;
    }

    public async Task<TokenResponse> RefreshAsync(string refreshToken, string? ipAddress, CancellationToken ct)
    {
        var hash = HashToken(refreshToken);
        var stored = await db.RefreshTokens.Include(x => x.User).SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
        if (stored is null || !stored.IsActive || stored.User.Status != UserStatus.Active)
            throw new UnauthorizedAccessException("The refresh token is invalid or expired.");

        stored.RevokedAt = DateTimeOffset.UtcNow;
        stored.RevokedByIp = ipAddress;
        var response = CreateTokens(stored.User, stored.ExpiresAt > DateTimeOffset.UtcNow.AddDays(_jwt.RefreshTokenDays), ipAddress);
        stored.ReplacedByTokenHash = HashToken(response.RefreshToken);
        await db.SaveChangesAsync(ct);
        return response;
    }

    public async Task RevokeAsync(string refreshToken, string? ipAddress, CancellationToken ct)
    {
        var hash = HashToken(refreshToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
        if (stored is null) return;
        stored.RevokedAt = DateTimeOffset.UtcNow;
        stored.RevokedByIp = ipAddress;
        await db.SaveChangesAsync(ct);
    }

    public async Task<ForgotPasswordResult> ForgotPasswordAsync(string email, CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email.Trim().ToLowerInvariant(), ct);
        const string message = "If an active account exists, password reset instructions have been generated.";
        if (user is null || user.Status != UserStatus.Active) return new ForgotPasswordResult(message);

        var rawToken = GenerateSecureToken();
        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = HashToken(rawToken),
            ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30)
        });
        await db.SaveChangesAsync(ct);

        // A provider adapter can consume this event later. Never log a reset token outside Development.
        if (environment.IsDevelopment())
        {
            logger.LogWarning("Development password reset token for {Email}: {Token}", user.Email, rawToken);
            return new ForgotPasswordResult(message, rawToken);
        }
        return new ForgotPasswordResult(message);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct)
    {
        ValidatePassword(request.NewPassword);
        var hash = HashToken(request.Token);
        var token = await db.PasswordResetTokens.Include(x => x.User)
            .SingleOrDefaultAsync(x => x.TokenHash == hash, ct);
        if (token is null || token.UsedAt is not null || token.ExpiresAt <= DateTimeOffset.UtcNow)
            throw new ValidationException("The password reset token is invalid or expired.");

        token.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword, workFactor: 12);
        token.UsedAt = DateTimeOffset.UtcNow;
        foreach (var refresh in await db.RefreshTokens.Where(x => x.UserId == token.UserId && x.RevokedAt == null).ToListAsync(ct))
            refresh.RevokedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<UserSummary> GetCurrentUserAsync(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId, ct)
            ?? throw new NotFoundException("User not found.");
        return MapUser(user);
    }

    private TokenResponse CreateTokens(User user, bool rememberMe, string? ipAddress)
    {
        if (Encoding.UTF8.GetByteCount(_jwt.Secret) < 32)
            throw new InvalidOperationException("Jwt:Secret must contain at least 32 bytes.");

        var expires = DateTimeOffset.UtcNow.AddMinutes(_jwt.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Role, user.Role.ToString().ToUpperInvariant()),
            new("locale", user.Locale),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.Secret)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(_jwt.Issuer, _jwt.Audience, claims,
            notBefore: DateTime.UtcNow, expires: expires.UtcDateTime, signingCredentials: credentials);
        var accessToken = new JwtSecurityTokenHandler().WriteToken(jwt);
        var rawRefresh = GenerateSecureToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            User = user,
            TokenHash = HashToken(rawRefresh),
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(rememberMe ? _jwt.RememberMeRefreshTokenDays : _jwt.RefreshTokenDays),
            CreatedByIp = ipAddress
        });
        return new TokenResponse(accessToken, rawRefresh, expires, MapUser(user));
    }

    private static UserSummary MapUser(User user) => new(
        user.Id, user.Name, user.Phone, user.Email, user.Role.ToString().ToUpperInvariant(),
        user.Status.ToString().ToUpperInvariant(), user.Locale, user.LastLoginAt);

    private static string GenerateSecureToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64))
        .Replace('+', '-').Replace('/', '_').TrimEnd('=');

    public static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static void ValidatePassword(string password)
    {
        if (password.Length < 10 || !Regex.IsMatch(password, "[A-Z]") || !Regex.IsMatch(password, "[a-z]") ||
            !Regex.IsMatch(password, "[0-9]") || !Regex.IsMatch(password, "[^a-zA-Z0-9]"))
            throw new ValidationException("Password must be at least 10 characters and contain upper-case, lower-case, number, and symbol characters.");
    }

    private static void RemoveOldRefreshTokens(User user)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-7);
        foreach (var token in user.RefreshTokens.Where(x => x.ExpiresAt < cutoff || x.RevokedAt < cutoff).ToList())
            user.RefreshTokens.Remove(token);
    }
}
