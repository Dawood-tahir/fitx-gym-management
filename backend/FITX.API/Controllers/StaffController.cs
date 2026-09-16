using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.Owner), Route("api/staff")]
public sealed class StaffController(IAdministrationService administration) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<UserSummary>>>> List([FromQuery] StaffQuery query, CancellationToken ct) => OkResponse(await administration.ListStaffAsync(query, ct));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<UserSummary>>> Create(CreateStaffRequest request, CancellationToken ct) => OkResponse(await administration.CreateStaffAsync(request, ct), "Staff account created.");

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<UserSummary>>> Update(Guid id, UpdateStaffRequest request, CancellationToken ct) => OkResponse(await administration.UpdateStaffAsync(id, request, UserId, ct), "Staff account updated.");

    [HttpPost("{id:guid}/disable")]
    public async Task<ActionResult<ApiResponse<object>>> Disable(Guid id, CancellationToken ct)
    {
        await administration.DisableStaffAsync(id, UserId, ct); return OkResponse<object>(new { }, "Staff account disabled.");
    }

    [HttpPost("{id:guid}/reset-password")]
    public async Task<ActionResult<ApiResponse<object>>> ResetPassword(Guid id, StaffResetPasswordRequest request, CancellationToken ct)
    {
        await administration.ResetStaffPasswordAsync(id, request.NewPassword, ct); return OkResponse<object>(new { }, "Staff password reset and existing sessions revoked.");
    }
}
