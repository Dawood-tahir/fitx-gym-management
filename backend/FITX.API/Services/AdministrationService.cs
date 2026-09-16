using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using FITX.API.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface IAdministrationService
{
    Task<IReadOnlyList<PlanView>> ListPlansAsync(bool includeInactive, CancellationToken ct);
    Task<PlanView> CreatePlanAsync(PlanRequest request, CancellationToken ct);
    Task<PlanView> UpdatePlanAsync(Guid id, PlanRequest request, CancellationToken ct);
    Task DeletePlanAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<MethodView>> ListPaymentMethodsAsync(bool includeInactive, CancellationToken ct);
    Task<MethodView> CreatePaymentMethodAsync(NamedOptionRequest request, CancellationToken ct);
    Task<MethodView> UpdatePaymentMethodAsync(Guid id, NamedOptionRequest request, CancellationToken ct);
    Task DeletePaymentMethodAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<MethodView>> ListExpenseCategoriesAsync(bool includeInactive, CancellationToken ct);
    Task<MethodView> CreateExpenseCategoryAsync(NamedOptionRequest request, CancellationToken ct);
    Task<MethodView> UpdateExpenseCategoryAsync(Guid id, NamedOptionRequest request, CancellationToken ct);
    Task DeleteExpenseCategoryAsync(Guid id, CancellationToken ct);
    Task<GymSettingsView> GetGymSettingsAsync(CancellationToken ct);
    Task<GymSettingsView> UpdateGymSettingsAsync(GymSettingsRequest request, CancellationToken ct);
    Task UpdateLocaleAsync(Guid userId, string locale, CancellationToken ct);
    Task<PagedResult<UserSummary>> ListStaffAsync(StaffQuery query, CancellationToken ct);
    Task<UserSummary> CreateStaffAsync(CreateStaffRequest request, CancellationToken ct);
    Task<UserSummary> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid actorId, CancellationToken ct);
    Task DisableStaffAsync(Guid id, Guid actorId, CancellationToken ct);
    Task ResetStaffPasswordAsync(Guid id, string newPassword, CancellationToken ct);
    Task<PagedResult<NotificationView>> ListNotificationsAsync(PageQuery query, Guid userId, bool unreadOnly, CancellationToken ct);
    Task MarkNotificationReadAsync(Guid id, Guid userId, CancellationToken ct);
    Task MarkAllNotificationsReadAsync(Guid userId, CancellationToken ct);
    Task<PagedResult<AuditLogView>> ListAuditLogsAsync(PageQuery query, string? entityType, string? action, CancellationToken ct);
}

public sealed class AdministrationService(FitxDbContext db, IAuditWriter audit) : IAdministrationService
{
    public async Task<IReadOnlyList<PlanView>> ListPlansAsync(bool includeInactive, CancellationToken ct) =>
        await db.MembershipPlans.AsNoTracking().Where(x => includeInactive || x.IsActive).OrderBy(x => x.Price)
            .Select(x => new PlanView(x.Id, x.Name, x.DurationDays, x.Price, x.Description, x.IsActive, x.IsSystem)).ToListAsync(ct);

    public async Task<PlanView> CreatePlanAsync(PlanRequest request, CancellationToken ct)
    {
        if (await db.MembershipPlans.AnyAsync(x => x.Name == request.Name.Trim(), ct)) throw new ConflictException("A membership plan with this name already exists.");
        var entity = new MembershipPlan { Name = request.Name.Trim(), DurationDays = request.DurationDays, Price = request.Price, Description = TrimOrNull(request.Description), IsActive = request.IsActive };
        db.MembershipPlans.Add(entity);
        audit.Add("MEMBERSHIP_PLAN_CREATED", nameof(MembershipPlan), entity.Id, current: request);
        await db.SaveChangesAsync(ct);
        return MapPlan(entity);
    }

    public async Task<PlanView> UpdatePlanAsync(Guid id, PlanRequest request, CancellationToken ct)
    {
        var entity = await db.MembershipPlans.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Membership plan not found.");
        if (await db.MembershipPlans.AnyAsync(x => x.Id != id && x.Name == request.Name.Trim(), ct)) throw new ConflictException("A membership plan with this name already exists.");
        var previous = MapPlan(entity);
        entity.Name = request.Name.Trim(); entity.DurationDays = request.DurationDays; entity.Price = request.Price;
        entity.Description = TrimOrNull(request.Description); entity.IsActive = request.IsActive;
        audit.Add("MEMBERSHIP_PLAN_UPDATED", nameof(MembershipPlan), id, previous, request);
        await db.SaveChangesAsync(ct);
        return MapPlan(entity);
    }

