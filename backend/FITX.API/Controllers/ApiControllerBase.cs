using System.Security.Claims;
using FITX.API.Common;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[ApiController]
[Produces("application/json")]
public abstract class ApiControllerBase : ControllerBase
{
    protected Guid UserId => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
        ? id : throw new UnauthorizedAccessException("The access token does not contain a valid user identifier.");

    protected static ActionResult<ApiResponse<T>> OkResponse<T>(T data, string? message = null) =>
        new OkObjectResult(ApiResponse<T>.Ok(data, message));
}
