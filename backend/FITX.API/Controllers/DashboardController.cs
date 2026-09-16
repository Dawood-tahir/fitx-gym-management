using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.OwnerOrAdmin), Route("api/dashboard")]
public sealed class DashboardController(IDashboardService dashboard) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<DashboardResponse>>> Get([FromQuery] string range = "6m", CancellationToken ct = default) =>
        OkResponse(await dashboard.GetAsync(range, ct));
}
