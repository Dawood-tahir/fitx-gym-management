using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/payments")]
public sealed class PaymentsController(IFinanceService finance, IReceiptService receipts) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<PaymentView>>>> List([FromQuery] PaymentQuery query, CancellationToken ct) => OkResponse(await finance.ListPaymentsAsync(query, ct));

    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<PaymentSummary>>> Summary(CancellationToken ct) => OkResponse(await finance.GetPaymentSummaryAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<PaymentView>>> Get(Guid id, CancellationToken ct) => OkResponse(await finance.GetPaymentAsync(id, ct));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<PaymentView>>> Create(CreatePaymentRequest request, CancellationToken ct) => OkResponse(await finance.CreatePaymentAsync(request, UserId, ct), "Payment recorded.");

    [Authorize(Roles = Roles.OwnerOrAdmin), HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<PaymentView>>> Update(Guid id, UpdatePaymentRequest request, CancellationToken ct) => OkResponse(await finance.UpdatePaymentAsync(id, request, ct), "Payment updated.");

    [Authorize(Roles = Roles.OwnerOrAdmin), HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Void(Guid id, CancellationToken ct)
    {
        await finance.VoidPaymentAsync(id, UserId, ct); return OkResponse<object>(new { }, "Payment voided; its audit history was retained.");
    }

    [HttpGet("{id:guid}/receipt")]
    public async Task<IActionResult> Receipt(Guid id, CancellationToken ct)
    {
        var file = await receipts.CreatePaymentReceiptAsync(id, ct); return File(file.Content, file.ContentType, file.FileName);
    }
}
