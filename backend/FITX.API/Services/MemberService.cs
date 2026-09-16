using System.Security.Cryptography;
using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using FITX.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface IMemberService
{
    Task<PagedResult<MemberListItem>> ListAsync(MemberQuery query, CancellationToken ct);
    Task<MemberDetails> GetAsync(Guid id, CancellationToken ct);
    Task<MemberDetails> CreateAsync(CreateMemberRequest request, Guid actorId, CancellationToken ct);
    Task<MemberDetails> UpdateAsync(Guid id, UpdateMemberRequest request, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
    Task<RenewalView> RenewAsync(Guid memberId, RenewMembershipRequest request, Guid actorId, CancellationToken ct);
    Task<PagedResult<RenewalView>> ListRenewalsAsync(PageQuery query, Guid? memberId, CancellationToken ct);
}

public sealed class MemberService(FitxDbContext db, IAuditWriter audit) : IMemberService
{
    public async Task<PagedResult<MemberListItem>> ListAsync(MemberQuery query, CancellationToken ct)
    {
        var warningDays = await GetWarningDaysAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var source = db.Members.AsNoTracking()
            .Include(x => x.Memberships.Where(m => m.IsCurrent)).ThenInclude(x => x.Plan)
            .Include(x => x.Memberships.Where(m => m.IsCurrent)).ThenInclude(x => x.Payments)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            source = source.Where(x => x.FullName.Contains(term) || x.Phone.Contains(term) ||
                                       x.MemberCode.Contains(term) || (x.Email != null && x.Email.Contains(term)));
        }
        if (query.PlanId.HasValue)
            source = source.Where(x => x.Memberships.Any(m => m.IsCurrent && m.PlanId == query.PlanId));
        if (query.MembershipStatus.HasValue)
        {
            source = query.MembershipStatus.Value switch
            {
                MembershipState.Active => source.Where(x => x.Memberships.Any(m => m.IsCurrent && m.ExpiryDate > today.AddDays(warningDays))),
                MembershipState.ExpiringSoon => source.Where(x => x.Memberships.Any(m => m.IsCurrent && m.ExpiryDate >= today && m.ExpiryDate <= today.AddDays(warningDays))),
                MembershipState.Expired => source.Where(x => x.Memberships.Any(m => m.IsCurrent && m.ExpiryDate < today)),
                _ => source
            };
        }
        if (query.PaymentStatus.HasValue)
        {
            source = query.PaymentStatus.Value switch
            {
                PaymentState.Paid => source.Where(x => x.Memberships.Any(m => m.IsCurrent &&
                    m.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) >= m.FinalFee)),
                PaymentState.Partial => source.Where(x => x.Memberships.Any(m => m.IsCurrent &&
                    m.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) > 0 &&
                    m.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) < m.FinalFee)),
                PaymentState.Unpaid => source.Where(x => x.Memberships.Any(m => m.IsCurrent &&
                    m.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid) == 0)),
                _ => source
            };
        }

        source = (query.SortBy?.ToLowerInvariant(), query.Descending) switch
        {
            ("name", true) => source.OrderByDescending(x => x.FullName),
            ("name", false) => source.OrderBy(x => x.FullName),
            ("createdat", false) => source.OrderBy(x => x.CreatedAt),
            _ => source.OrderByDescending(x => x.CreatedAt)
        };

        var count = await source.CountAsync(ct);
        var members = await source.Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        var items = members.Select(x => MapListItem(x, warningDays, today)).ToList();
        return new PagedResult<MemberListItem>(items, query.Page, query.PageSize, count);
    }

    public async Task<MemberDetails> GetAsync(Guid id, CancellationToken ct)
    {
        var warningDays = await GetWarningDaysAsync(ct);
        var member = await db.Members.AsNoTracking()
            .Include(x => x.Memberships).ThenInclude(x => x.Plan)
            .Include(x => x.Memberships).ThenInclude(x => x.Payments)
            .Include(x => x.Payments).ThenInclude(x => x.PaymentMethod)
            .Include(x => x.Payments).ThenInclude(x => x.ReceivedByUser)
            .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Member not found.");

        var renewalRows = await db.MembershipRenewals.AsNoTracking()
            .Include(x => x.Member)
            .Include(x => x.PreviousMembership).ThenInclude(x => x.Plan)
            .Include(x => x.NewMembership).ThenInclude(x => x.Plan)
            .Where(x => x.MemberId == id).OrderByDescending(x => x.RenewalDate).ToListAsync(ct);
        return MapDetails(member, renewalRows, warningDays);
    }

    public async Task<MemberDetails> CreateAsync(CreateMemberRequest request, Guid actorId, CancellationToken ct)
    {
        var plan = await db.MembershipPlans.SingleOrDefaultAsync(x => x.Id == request.PlanId && x.IsActive, ct)
            ?? throw new ValidationException("The selected membership plan is unavailable.");
        if (request.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
            throw new ValidationException("Date of birth cannot be in the future.");
        if (request.Discount > (request.MembershipFee ?? plan.Price))
            throw new ValidationException("Discount cannot exceed the membership fee.");

        var fee = request.MembershipFee ?? plan.Price;
        var finalFee = fee - request.Discount;
        if (request.AmountPaid > finalFee) throw new ValidationException("Payment amount cannot exceed the payable membership fee.");
        if (request.AmountPaid > 0 && request.PaymentMethodId is null)
            throw new ValidationException("A payment method is required when an initial payment is recorded.");
        if (request.PaymentMethodId.HasValue)
            await EnsurePaymentMethodAsync(request.PaymentMethodId.Value, ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var joiningDate = request.JoiningDate == default ? today : request.JoiningDate;
        var startDate = request.MembershipStartDate == default ? joiningDate : request.MembershipStartDate;
        var member = new Member
        {
            MemberCode = await GenerateMemberCodeAsync(ct), FullName = request.FullName.Trim(), Phone = request.Phone.Trim(),
            Email = NormalizeOptionalEmail(request.Email), NationalId = TrimOrNull(request.NationalId), Gender = TrimOrNull(request.Gender),
            DateOfBirth = request.DateOfBirth, Address = TrimOrNull(request.Address), Notes = TrimOrNull(request.Notes)
        };
        var membership = new Membership
        {
            Member = member, Plan = plan, JoiningDate = joiningDate, StartDate = startDate,
            ExpiryDate = startDate.AddDays(plan.DurationDays - 1), Fee = fee, Discount = request.Discount,
            FinalFee = finalFee, Notes = TrimOrNull(request.Notes)
        };
        db.Members.Add(member);
        db.Memberships.Add(membership);

        if (request.AmountPaid > 0)
        {
            db.Payments.Add(new Payment
            {
                PaymentNumber = await GeneratePaymentNumberAsync(ct), Member = member, Membership = membership,
                PaymentMethodId = request.PaymentMethodId!.Value, TotalFee = fee, Discount = request.Discount,
                PayableAmount = finalFee, AmountPaid = request.AmountPaid, RemainingAmount = finalFee - request.AmountPaid,
                PaymentDate = DateTimeOffset.UtcNow, ReferenceNumber = TrimOrNull(request.PaymentReference), ReceivedByUserId = actorId
            });
        }

        audit.Add("MEMBER_CREATED", nameof(Member), member.Id, current: new { member.MemberCode, member.FullName, Plan = plan.Name });
        await db.SaveChangesAsync(ct);
        return await GetAsync(member.Id, ct);
    }

    public async Task<MemberDetails> UpdateAsync(Guid id, UpdateMemberRequest request, CancellationToken ct)
    {
        var member = await db.Members.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Member not found.");
        if (request.DateOfBirth > DateOnly.FromDateTime(DateTime.UtcNow))
            throw new ValidationException("Date of birth cannot be in the future.");
        var previous = new { member.FullName, member.Phone, member.Email, member.NationalId, member.Gender, member.DateOfBirth, member.Address, member.Notes };
        member.FullName = request.FullName.Trim();
        member.Phone = request.Phone.Trim();
        member.Email = NormalizeOptionalEmail(request.Email);
        member.NationalId = TrimOrNull(request.NationalId);
        member.Gender = TrimOrNull(request.Gender);
        member.DateOfBirth = request.DateOfBirth;
        member.Address = TrimOrNull(request.Address);
        member.Notes = TrimOrNull(request.Notes);
        audit.Add("MEMBER_UPDATED", nameof(Member), member.Id, previous, request);
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        var member = await db.Members.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Member not found.");
        member.IsDeleted = true;
        audit.Add("MEMBER_DELETED", nameof(Member), member.Id, new { member.MemberCode, member.FullName });
        await db.SaveChangesAsync(ct);
    }

    public async Task<RenewalView> RenewAsync(Guid memberId, RenewMembershipRequest request, Guid actorId, CancellationToken ct)
    {
        var member = await db.Members.SingleOrDefaultAsync(x => x.Id == memberId, ct) ?? throw new NotFoundException("Member not found.");
        var previous = await db.Memberships.Include(x => x.Plan).SingleOrDefaultAsync(x => x.MemberId == memberId && x.IsCurrent, ct)
            ?? throw new ValidationException("This member has no current membership to renew.");
        var plan = await db.MembershipPlans.SingleOrDefaultAsync(x => x.Id == request.PlanId && x.IsActive, ct)
            ?? throw new ValidationException("The selected membership plan is unavailable.");
        var fee = request.MembershipFee ?? plan.Price;
        if (request.Discount > fee) throw new ValidationException("Discount cannot exceed the membership fee.");
        var payable = fee - request.Discount;
        if (request.AmountPaid > payable) throw new ValidationException("Payment amount cannot exceed the payable membership fee.");
        if (request.AmountPaid > 0 && request.PaymentMethodId is null)
            throw new ValidationException("A payment method is required when a payment is recorded.");
        if (request.PaymentMethodId.HasValue) await EnsurePaymentMethodAsync(request.PaymentMethodId.Value, ct);

        var renewalDate = request.RenewalDate == default ? DateOnly.FromDateTime(DateTime.UtcNow) : request.RenewalDate;
        var nextDay = previous.ExpiryDate.AddDays(1);
        var startDate = nextDay > renewalDate ? nextDay : renewalDate;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        previous.IsCurrent = false;
        var membership = new Membership
        {
            MemberId = memberId, PlanId = plan.Id, JoiningDate = previous.JoiningDate, StartDate = startDate,
            ExpiryDate = startDate.AddDays(plan.DurationDays - 1), Fee = fee, Discount = request.Discount,
            FinalFee = payable, Notes = TrimOrNull(request.Notes), IsCurrent = true
        };
        db.Memberships.Add(membership);
        Payment? payment = null;
        if (request.AmountPaid > 0)
        {
            payment = new Payment
            {
                PaymentNumber = await GeneratePaymentNumberAsync(ct), MemberId = memberId, Membership = membership,
                PaymentMethodId = request.PaymentMethodId!.Value, TotalFee = fee, Discount = request.Discount,
                PayableAmount = payable, AmountPaid = request.AmountPaid, RemainingAmount = payable - request.AmountPaid,
                PaymentDate = DateTimeOffset.UtcNow, ReferenceNumber = TrimOrNull(request.ReferenceNumber),
                Notes = TrimOrNull(request.Notes), ReceivedByUserId = actorId
            };
            db.Payments.Add(payment);
        }
        var renewal = new MembershipRenewal
        {
            MemberId = memberId, PreviousMembership = previous, NewMembership = membership,
            RenewalDate = renewalDate, AmountPaid = request.AmountPaid, Payment = payment, CreatedByUserId = actorId
        };
        db.MembershipRenewals.Add(renewal);
        db.Notifications.Add(new Notification
        {
            Kind = NotificationKind.MembershipRenewed, Title = "Membership renewed",
            Message = $"{member.FullName}'s {plan.Name} membership was renewed.", ActionUrl = $"/members/{memberId}"
        });
        audit.Add("MEMBERSHIP_RENEWED", nameof(Membership), membership.Id,
            new { PreviousMembershipId = previous.Id, PreviousExpiry = previous.ExpiryDate },
            new { Plan = plan.Name, membership.StartDate, membership.ExpiryDate, membership.FinalFee, request.AmountPaid });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return MapRenewal(renewal, member.FullName, previous.Plan.Name, plan.Name, membership.ExpiryDate);
    }

    public async Task<PagedResult<RenewalView>> ListRenewalsAsync(PageQuery query, Guid? memberId, CancellationToken ct)
    {
        var source = db.MembershipRenewals.AsNoTracking()
            .Include(x => x.Member).Include(x => x.PreviousMembership).ThenInclude(x => x.Plan)
            .Include(x => x.NewMembership).ThenInclude(x => x.Plan).AsQueryable();
        if (memberId.HasValue) source = source.Where(x => x.MemberId == memberId);
        if (!string.IsNullOrWhiteSpace(query.Search)) source = source.Where(x => x.Member.FullName.Contains(query.Search.Trim()));
        var count = await source.CountAsync(ct);
        var rows = await source.OrderByDescending(x => x.RenewalDate).ThenByDescending(x => x.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new PagedResult<RenewalView>(rows.Select(x => MapRenewal(x, x.Member.FullName, x.PreviousMembership.Plan.Name, x.NewMembership.Plan.Name, x.NewMembership.ExpiryDate)).ToList(), query.Page, query.PageSize, count);
    }

    internal static MembershipView MapMembership(Membership x, int warningDays, DateOnly today)
    {
        var paid = x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid);
        return new MembershipView(x.Id, x.PlanId, x.Plan.Name, x.JoiningDate, x.StartDate, x.ExpiryDate,
            x.Fee, x.Discount, x.FinalFee, paid, Math.Max(0, x.FinalFee - paid), x.GetState(today, warningDays).ToString(), x.IsCurrent);
    }

    internal static PaymentView MapPayment(Payment x) => new(
        x.Id, x.PaymentNumber, x.PaymentDate, x.MemberId, x.Member.FullName, x.Member.MemberCode,
        x.MembershipId, x.Membership?.Plan.Name, x.TotalFee, x.Discount, x.PayableAmount, x.AmountPaid,
        x.RemainingAmount, x.PaymentMethodId, x.PaymentMethod.Name, x.State.ToString(), x.ReceivedByUser.Name,
        x.ReferenceNumber, x.Notes);

    private static MemberListItem MapListItem(Member member, int warningDays, DateOnly today)
    {
        var membership = member.Memberships.SingleOrDefault(x => x.IsCurrent);
        var view = membership is null ? null : MapMembership(membership, warningDays, today);
        var paymentStatus = view is null || view.AmountPaid == 0 ? PaymentState.Unpaid : view.Balance > 0 ? PaymentState.Partial : PaymentState.Paid;
        return new MemberListItem(member.Id, member.MemberCode, member.FullName, member.Phone, member.Email, view,
            view?.Status ?? MembershipState.Expired.ToString(), paymentStatus.ToString());
    }

    private static MemberDetails MapDetails(Member member, IReadOnlyList<MembershipRenewal> renewals, int warningDays)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var history = member.Memberships.OrderByDescending(x => x.StartDate).Select(x => MapMembership(x, warningDays, today)).ToList();
        return new MemberDetails(member.Id, member.MemberCode, member.FullName, member.Phone, member.Email,
            member.NationalId, member.Gender, member.DateOfBirth, member.Address, member.Notes,
            history.FirstOrDefault(x => x.IsCurrent), history,
            member.Payments.Where(x => !x.IsVoided).OrderByDescending(x => x.PaymentDate).Select(MapPayment).ToList(),
            renewals.Select(x => MapRenewal(x, member.FullName, x.PreviousMembership.Plan.Name, x.NewMembership.Plan.Name, x.NewMembership.ExpiryDate)).ToList(), member.CreatedAt);
    }

    private static RenewalView MapRenewal(MembershipRenewal x, string member, string previousPlan, string newPlan, DateOnly newExpiry) =>
        new(x.Id, x.MemberId, member, previousPlan, newPlan, x.RenewalDate, newExpiry, x.AmountPaid, x.PaymentId, x.CreatedAt);

    private async Task<int> GetWarningDaysAsync(CancellationToken ct) =>
        await db.GymSettings.Select(x => (int?)x.ExpiringSoonDays).FirstOrDefaultAsync(ct) ?? 7;

    private async Task EnsurePaymentMethodAsync(Guid id, CancellationToken ct)
    {
        if (!await db.PaymentMethods.AnyAsync(x => x.Id == id && x.IsActive, ct))
            throw new ValidationException("The selected payment method is unavailable.");
    }

    private async Task<string> GenerateMemberCodeAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var code = $"FITX-{DateTime.UtcNow:yyMMdd}-{RandomNumberGenerator.GetInt32(1000, 9999)}";
            if (!await db.Members.IgnoreQueryFilters().AnyAsync(x => x.MemberCode == code, ct)) return code;
        }
        return $"FITX-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}";
    }

    internal async Task<string> GeneratePaymentNumberAsync(CancellationToken ct)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var number = $"PAY-{DateTime.UtcNow:yyyyMMdd}-{RandomNumberGenerator.GetInt32(1000, 9999)}";
            if (!await db.Payments.AnyAsync(x => x.PaymentNumber == number, ct)) return number;
        }
        return $"PAY-{Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()}";
    }

    private static string? NormalizeOptionalEmail(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
