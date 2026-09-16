using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/renewals")]
public sealed class RenewalsController(IMemberService members) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<RenewalView>>>> List([FromQuery] PageQuery query, [FromQuery] Guid? memberId, CancellationToken ct) =>
        OkResponse(await members.ListRenewalsAsync(query, memberId, ct));
}
