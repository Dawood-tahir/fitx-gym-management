using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface IDashboardService
{
    Task<DashboardResponse> GetAsync(string range, CancellationToken ct);
}

public sealed class DashboardService(FitxDbContext db) : IDashboardService
{
    public async Task<DashboardResponse> GetAsync(string range, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var warningDays = await db.GymSettings.Select(x => (int?)x.ExpiringSoonDays).FirstOrDefaultAsync(ct) ?? 7;
        var months = range.ToLowerInvariant() switch { "12m" or "last12months" => 12, "year" or "thisyear" => now.Month, _ => 6 };
        var trendStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero).AddMonths(-(months - 1));
        var currentStart = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero);
        var previousStart = currentStart.AddMonths(-1);

        var revenueRows = await db.Payments.AsNoTracking().Where(x => !x.IsVoided && x.PaymentDate >= trendStart)
            .GroupBy(x => new { x.PaymentDate.Year, x.PaymentDate.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Value = x.Sum(v => v.AmountPaid) }).ToListAsync(ct);
        var expenseRows = await db.Expenses.AsNoTracking().Where(x => x.ExpenseDate >= trendStart)
            .GroupBy(x => new { x.ExpenseDate.Year, x.ExpenseDate.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Value = x.Sum(v => v.Amount) }).ToListAsync(ct);
        var memberRows = await db.Members.AsNoTracking().Where(x => x.CreatedAt >= trendStart)
            .GroupBy(x => new { x.CreatedAt.Year, x.CreatedAt.Month })
            .Select(x => new { x.Key.Year, x.Key.Month, Value = x.Count() }).ToListAsync(ct);

        var chart = new List<ChartPoint>();
        for (var i = 0; i < months; i++)
        {
            var month = trendStart.AddMonths(i);
            var revenue = revenueRows.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Value ?? 0;
            var expenses = expenseRows.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Value ?? 0;
            var newMembers = memberRows.FirstOrDefault(x => x.Year == month.Year && x.Month == month.Month)?.Value ?? 0;
            chart.Add(new ChartPoint(month.ToString("MMM yyyy"), revenue, expenses, revenue - expenses, newMembers));
        }

        var memberships = await db.Memberships.AsNoTracking().Where(x => x.IsCurrent)
            .Include(x => x.Plan).Include(x => x.Payments).ToListAsync(ct);
        var active = memberships.Count(x => x.ExpiryDate > today.AddDays(warningDays));
        var expiring = memberships.Count(x => x.ExpiryDate >= today && x.ExpiryDate <= today.AddDays(warningDays));
        var expired = memberships.Count(x => x.ExpiryDate < today);
        var unpaidCount = memberships.Count(x => x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) < x.FinalFee);

        var currentRevenue = await db.Payments.Where(x => !x.IsVoided && x.PaymentDate >= currentStart).SumAsync(x => x.AmountPaid, ct);
        var previousRevenue = await db.Payments.Where(x => !x.IsVoided && x.PaymentDate >= previousStart && x.PaymentDate < currentStart).SumAsync(x => x.AmountPaid, ct);
        var currentExpenses = await db.Expenses.Where(x => x.ExpenseDate >= currentStart).SumAsync(x => x.Amount, ct);
        var previousExpenses = await db.Expenses.Where(x => x.ExpenseDate >= previousStart && x.ExpenseDate < currentStart).SumAsync(x => x.Amount, ct);
        var currentProfit = currentRevenue - currentExpenses;
        var previousProfit = previousRevenue - previousExpenses;
        var previousMemberCount = await db.Members.CountAsync(x => x.CreatedAt < currentStart, ct);

        var kpis = new List<KpiCard>
        {
            new("activeMembers", active, Percent(active, previousMemberCount), "count"),
            new("expiringSoon", expiring, null, "count"),
            new("unpaidFees", unpaidCount, null, "count"),
            new("monthlyRevenue", currentRevenue, Percent(currentRevenue, previousRevenue), "PKR"),
            new("expenses", currentExpenses, Percent(currentExpenses, previousExpenses), "PKR"),
            new("netProfit", currentProfit, Percent(currentProfit, previousProfit), "PKR")
        };

        var membershipDistribution = new List<DistributionPoint>
        {
            new("Active", active), new("ExpiringSoon", expiring), new("Expired", expired)
        };
        var paidMemberships = memberships.Count(x => x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) >= x.FinalFee);
        var paymentDistribution = new List<DistributionPoint> { new("Paid", paidMemberships), new("Unpaid", memberships.Count - paidMemberships) };
        var planDistribution = memberships.GroupBy(x => x.Plan.Name).Select(x => new DistributionPoint(x.Key, x.Count())).OrderByDescending(x => x.Value).ToList();

        var recentMembersRaw = await db.Members.AsNoTracking().Include(x => x.Memberships.Where(m => m.IsCurrent)).ThenInclude(x => x.Plan)
            .Include(x => x.Memberships.Where(m => m.IsCurrent)).ThenInclude(x => x.Payments)
            .OrderByDescending(x => x.CreatedAt).Take(5).ToListAsync(ct);
        var recentMembers = recentMembersRaw.Select(member =>
        {
            var membership = member.Memberships.SingleOrDefault();
            var view = membership is null ? null : MemberService.MapMembership(membership, warningDays, today);
            var payState = view is null || view.AmountPaid == 0 ? PaymentState.Unpaid : view.Balance > 0 ? PaymentState.Partial : PaymentState.Paid;
            return new MemberListItem(member.Id, member.MemberCode, member.FullName, member.Phone, member.Email, view, view?.Status ?? "Expired", payState.ToString());
        }).ToList();
        var paymentRows = await db.Payments.AsNoTracking().Where(x => !x.IsVoided).Include(x => x.Member).Include(x => x.Membership)!.ThenInclude(x => x!.Plan)
            .Include(x => x.PaymentMethod).Include(x => x.ReceivedByUser).OrderByDescending(x => x.PaymentDate).Take(5).ToListAsync(ct);
        var expenseRowsRecent = await db.Expenses.AsNoTracking().Include(x => x.Category).Include(x => x.PaymentMethod).Include(x => x.AddedByUser)
            .OrderByDescending(x => x.ExpenseDate).Take(5).ToListAsync(ct);

        return new DashboardResponse(kpis, chart, membershipDistribution, paymentDistribution, planDistribution,
            recentMembers, paymentRows.Select(MemberService.MapPayment).ToList(), expenseRowsRecent.Select(FinanceService.MapExpense).ToList());
    }

    private static decimal? Percent(decimal current, decimal previous) => previous == 0 ? current == 0 ? 0 : 100 : Math.Round((current - previous) / Math.Abs(previous) * 100, 2);
}
