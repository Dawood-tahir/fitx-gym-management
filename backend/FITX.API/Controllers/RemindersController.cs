using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.OwnerOrAdmin), Route("api/reminders")]
public sealed class RemindersController(IReminderService reminders) : ApiControllerBase
{
    [HttpGet("settings")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ReminderSettingView>>>> Settings(CancellationToken ct) => OkResponse(await reminders.ListSettingsAsync(ct));

    [Authorize(Roles = Roles.Owner), HttpPost("settings")]
    public async Task<ActionResult<ApiResponse<ReminderSettingView>>> CreateSetting(ReminderSettingRequest request, CancellationToken ct) => OkResponse(await reminders.CreateSettingAsync(request, ct), "Reminder setting created.");

    [Authorize(Roles = Roles.Owner), HttpPut("settings/{id:guid}")]
    public async Task<ActionResult<ApiResponse<ReminderSettingView>>> UpdateSetting(Guid id, ReminderSettingRequest request, CancellationToken ct) => OkResponse(await reminders.UpdateSettingAsync(id, request, ct), "Reminder setting updated.");

    [HttpGet("candidates")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ReminderCandidate>>>> Candidates(CancellationToken ct) => OkResponse(await reminders.ListCandidatesAsync(ct));

    [HttpPost("send")]
    public async Task<ActionResult<ApiResponse<ReminderLogView>>> Send(SendReminderRequest request, CancellationToken ct) => OkResponse(await reminders.SendAsync(request, ct), "Reminder processed.");

    [Authorize(Roles = Roles.Owner), HttpPost("process-due")]
    public async Task<ActionResult<ApiResponse<ReminderProcessResult>>> ProcessDue(CancellationToken ct) => OkResponse(await reminders.ProcessDueAsync(ct));

    [HttpGet("logs")]
    public async Task<ActionResult<ApiResponse<PagedResult<ReminderLogView>>>> Logs([FromQuery] PageQuery query, CancellationToken ct) => OkResponse(await reminders.ListLogsAsync(query, ct));
}
