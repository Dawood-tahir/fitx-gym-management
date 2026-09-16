using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/members")]
public sealed class MembersController(IMemberService members) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<MemberListItem>>>> List([FromQuery] MemberQuery query, CancellationToken ct) => OkResponse(await members.ListAsync(query, ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<MemberDetails>>> Get(Guid id, CancellationToken ct) => OkResponse(await members.GetAsync(id, ct));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<MemberDetails>>> Create(CreateMemberRequest request, CancellationToken ct)
    {
        var created = await members.CreateAsync(request, UserId, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, ApiResponse<MemberDetails>.Ok(created, "Member created."));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<MemberDetails>>> Update(Guid id, UpdateMemberRequest request, CancellationToken ct) =>
        OkResponse(await members.UpdateAsync(id, request, ct), "Member updated.");

    [Authorize(Roles = Roles.OwnerOrAdmin), HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, CancellationToken ct)
    {
        await members.DeleteAsync(id, ct); return OkResponse<object>(new { }, "Member deleted.");
    }

    [HttpPost("{id:guid}/renew")]
    public async Task<ActionResult<ApiResponse<RenewalView>>> Renew(Guid id, RenewMembershipRequest request, CancellationToken ct) =>
        OkResponse(await members.RenewAsync(id, request, UserId, ct), "Membership renewed.");
}
