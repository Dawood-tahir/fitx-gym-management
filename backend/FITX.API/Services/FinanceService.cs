using System.Security.Cryptography;
using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using FITX.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface IFinanceService
{
    Task<PagedResult<PaymentView>> ListPaymentsAsync(PaymentQuery query, CancellationToken ct);
    Task<PaymentView> GetPaymentAsync(Guid id, CancellationToken ct);
    Task<PaymentView> CreatePaymentAsync(CreatePaymentRequest request, Guid actorId, CancellationToken ct);
    Task<PaymentView> UpdatePaymentAsync(Guid id, UpdatePaymentRequest request, CancellationToken ct);
    Task VoidPaymentAsync(Guid id, Guid actorId, CancellationToken ct);
    Task<PaymentSummary> GetPaymentSummaryAsync(CancellationToken ct);
    Task<PagedResult<ExpenseView>> ListExpensesAsync(ExpenseQuery query, CancellationToken ct);
    Task<ExpenseView> GetExpenseAsync(Guid id, CancellationToken ct);
    Task<ExpenseView> CreateExpenseAsync(ExpenseRequest request, Guid actorId, CancellationToken ct);
    Task<ExpenseView> UpdateExpenseAsync(Guid id, ExpenseRequest request, CancellationToken ct);
    Task DeleteExpenseAsync(Guid id, CancellationToken ct);
    Task<ExpenseSummary> GetExpenseSummaryAsync(CancellationToken ct);
}

