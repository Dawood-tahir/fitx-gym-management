using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.Owner), Route("api/audit-logs")]
public sealed class AuditLogsController(IAdministrationService administration) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<AuditLogView>>>> List([FromQuery] PageQuery query, [FromQuery] string? entityType, [FromQuery] string? action, CancellationToken ct) => OkResponse(await administration.ListAuditLogsAsync(query, entityType, action, ct));
}
