using System.Net;
using System.Text.Json;
using FITX.API.Common;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Middleware;

public sealed class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger, IHostEnvironment environment)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception exception)
        {
            await WriteExceptionAsync(context, exception);
        }
    }

    private async Task WriteExceptionAsync(HttpContext context, Exception exception)
    {
        var (status, message, errors) = exception switch
        {
            NotFoundException e => (HttpStatusCode.NotFound, e.Message, (object?)null),
            ConflictException e => (HttpStatusCode.Conflict, e.Message, null),
            ForbiddenException e => (HttpStatusCode.Forbidden, e.Message, null),
            ValidationException e => (HttpStatusCode.BadRequest, e.Message, e.Errors),
            UnauthorizedAccessException e => (HttpStatusCode.Unauthorized, e.Message, null),
            DbUpdateConcurrencyException => (HttpStatusCode.Conflict, "The record changed while it was being edited. Refresh and try again.", null),
            DbUpdateException => (HttpStatusCode.Conflict, "The operation conflicts with existing data.", null),
            _ => (HttpStatusCode.InternalServerError, "An unexpected error occurred.", null)
        };

        if ((int)status >= 500)
            logger.LogError(exception, "Unhandled error for {Method} {Path}. TraceId: {TraceId}", context.Request.Method, context.Request.Path, context.TraceIdentifier);
        else
            logger.LogWarning(exception, "Request rejected for {Method} {Path}. TraceId: {TraceId}", context.Request.Method, context.Request.Path, context.TraceIdentifier);

        if (environment.IsDevelopment() && status == HttpStatusCode.InternalServerError)
            errors = new { detail = exception.Message, traceId = context.TraceIdentifier };

        context.Response.StatusCode = (int)status;
        context.Response.ContentType = "application/json";
        await JsonSerializer.SerializeAsync(context.Response.Body,
            ApiResponse<object>.Fail(message, errors),
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }
}