public sealed class FinanceService(FitxDbContext db, IAuditWriter audit) : IFinanceService
{
    public async Task<PagedResult<PaymentView>> ListPaymentsAsync(PaymentQuery query, CancellationToken ct)
    {
        var source = PaymentSource();
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(x => x.PaymentNumber.Contains(term) || x.Member.FullName.Contains(term) ||
                                       x.Member.MemberCode.Contains(term) || x.Member.Phone.Contains(term));
        }
        if (query.MemberId.HasValue) source = source.Where(x => x.MemberId == query.MemberId);
        if (query.PlanId.HasValue) source = source.Where(x => x.Membership != null && x.Membership.PlanId == query.PlanId);
        if (query.PaymentMethodId.HasValue) source = source.Where(x => x.PaymentMethodId == query.PaymentMethodId);
        if (query.From.HasValue || query.To.HasValue)
        {
            var (start, end) = DateRanges.Normalize(query.From, query.To);
            source = source.Where(x => x.PaymentDate >= start && x.PaymentDate < end);
        }
        if (query.Status.HasValue)
        {
            source = query.Status.Value switch
            {
                PaymentState.Paid => source.Where(x => x.AmountPaid > 0 && x.RemainingAmount <= 0),
                PaymentState.Partial => source.Where(x => x.AmountPaid > 0 && x.RemainingAmount > 0),
                PaymentState.Unpaid => source.Where(x => x.AmountPaid <= 0),
                _ => source
            };
        }
        source = (query.SortBy?.ToLowerInvariant(), query.Descending) switch
        {
            ("amount", false) => source.OrderBy(x => x.AmountPaid),
            ("amount", true) => source.OrderByDescending(x => x.AmountPaid),
            ("date", false) => source.OrderBy(x => x.PaymentDate),
            _ => source.OrderByDescending(x => x.PaymentDate)
        };
        var count = await source.CountAsync(ct);
        var rows = await source.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new PagedResult<PaymentView>(rows.Select(MemberService.MapPayment).ToList(), query.Page, query.PageSize, count);
    }

    public async Task<PaymentView> GetPaymentAsync(Guid id, CancellationToken ct)
    {
        var row = await PaymentSource().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Payment not found.");
        return MemberService.MapPayment(row);
    }

    public async Task<PaymentView> CreatePaymentAsync(CreatePaymentRequest request, Guid actorId, CancellationToken ct)
    {
        if (!await db.PaymentMethods.AnyAsync(x => x.Id == request.PaymentMethodId && x.IsActive, ct))
            throw new ValidationException("The selected payment method is unavailable.");
        var member = await db.Members.SingleOrDefaultAsync(x => x.Id == request.MemberId, ct) ?? throw new NotFoundException("Member not found.");
        var membership = request.MembershipId.HasValue
            ? await db.Memberships.SingleOrDefaultAsync(x => x.Id == request.MembershipId && x.MemberId == request.MemberId, ct)
            : await db.Memberships.SingleOrDefaultAsync(x => x.MemberId == request.MemberId && x.IsCurrent, ct);
        if (membership is null) throw new ValidationException("A valid membership is required for this payment.");

        var alreadyPaid = await db.Payments.Where(x => x.MembershipId == membership.Id && !x.IsVoided).SumAsync(x => x.AmountPaid, ct);
        var outstanding = Math.Max(0, membership.FinalFee - alreadyPaid);
        if (outstanding <= 0) throw new ConflictException("This membership has no outstanding balance.");
        if (request.AmountPaid <= 0) throw new ValidationException("Amount paid must be greater than zero.");
        if (request.AmountPaid > outstanding) throw new ValidationException("Payment amount cannot exceed the remaining balance.");

        var payment = new Payment
        {
            PaymentNumber = await GeneratePaymentNumberAsync(ct), MemberId = member.Id, MembershipId = membership.Id,
            PaymentMethodId = request.PaymentMethodId, TotalFee = membership.Fee, Discount = membership.Discount,
            PayableAmount = membership.FinalFee, AmountPaid = request.AmountPaid, RemainingAmount = outstanding - request.AmountPaid,
            PaymentDate = request.PaymentDate ?? DateTimeOffset.UtcNow, ReferenceNumber = TrimOrNull(request.ReferenceNumber),
            Notes = TrimOrNull(request.Notes), ReceivedByUserId = actorId
        };
        db.Payments.Add(payment);
        db.Notifications.Add(new Notification
        {
            Kind = NotificationKind.PaymentReceived, Title = "Payment received",
            Message = $"Rs. {request.AmountPaid:N0} received from {member.FullName}.", ActionUrl = $"/payments/{payment.Id}"
        });
        audit.Add("PAYMENT_RECORDED", nameof(Payment), payment.Id, current: new { member.MemberCode, payment.AmountPaid, payment.RemainingAmount });
        await db.SaveChangesAsync(ct);
        return await GetPaymentAsync(payment.Id, ct);
    }

    public async Task<PaymentView> UpdatePaymentAsync(Guid id, UpdatePaymentRequest request, CancellationToken ct)
    {
        var payment = await db.Payments.Include(x => x.Membership).SingleOrDefaultAsync(x => x.Id == id && !x.IsVoided, ct)
            ?? throw new NotFoundException("Payment not found.");
        if (!await db.PaymentMethods.AnyAsync(x => x.Id == request.PaymentMethodId && x.IsActive, ct))
            throw new ValidationException("The selected payment method is unavailable.");
        if (payment.Membership is null) throw new ConflictException("This payment is not linked to a membership.");
        var paidByOthers = await db.Payments.Where(x => x.MembershipId == payment.MembershipId && x.Id != id && !x.IsVoided).SumAsync(x => x.AmountPaid, ct);
        var maximum = Math.Max(0, payment.Membership.FinalFee - paidByOthers);
        if (request.AmountPaid <= 0 || request.AmountPaid > maximum)
            throw new ValidationException("Payment amount must be greater than zero and cannot exceed the remaining membership balance.");
        var previous = new { payment.AmountPaid, payment.PaymentMethodId, payment.PaymentDate, payment.ReferenceNumber, payment.Notes };
        payment.AmountPaid = request.AmountPaid;
        payment.PaymentMethodId = request.PaymentMethodId;
        payment.PaymentDate = request.PaymentDate;
        payment.ReferenceNumber = TrimOrNull(request.ReferenceNumber);
        payment.Notes = TrimOrNull(request.Notes);
        await RecalculatePaymentBalancesAsync(payment.Membership, ct);
        audit.Add("PAYMENT_UPDATED", nameof(Payment), payment.Id, previous, request);
        await db.SaveChangesAsync(ct);
        return await GetPaymentAsync(id, ct);
    }

    public async Task VoidPaymentAsync(Guid id, Guid actorId, CancellationToken ct)
    {
        var payment = await db.Payments.Include(x => x.Membership).SingleOrDefaultAsync(x => x.Id == id && !x.IsVoided, ct)
            ?? throw new NotFoundException("Payment not found.");
        payment.IsVoided = true;
        payment.VoidedAt = DateTimeOffset.UtcNow;
        payment.VoidedByUserId = actorId;
        if (payment.Membership is not null) await RecalculatePaymentBalancesAsync(payment.Membership, ct);
        audit.Add("PAYMENT_VOIDED", nameof(Payment), payment.Id, new { payment.PaymentNumber, payment.AmountPaid });
        await db.SaveChangesAsync(ct);
    }

    public async Task<PaymentSummary> GetPaymentSummaryAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var cycleStart = now.Day >= 10
            ? new DateTimeOffset(now.Year, now.Month, 10, 0, 0, 0, TimeSpan.Zero)
            : new DateTimeOffset(now.Year, now.Month, 10, 0, 0, 0, TimeSpan.Zero).AddMonths(-1);
        var received = await db.Payments.Where(x => !x.IsVoided && x.PaymentDate >= cycleStart).SumAsync(x => x.AmountPaid, ct);
        var memberships = await db.Memberships.AsNoTracking().Where(x => x.IsCurrent)
            .Select(x => new { x.FinalFee, Paid = x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) }).ToListAsync(ct);
        var outstanding = memberships.Sum(x => Math.Max(0, x.FinalFee - x.Paid));
        var paid = memberships.Count(x => x.Paid >= x.FinalFee);
        return new PaymentSummary(received, outstanding, paid, memberships.Count - paid);
    }

    public async Task<PagedResult<ExpenseView>> ListExpensesAsync(ExpenseQuery query, CancellationToken ct)
    {
        var source = ExpenseSource();
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(x => x.ExpenseNumber.Contains(term) || x.Description.Contains(term) || x.Category.Name.Contains(term));
        }
        if (query.CategoryId.HasValue) source = source.Where(x => x.CategoryId == query.CategoryId);
        if (query.PaymentMethodId.HasValue) source = source.Where(x => x.PaymentMethodId == query.PaymentMethodId);
        if (query.From.HasValue || query.To.HasValue)
        {
            var (start, end) = DateRanges.Normalize(query.From, query.To);
            source = source.Where(x => x.ExpenseDate >= start && x.ExpenseDate < end);
        }
        source = (query.SortBy?.ToLowerInvariant(), query.Descending) switch
        {
            ("amount", false) => source.OrderBy(x => x.Amount),
            ("amount", true) => source.OrderByDescending(x => x.Amount),
            ("date", false) => source.OrderBy(x => x.ExpenseDate),
            _ => source.OrderByDescending(x => x.ExpenseDate)
        };
        var count = await source.CountAsync(ct);
        var rows = await source.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new PagedResult<ExpenseView>(rows.Select(MapExpense).ToList(), query.Page, query.PageSize, count);
    }

    public async Task<ExpenseView> GetExpenseAsync(Guid id, CancellationToken ct)
    {
        var row = await ExpenseSource().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Expense not found.");
        return MapExpense(row);
    }

    public async Task<ExpenseView> CreateExpenseAsync(ExpenseRequest request, Guid actorId, CancellationToken ct)
    {
        await EnsureExpenseReferencesAsync(request, ct);
        var expense = new Expense
        {
            ExpenseNumber = await GenerateExpenseNumberAsync(ct), CategoryId = request.CategoryId,
            Description = request.Description.Trim(), Amount = request.Amount,
            ExpenseDate = request.ExpenseDate == default ? DateTimeOffset.UtcNow : request.ExpenseDate,
            PaymentMethodId = request.PaymentMethodId, ReferenceNumber = TrimOrNull(request.ReferenceNumber),
            Notes = TrimOrNull(request.Notes), AddedByUserId = actorId
        };
        db.Expenses.Add(expense);
        var threshold = await db.GymSettings.Select(x => (decimal?)x.HighExpenseThreshold).FirstOrDefaultAsync(ct) ?? 50000;
        if (expense.Amount >= threshold)
            db.Notifications.Add(new Notification { Kind = NotificationKind.HighExpense, Title = "High expense recorded", Message = $"An expense of Rs. {expense.Amount:N0} was recorded.", ActionUrl = "/expenses" });
        audit.Add("EXPENSE_CREATED", nameof(Expense), expense.Id, current: request);
        await db.SaveChangesAsync(ct);
        return await GetExpenseAsync(expense.Id, ct);
    }

    public async Task<ExpenseView> UpdateExpenseAsync(Guid id, ExpenseRequest request, CancellationToken ct)
    {
        await EnsureExpenseReferencesAsync(request, ct);
        var expense = await db.Expenses.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Expense not found.");
        var previous = new { expense.CategoryId, expense.Description, expense.Amount, expense.ExpenseDate, expense.PaymentMethodId, expense.ReferenceNumber, expense.Notes };
        expense.CategoryId = request.CategoryId;
        expense.Description = request.Description.Trim();
        expense.Amount = request.Amount;
        expense.ExpenseDate = request.ExpenseDate;
        expense.PaymentMethodId = request.PaymentMethodId;
        expense.ReferenceNumber = TrimOrNull(request.ReferenceNumber);
        expense.Notes = TrimOrNull(request.Notes);
        audit.Add("EXPENSE_UPDATED", nameof(Expense), expense.Id, previous, request);
        await db.SaveChangesAsync(ct);
        return await GetExpenseAsync(id, ct);
    }

    public async Task DeleteExpenseAsync(Guid id, CancellationToken ct)
    {
        var expense = await db.Expenses.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Expense not found.");
        expense.IsDeleted = true;
        audit.Add("EXPENSE_DELETED", nameof(Expense), expense.Id, new { expense.ExpenseNumber, expense.Amount });
        await db.SaveChangesAsync(ct);
    }

    public async Task<ExpenseSummary> GetExpenseSummaryAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var currentStart = now.Day >= 10
            ? new DateTimeOffset(now.Year, now.Month, 10, 0, 0, 0, TimeSpan.Zero)
            : new DateTimeOffset(now.Year, now.Month, 10, 0, 0, 0, TimeSpan.Zero).AddMonths(-1);
        var previousStart = currentStart.AddMonths(-1);
        var current = await db.Expenses.Where(x => x.ExpenseDate >= currentStart).SumAsync(x => x.Amount, ct);
        var previous = await db.Expenses.Where(x => x.ExpenseDate >= previousStart && x.ExpenseDate < currentStart).SumAsync(x => x.Amount, ct);
        var largest = await db.Expenses.Where(x => x.ExpenseDate >= currentStart).GroupBy(x => x.Category.Name)
            .Select(x => new { Name = x.Key, Total = x.Sum(v => v.Amount) }).OrderByDescending(x => x.Total).FirstOrDefaultAsync(ct);
        var change = previous == 0 ? (current == 0 ? 0 : 100) : Math.Round((current - previous) / previous * 100, 2);
        return new ExpenseSummary(current, largest?.Name, change);
    }

    private IQueryable<Payment> PaymentSource() => db.Payments.AsNoTracking().Where(x => !x.IsVoided)
        .Include(x => x.Member).Include(x => x.Membership)!.ThenInclude(x => x!.Plan)
        .Include(x => x.PaymentMethod).Include(x => x.ReceivedByUser);

    private IQueryable<Expense> ExpenseSource() => db.Expenses.AsNoTracking()
        .Include(x => x.Category).Include(x => x.PaymentMethod).Include(x => x.AddedByUser);

    internal static ExpenseView MapExpense(Expense x) => new(x.Id, x.ExpenseNumber, x.ExpenseDate, x.CategoryId,
        x.Category.Name, x.Description, x.Amount, x.PaymentMethodId, x.PaymentMethod.Name, x.AddedByUser.Name,
        x.ReferenceNumber, x.Notes);

    private async Task EnsureExpenseReferencesAsync(ExpenseRequest request, CancellationToken ct)
    {
        if (!await db.ExpenseCategories.AnyAsync(x => x.Id == request.CategoryId && x.IsActive, ct))
            throw new ValidationException("The selected expense category is unavailable.");
        if (!await db.PaymentMethods.AnyAsync(x => x.Id == request.PaymentMethodId && x.IsActive, ct))
            throw new ValidationException("The selected payment method is unavailable.");
    }

    private async Task RecalculatePaymentBalancesAsync(Membership membership, CancellationToken ct)
    {
        var payments = await db.Payments.Where(x => x.MembershipId == membership.Id && !x.IsVoided)
            .OrderBy(x => x.PaymentDate).ThenBy(x => x.CreatedAt).ToListAsync(ct);
        decimal cumulative = 0;
        foreach (var row in payments)
        {
            cumulative += row.AmountPaid;
            row.RemainingAmount = Math.Max(0, membership.FinalFee - cumulative);
        }
    }

    private async Task<string> GeneratePaymentNumberAsync(CancellationToken ct)
    {
        for (var i = 0; i < 5; i++)
        {
            var value = $"PAY-{DateTime.UtcNow:yyyyMMdd}-{RandomNumberGenerator.GetInt32(1000, 9999)}";
            if (!await db.Payments.AnyAsync(x => x.PaymentNumber == value, ct)) return value;
        }
        return $"PAY-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}";
    }

    private async Task<string> GenerateExpenseNumberAsync(CancellationToken ct)
    {
        for (var i = 0; i < 5; i++)
        {
            var value = $"EXP-{DateTime.UtcNow:yyyyMMdd}-{RandomNumberGenerator.GetInt32(1000, 9999)}";
            if (!await db.Expenses.IgnoreQueryFilters().AnyAsync(x => x.ExpenseNumber == value, ct)) return value;
        }
        return $"EXP-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}";
    }

    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
