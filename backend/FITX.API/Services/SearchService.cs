using FITX.API.Contracts;
using FITX.API.Data;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface ISearchService
{
    Task<GlobalSearchResult> SearchAsync(string query, CancellationToken ct);
}

public sealed class SearchService(FitxDbContext db) : ISearchService
{
    public async Task<GlobalSearchResult> SearchAsync(string query, CancellationToken ct)
    {
        var term = query.Trim();
        if (term.Length < 2) return new GlobalSearchResult([]);
        var members = await db.Members.AsNoTracking()
            .Where(x => x.FullName.Contains(term) || x.MemberCode.Contains(term) || x.Phone.Contains(term) || (x.Email != null && x.Email.Contains(term)))
            .OrderBy(x => x.FullName).Take(8)
            .Select(x => new GlobalSearchItem("member", x.Id, x.FullName, x.MemberCode + " · " + x.Phone, "/members/" + x.Id)).ToListAsync(ct);
        var payments = await db.Payments.AsNoTracking().Where(x => !x.IsVoided && (x.PaymentNumber.Contains(term) || x.Member.FullName.Contains(term) || x.Member.MemberCode.Contains(term)))
            .OrderByDescending(x => x.PaymentDate).Take(8)
            .Select(x => new GlobalSearchItem("payment", x.Id, x.PaymentNumber, x.Member.FullName, "/payments/" + x.Id)).ToListAsync(ct);
        return new GlobalSearchResult(members.Concat(payments).Take(12).ToList());
    }
}
