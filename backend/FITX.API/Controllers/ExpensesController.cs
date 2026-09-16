using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.OwnerOrAdmin), Route("api/expenses")]
public sealed class ExpensesController(IFinanceService finance) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ExpenseView>>>> List([FromQuery] ExpenseQuery query, CancellationToken ct) => OkResponse(await finance.ListExpensesAsync(query, ct));

    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<ExpenseSummary>>> Summary(CancellationToken ct) => OkResponse(await finance.GetExpenseSummaryAsync(ct));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ExpenseView>>> Get(Guid id, CancellationToken ct) => OkResponse(await finance.GetExpenseAsync(id, ct));

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ExpenseView>>> Create(ExpenseRequest request, CancellationToken ct) => OkResponse(await finance.CreateExpenseAsync(request, UserId, ct), "Expense recorded.");

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ExpenseView>>> Update(Guid id, ExpenseRequest request, CancellationToken ct) => OkResponse(await finance.UpdateExpenseAsync(id, request, ct), "Expense updated.");

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, CancellationToken ct)
    {
        await finance.DeleteExpenseAsync(id, ct); return OkResponse<object>(new { }, "Expense deleted.");
    }
}