    public async Task DeletePlanAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.MembershipPlans.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Membership plan not found.");
        if (await db.Memberships.AnyAsync(x => x.PlanId == id, ct))
        {
            entity.IsActive = false;
            audit.Add("MEMBERSHIP_PLAN_DISABLED", nameof(MembershipPlan), id, MapPlan(entity));
        }
        else
        {
            db.MembershipPlans.Remove(entity);
            audit.Add("MEMBERSHIP_PLAN_DELETED", nameof(MembershipPlan), id, MapPlan(entity));
        }
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<MethodView>> ListPaymentMethodsAsync(bool includeInactive, CancellationToken ct) =>
        await db.PaymentMethods.AsNoTracking().Where(x => includeInactive || x.IsActive).OrderBy(x => x.Name)
            .Select(x => new MethodView(x.Id, x.Name, x.IsActive, x.IsSystem)).ToListAsync(ct);

    public async Task<MethodView> CreatePaymentMethodAsync(NamedOptionRequest request, CancellationToken ct)
    {
        var entity = new PaymentMethod { Name = request.Name.Trim(), IsActive = request.IsActive };
        if (await db.PaymentMethods.AnyAsync(x => x.Name == entity.Name, ct)) throw new ConflictException("This payment method already exists.");
        db.PaymentMethods.Add(entity); audit.Add("PAYMENT_METHOD_CREATED", nameof(PaymentMethod), entity.Id, current: request);
        await db.SaveChangesAsync(ct); return new(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
    }

    public async Task<MethodView> UpdatePaymentMethodAsync(Guid id, NamedOptionRequest request, CancellationToken ct)
    {
        var entity = await db.PaymentMethods.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Payment method not found.");
        if (await db.PaymentMethods.AnyAsync(x => x.Id != id && x.Name == request.Name.Trim(), ct)) throw new ConflictException("This payment method already exists.");
        var previous = new MethodView(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
        entity.Name = request.Name.Trim(); entity.IsActive = request.IsActive;
        audit.Add("PAYMENT_METHOD_UPDATED", nameof(PaymentMethod), id, previous, request); await db.SaveChangesAsync(ct);
        return new(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
    }

    public async Task DeletePaymentMethodAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.PaymentMethods.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Payment method not found.");
        if (await db.Payments.AnyAsync(x => x.PaymentMethodId == id, ct) || await db.Expenses.AnyAsync(x => x.PaymentMethodId == id, ct)) entity.IsActive = false;
        else db.PaymentMethods.Remove(entity);
        audit.Add("PAYMENT_METHOD_REMOVED", nameof(PaymentMethod), id, new { entity.Name, Disabled = entity.IsActive == false });
        await db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<MethodView>> ListExpenseCategoriesAsync(bool includeInactive, CancellationToken ct) =>
        await db.ExpenseCategories.AsNoTracking().Where(x => includeInactive || x.IsActive).OrderBy(x => x.Name)
            .Select(x => new MethodView(x.Id, x.Name, x.IsActive, x.IsSystem)).ToListAsync(ct);

    public async Task<MethodView> CreateExpenseCategoryAsync(NamedOptionRequest request, CancellationToken ct)
    {
        var entity = new ExpenseCategory { Name = request.Name.Trim(), IsActive = request.IsActive };
        if (await db.ExpenseCategories.AnyAsync(x => x.Name == entity.Name, ct)) throw new ConflictException("This expense category already exists.");
        db.ExpenseCategories.Add(entity); audit.Add("EXPENSE_CATEGORY_CREATED", nameof(ExpenseCategory), entity.Id, current: request);
        await db.SaveChangesAsync(ct); return new(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
    }

    public async Task<MethodView> UpdateExpenseCategoryAsync(Guid id, NamedOptionRequest request, CancellationToken ct)
    {
        var entity = await db.ExpenseCategories.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Expense category not found.");
        if (await db.ExpenseCategories.AnyAsync(x => x.Id != id && x.Name == request.Name.Trim(), ct)) throw new ConflictException("This expense category already exists.");
        var previous = new MethodView(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
        entity.Name = request.Name.Trim(); entity.IsActive = request.IsActive;
        audit.Add("EXPENSE_CATEGORY_UPDATED", nameof(ExpenseCategory), id, previous, request); await db.SaveChangesAsync(ct);
        return new(entity.Id, entity.Name, entity.IsActive, entity.IsSystem);
    }

    public async Task DeleteExpenseCategoryAsync(Guid id, CancellationToken ct)
    {
        var entity = await db.ExpenseCategories.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Expense category not found.");
        if (await db.Expenses.IgnoreQueryFilters().AnyAsync(x => x.CategoryId == id, ct)) entity.IsActive = false;
        else db.ExpenseCategories.Remove(entity);
        audit.Add("EXPENSE_CATEGORY_REMOVED", nameof(ExpenseCategory), id, new { entity.Name, Disabled = entity.IsActive == false });
        await db.SaveChangesAsync(ct);
    }

    public async Task<GymSettingsView> GetGymSettingsAsync(CancellationToken ct)
    {
        var entity = await db.GymSettings.AsNoTracking().FirstOrDefaultAsync(ct) ?? new GymSetting();
        return MapSettings(entity);
    }

    public async Task<GymSettingsView> UpdateGymSettingsAsync(GymSettingsRequest request, CancellationToken ct)
    {
        var entity = await db.GymSettings.FirstOrDefaultAsync(ct);
        if (entity is null) { entity = new GymSetting(); db.GymSettings.Add(entity); }
        var previous = MapSettings(entity);
        entity.GymName = request.GymName.Trim(); entity.Phone = TrimOrNull(request.Phone); entity.Email = NormalizeEmail(request.Email);
        entity.Address = TrimOrNull(request.Address); entity.LogoUrl = TrimOrNull(request.LogoUrl); entity.Currency = request.Currency.ToUpperInvariant();
        entity.Timezone = request.Timezone.Trim(); entity.DefaultLocale = request.DefaultLocale; entity.ExpiringSoonDays = request.ExpiringSoonDays;
        entity.HighExpenseThreshold = request.HighExpenseThreshold;
        audit.Add("GYM_SETTINGS_UPDATED", nameof(GymSetting), entity.Id, previous, request); await db.SaveChangesAsync(ct);
        return MapSettings(entity);
    }

    public async Task UpdateLocaleAsync(Guid userId, string locale, CancellationToken ct)
    {
        if (locale is not ("en" or "ur")) throw new ValidationException("Supported locales are en and ur.");
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId, ct) ?? throw new NotFoundException("User not found.");
        user.Locale = locale; await db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<UserSummary>> ListStaffAsync(StaffQuery query, CancellationToken ct)
    {
        var source = db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Search)) { var term = query.Search.Trim(); source = source.Where(x => x.Name.Contains(term) || x.Email.Contains(term) || (x.Phone != null && x.Phone.Contains(term))); }
        if (query.Role.HasValue) source = source.Where(x => x.Role == query.Role);
        if (query.Status.HasValue) source = source.Where(x => x.Status == query.Status);
        var count = await source.CountAsync(ct);
        var rows = await source.OrderBy(x => x.Name).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new(rows.Select(MapUser).ToList(), query.Page, query.PageSize, count);
    }

    public async Task<UserSummary> CreateStaffAsync(CreateStaffRequest request, CancellationToken ct)
    {
        Infrastructure.AuthService.ValidatePassword(request.Password);
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) throw new ConflictException("A user with this email already exists.");
        var user = new User { Name = request.Name.Trim(), Phone = TrimOrNull(request.Phone), Email = email, PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, 12), Role = request.Role };
        db.Users.Add(user); audit.Add("STAFF_CREATED", nameof(User), user.Id, current: new { user.Name, user.Email, user.Role });
        await db.SaveChangesAsync(ct); return MapUser(user);
    }

    public async Task<UserSummary> UpdateStaffAsync(Guid id, UpdateStaffRequest request, Guid actorId, CancellationToken ct)
    {
        if (id == actorId && request.Status == UserStatus.Disabled) throw new ValidationException("You cannot disable your own account.");
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Staff user not found.");
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Id != id && x.Email == email, ct)) throw new ConflictException("A user with this email already exists.");
        var previous = MapUser(user);
        user.Name = request.Name.Trim(); user.Phone = TrimOrNull(request.Phone); user.Email = email; user.Role = request.Role; user.Status = request.Status;
        audit.Add("STAFF_UPDATED", nameof(User), id, previous, new { user.Name, user.Email, user.Role, user.Status });
        await db.SaveChangesAsync(ct); return MapUser(user);
    }

    public async Task DisableStaffAsync(Guid id, Guid actorId, CancellationToken ct)
    {
        if (id == actorId) throw new ValidationException("You cannot disable your own account.");
        var user = await db.Users.Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Staff user not found.");
        if (user.Role == UserRole.Owner && await db.Users.CountAsync(x => x.Role == UserRole.Owner && x.Status == UserStatus.Active, ct) <= 1)
            throw new ValidationException("The last active owner cannot be disabled.");
        user.Status = UserStatus.Disabled;
        foreach (var token in user.RefreshTokens.Where(x => x.RevokedAt is null)) token.RevokedAt = DateTimeOffset.UtcNow;
        audit.Add("STAFF_DISABLED", nameof(User), id, new { user.Name, user.Email, user.Role }); await db.SaveChangesAsync(ct);
    }

    public async Task ResetStaffPasswordAsync(Guid id, string newPassword, CancellationToken ct)
    {
        Infrastructure.AuthService.ValidatePassword(newPassword);
        var user = await db.Users.Include(x => x.RefreshTokens).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Staff user not found.");
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword, 12);
        foreach (var token in user.RefreshTokens.Where(x => x.RevokedAt is null)) token.RevokedAt = DateTimeOffset.UtcNow;
        audit.Add("STAFF_PASSWORD_RESET", nameof(User), id); await db.SaveChangesAsync(ct);
    }

    public async Task<PagedResult<NotificationView>> ListNotificationsAsync(PageQuery query, Guid userId, bool unreadOnly, CancellationToken ct)
    {
        var source = db.Notifications.AsNoTracking().Where(x => x.UserId == null || x.UserId == userId);
        if (unreadOnly) source = source.Where(x => !x.IsRead);
        var count = await source.CountAsync(ct);
        var rows = await source.OrderByDescending(x => x.CreatedAt).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new NotificationView(x.Id, x.Kind.ToString(), x.Title, x.Message, x.ActionUrl, x.IsRead, x.CreatedAt)).ToListAsync(ct);
        return new(rows, query.Page, query.PageSize, count);
    }

    public async Task MarkNotificationReadAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var entity = await db.Notifications.SingleOrDefaultAsync(x => x.Id == id && (x.UserId == null || x.UserId == userId), ct) ?? throw new NotFoundException("Notification not found.");
        entity.IsRead = true; entity.ReadAt = DateTimeOffset.UtcNow; await db.SaveChangesAsync(ct);
    }

    public async Task MarkAllNotificationsReadAsync(Guid userId, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        await db.Notifications.Where(x => !x.IsRead && (x.UserId == null || x.UserId == userId))
            .ExecuteUpdateAsync(x => x.SetProperty(v => v.IsRead, true).SetProperty(v => v.ReadAt, now).SetProperty(v => v.UpdatedAt, now), ct);
    }

    public async Task<PagedResult<AuditLogView>> ListAuditLogsAsync(PageQuery query, string? entityType, string? action, CancellationToken ct)
    {
        var source = db.AuditLogs.AsNoTracking().Include(x => x.User).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entityType)) source = source.Where(x => x.EntityType == entityType);
        if (!string.IsNullOrWhiteSpace(action)) source = source.Where(x => x.Action == action);
        if (!string.IsNullOrWhiteSpace(query.Search)) { var term = query.Search.Trim(); source = source.Where(x => x.Action.Contains(term) || x.EntityType.Contains(term) || (x.EntityId != null && x.EntityId.Contains(term))); }
        var count = await source.CountAsync(ct);
        var rows = await source.OrderByDescending(x => x.CreatedAt).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(x => new AuditLogView(x.Id, x.User == null ? null : x.User.Name, x.Action, x.EntityType, x.EntityId, x.IpAddress, x.PreviousValuesJson, x.NewValuesJson, x.CreatedAt)).ToListAsync(ct);
        return new(rows, query.Page, query.PageSize, count);
    }

    private static PlanView MapPlan(MembershipPlan x) => new(x.Id, x.Name, x.DurationDays, x.Price, x.Description, x.IsActive, x.IsSystem);
    private static GymSettingsView MapSettings(GymSetting x) => new(x.Id, x.GymName, x.Phone, x.Email, x.Address, x.LogoUrl, x.Currency, x.Timezone, x.DefaultLocale, x.ExpiringSoonDays, x.HighExpenseThreshold);
    private static UserSummary MapUser(User x) => new(x.Id, x.Name, x.Phone, x.Email, x.Role.ToString().ToUpperInvariant(), x.Status.ToString().ToUpperInvariant(), x.Locale, x.LastLoginAt);
    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string? NormalizeEmail(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();
}
