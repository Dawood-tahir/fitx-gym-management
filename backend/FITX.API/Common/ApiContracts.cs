using System.ComponentModel.DataAnnotations;

namespace FITX.API.Common;

public sealed record ApiResponse<T>(bool Success, T? Data, string? Message = null, object? Errors = null)
{
    public static ApiResponse<T> Ok(T data, string? message = null) => new(true, data, message);
    public static ApiResponse<T> Fail(string message, object? errors = null) => new(false, default, message, errors);
}

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public class PageQuery
{
    [Range(1, int.MaxValue)] public int Page { get; init; } = 1;
    [Range(1, 100)] public int PageSize { get; init; } = 20;
    public string? Search { get; init; }
    public string? SortBy { get; init; }
    public bool Descending { get; init; }
}

public static class Roles
{
    public const string Owner = "OWNER";
    public const string Admin = "ADMIN";
    public const string Staff = "STAFF";
    public const string OwnerOrAdmin = Owner + "," + Admin;
    public const string All = Owner + "," + Admin + "," + Staff;
}

public static class Policies
{
    public const string OwnerOnly = "OwnerOnly";
    public const string Finance = "Finance";
}

public sealed class NotFoundException(string message) : Exception(message);
public sealed class ConflictException(string message) : Exception(message);
public sealed class ForbiddenException(string message) : Exception(message);
public sealed class ValidationException(string message, object? errors = null) : Exception(message)
{
    public object? Errors { get; } = errors;
}

public static class DateRanges
{
    public static (DateTimeOffset Start, DateTimeOffset End) Normalize(DateOnly? from, DateOnly? to)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var startDate = from ?? new DateOnly(today.Year, today.Month, 1);
        var endDate = to ?? today;
        if (endDate < startDate) throw new ValidationException("The end date must be on or after the start date.");
        if (endDate.DayNumber - startDate.DayNumber > 3660) throw new ValidationException("The selected range cannot exceed ten years.");
        return (
            new DateTimeOffset(startDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero),
            new DateTimeOffset(endDate.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero));
    }
}
