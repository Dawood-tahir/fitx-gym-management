using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/membership-plans")]
public sealed class MembershipPlansController(IAdministrationService administration) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PlanView>>>> List([FromQuery] bool includeInactive = false, CancellationToken ct = default) => OkResponse(await administration.ListPlansAsync(includeInactive, ct));

    [Authorize(Roles = Roles.Owner), HttpPost]
    public async Task<ActionResult<ApiResponse<PlanView>>> Create(PlanRequest request, CancellationToken ct) => OkResponse(await administration.CreatePlanAsync(request, ct), "Membership plan created.");

    [Authorize(Roles = Roles.Owner), HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<PlanView>>> Update(Guid id, PlanRequest request, CancellationToken ct) => OkResponse(await administration.UpdatePlanAsync(id, request, ct), "Membership plan updated.");

    [Authorize(Roles = Roles.Owner), HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, CancellationToken ct)
    {
        await administration.DeletePlanAsync(id, ct); return OkResponse<object>(new { }, "Membership plan removed.");
    }
}
