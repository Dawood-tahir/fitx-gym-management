using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/notifications")]
public sealed class NotificationsController(IAdministrationService administration) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<NotificationView>>>> List([FromQuery] PageQuery query, [FromQuery] bool unreadOnly = false, CancellationToken ct = default) => OkResponse(await administration.ListNotificationsAsync(query, UserId, unreadOnly, ct));

    [HttpPut("{id:guid}/read")]
    public async Task<ActionResult<ApiResponse<object>>> Read(Guid id, CancellationToken ct) { await administration.MarkNotificationReadAsync(id, UserId, ct); return OkResponse<object>(new { }); }

    [HttpPut("read-all")]
    public async Task<ActionResult<ApiResponse<object>>> ReadAll(CancellationToken ct) { await administration.MarkAllNotificationsReadAsync(UserId, ct); return OkResponse<object>(new { }); }
}
