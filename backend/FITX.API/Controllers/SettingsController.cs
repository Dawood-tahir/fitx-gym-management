using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/settings")]
public sealed class SettingsController(IAdministrationService administration) : ApiControllerBase
{
    [Authorize(Roles = Roles.Owner), HttpGet("gym")]
    public async Task<ActionResult<ApiResponse<GymSettingsView>>> Gym(CancellationToken ct) => OkResponse(await administration.GetGymSettingsAsync(ct));

    [Authorize(Roles = Roles.Owner), HttpPut("gym")]
    public async Task<ActionResult<ApiResponse<GymSettingsView>>> UpdateGym(GymSettingsRequest request, CancellationToken ct) => OkResponse(await administration.UpdateGymSettingsAsync(request, ct), "Gym settings updated.");

    [HttpPut("locale")]
    public async Task<ActionResult<ApiResponse<object>>> Locale(UpdateLocaleRequest request, CancellationToken ct)
    {
        await administration.UpdateLocaleAsync(UserId, request.Locale, ct); return OkResponse<object>(new { locale = request.Locale }, "Language preference updated.");
    }

    [HttpGet("payment-methods")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MethodView>>>> PaymentMethods([FromQuery] bool includeInactive = false, CancellationToken ct = default) => OkResponse(await administration.ListPaymentMethodsAsync(includeInactive, ct));

    [Authorize(Roles = Roles.Owner), HttpPost("payment-methods")]
    public async Task<ActionResult<ApiResponse<MethodView>>> CreatePaymentMethod(NamedOptionRequest request, CancellationToken ct) => OkResponse(await administration.CreatePaymentMethodAsync(request, ct));

    [Authorize(Roles = Roles.Owner), HttpPut("payment-methods/{id:guid}")]
    public async Task<ActionResult<ApiResponse<MethodView>>> UpdatePaymentMethod(Guid id, NamedOptionRequest request, CancellationToken ct) => OkResponse(await administration.UpdatePaymentMethodAsync(id, request, ct));

    [Authorize(Roles = Roles.Owner), HttpDelete("payment-methods/{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> DeletePaymentMethod(Guid id, CancellationToken ct) { await administration.DeletePaymentMethodAsync(id, ct); return OkResponse<object>(new { }); }

    [HttpGet("expense-categories")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<MethodView>>>> ExpenseCategories([FromQuery] bool includeInactive = false, CancellationToken ct = default) => OkResponse(await administration.ListExpenseCategoriesAsync(includeInactive, ct));

    [Authorize(Roles = Roles.Owner), HttpPost("expense-categories")]
    public async Task<ActionResult<ApiResponse<MethodView>>> CreateExpenseCategory(NamedOptionRequest request, CancellationToken ct) => OkResponse(await administration.CreateExpenseCategoryAsync(request, ct));

    [Authorize(Roles = Roles.Owner), HttpPut("expense-categories/{id:guid}")]
    public async Task<ActionResult<ApiResponse<MethodView>>> UpdateExpenseCategory(Guid id, NamedOptionRequest request, CancellationToken ct) => OkResponse(await administration.UpdateExpenseCategoryAsync(id, request, ct));

    [Authorize(Roles = Roles.Owner), HttpDelete("expense-categories/{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> DeleteExpenseCategory(Guid id, CancellationToken ct) { await administration.DeleteExpenseCategoryAsync(id, ct); return OkResponse<object>(new { }); }
}
