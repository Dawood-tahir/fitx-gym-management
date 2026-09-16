using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using FITX.API.Domain;
using FITX.API.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace FITX.API.Services;

public sealed class ReminderProviderOptions
{
    public string Mode { get; init; } = "Disabled";
}

public sealed record ReminderDelivery(ReminderDeliveryState State, string Response);

public interface IReminderProvider
{
    string Mode { get; }
    Task<ReminderDelivery> SendAsync(ReminderChannel channel, string recipient, string message, CancellationToken ct);
}

public sealed class ConfigurableReminderProvider(IOptions<ReminderProviderOptions> options, ILogger<ConfigurableReminderProvider> logger) : IReminderProvider
{
    public string Mode => options.Value.Mode;

    public Task<ReminderDelivery> SendAsync(ReminderChannel channel, string recipient, string message, CancellationToken ct)
    {
        if (string.Equals(Mode, "Mock", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Mock reminder: {Channel} to {Recipient}; {Length} characters", channel, recipient, message.Length);
            return Task.FromResult(new ReminderDelivery(ReminderDeliveryState.Mocked, "Mock provider accepted the reminder."));
        }
        return Task.FromResult(new ReminderDelivery(ReminderDeliveryState.Skipped,
            "No reminder provider is configured. Set ReminderProviders:Mode=Mock for development or add a production adapter."));
    }
}

public interface IReminderService
{
    Task<IReadOnlyList<ReminderSettingView>> ListSettingsAsync(CancellationToken ct);
    Task<ReminderSettingView> CreateSettingAsync(ReminderSettingRequest request, CancellationToken ct);
    Task<ReminderSettingView> UpdateSettingAsync(Guid id, ReminderSettingRequest request, CancellationToken ct);
    Task<IReadOnlyList<ReminderCandidate>> ListCandidatesAsync(CancellationToken ct);
    Task<ReminderLogView> SendAsync(SendReminderRequest request, CancellationToken ct);
    Task<ReminderProcessResult> ProcessDueAsync(CancellationToken ct);
    Task<PagedResult<ReminderLogView>> ListLogsAsync(PageQuery query, CancellationToken ct);
}

public sealed class ReminderService(FitxDbContext db, IReminderProvider provider, IAuditWriter audit) : IReminderService
{
    public async Task<IReadOnlyList<ReminderSettingView>> ListSettingsAsync(CancellationToken ct) =>
        await db.ReminderSettings.AsNoTracking().OrderBy(x => x.Type).ThenBy(x => x.DayOffset)
            .Select(x => new ReminderSettingView(x.Id, x.Type.ToString(), x.Channel.ToString(), x.DayOffset, x.IsEnabled, x.TemplateEn, x.TemplateUr)).ToListAsync(ct);

    public async Task<ReminderSettingView> CreateSettingAsync(ReminderSettingRequest request, CancellationToken ct)
    {
        ValidateTemplate(request.TemplateEn); ValidateTemplate(request.TemplateUr);
        if (await db.ReminderSettings.AnyAsync(x => x.Type == request.Type && x.Channel == request.Channel && x.DayOffset == request.DayOffset, ct))
            throw new ConflictException("An equivalent reminder setting already exists.");
        var entity = new ReminderSetting { Type = request.Type, Channel = request.Channel, DayOffset = request.DayOffset, IsEnabled = request.IsEnabled, TemplateEn = request.TemplateEn.Trim(), TemplateUr = request.TemplateUr.Trim() };
        db.ReminderSettings.Add(entity); audit.Add("REMINDER_SETTING_CREATED", nameof(ReminderSetting), entity.Id, current: request);
        await db.SaveChangesAsync(ct); return MapSetting(entity);
    }

    public async Task<ReminderSettingView> UpdateSettingAsync(Guid id, ReminderSettingRequest request, CancellationToken ct)
    {
        ValidateTemplate(request.TemplateEn); ValidateTemplate(request.TemplateUr);
        var entity = await db.ReminderSettings.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw new NotFoundException("Reminder setting not found.");
        if (await db.ReminderSettings.AnyAsync(x => x.Id != id && x.Type == request.Type && x.Channel == request.Channel && x.DayOffset == request.DayOffset, ct))
            throw new ConflictException("An equivalent reminder setting already exists.");
        var previous = MapSetting(entity);
        entity.Type = request.Type; entity.Channel = request.Channel; entity.DayOffset = request.DayOffset;
        entity.IsEnabled = request.IsEnabled; entity.TemplateEn = request.TemplateEn.Trim(); entity.TemplateUr = request.TemplateUr.Trim();
        audit.Add("REMINDER_SETTING_UPDATED", nameof(ReminderSetting), id, previous, request); await db.SaveChangesAsync(ct);
        return MapSetting(entity);
    }

    public async Task<IReadOnlyList<ReminderCandidate>> ListCandidatesAsync(CancellationToken ct)
    {
        var warningDays = await db.GymSettings.Select(x => (int?)x.ExpiringSoonDays).FirstOrDefaultAsync(ct) ?? 7;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rows = await db.Memberships.AsNoTracking().Where(x => x.IsCurrent && x.ExpiryDate <= today.AddDays(warningDays))
            .Include(x => x.Member).Include(x => x.Plan).Include(x => x.Payments).OrderBy(x => x.ExpiryDate).Take(500).ToListAsync(ct);
        return rows.Select(x => new ReminderCandidate(x.MemberId, x.Member.FullName, x.Member.Phone, x.Member.Email,
            x.Id, x.Plan.Name, x.ExpiryDate, Math.Max(0, x.FinalFee - x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid)),
            x.ExpiryDate < today ? "MembershipExpired" : "MembershipExpiring")).ToList();
    }

    public async Task<ReminderLogView> SendAsync(SendReminderRequest request, CancellationToken ct)
    {
        var setting = await db.ReminderSettings.SingleOrDefaultAsync(x => x.Id == request.ReminderSettingId && x.IsEnabled, ct)
            ?? throw new ValidationException("The selected reminder setting is unavailable.");
        var membership = await db.Memberships.Include(x => x.Member).Include(x => x.Plan).Include(x => x.Payments)
            .SingleOrDefaultAsync(x => x.MemberId == request.MemberId && x.IsCurrent, ct) ?? throw new NotFoundException("Current membership not found.");
        var log = await DeliverAsync(membership, setting, request.Locale, ct);
        await db.SaveChangesAsync(ct);
        return MapLog(log);
    }

    public async Task<ReminderProcessResult> ProcessDueAsync(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var dayStart = new DateTimeOffset(today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var dayEnd = dayStart.AddDays(1);
        var settings = await db.ReminderSettings.Where(x => x.IsEnabled).ToListAsync(ct);
        var considered = 0; var created = 0; var skipped = 0;
        foreach (var setting in settings)
        {
            var targetExpiry = today.AddDays(-setting.DayOffset);
            var memberships = await db.Memberships.Include(x => x.Member).Include(x => x.Plan).Include(x => x.Payments)
                .Where(x => x.IsCurrent && x.ExpiryDate == targetExpiry).Take(500).ToListAsync(ct);
            foreach (var membership in memberships)
            {
                considered++;
                var duplicate = await db.ReminderLogs.AnyAsync(x => x.MemberId == membership.MemberId && x.ReminderSettingId == setting.Id && x.CreatedAt >= dayStart && x.CreatedAt < dayEnd, ct);
                if (duplicate) { skipped++; continue; }
                await DeliverAsync(membership, setting, "en", ct);
                created++;
            }
        }
        if (created > 0) await db.SaveChangesAsync(ct);
        return new ReminderProcessResult(considered, created, skipped, provider.Mode);
    }

    public async Task<PagedResult<ReminderLogView>> ListLogsAsync(PageQuery query, CancellationToken ct)
    {
        var source = db.ReminderLogs.AsNoTracking().Include(x => x.Member).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Search)) { var term = query.Search.Trim(); source = source.Where(x => x.Member.FullName.Contains(term) || x.Recipient.Contains(term)); }
        var count = await source.CountAsync(ct);
        var rows = await source.OrderByDescending(x => x.CreatedAt).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize).ToListAsync(ct);
        return new(rows.Select(MapLog).ToList(), query.Page, query.PageSize, count);
    }

    private async Task<ReminderLog> DeliverAsync(Membership membership, ReminderSetting setting, string locale, CancellationToken ct)
    {
        var balance = Math.Max(0, membership.FinalFee - membership.Payments.Where(x => !x.IsVoided).Sum(x => x.AmountPaid));
        var template = locale == "ur" ? setting.TemplateUr : setting.TemplateEn;
        var message = template.Replace("{name}", membership.Member.FullName)
            .Replace("{membership}", membership.Plan.Name)
            .Replace("{expiryDate}", membership.ExpiryDate.ToString("yyyy-MM-dd"))
            .Replace("{amount}", membership.FinalFee.ToString("N0"))
            .Replace("{balance}", balance.ToString("N0"));
        var recipient = setting.Channel == ReminderChannel.Email ? membership.Member.Email : membership.Member.Phone;
        if (string.IsNullOrWhiteSpace(recipient))
        {
            var skipped = new ReminderLog { MemberId = membership.MemberId, ReminderSettingId = setting.Id, Channel = setting.Channel, Recipient = "Unavailable", Message = message, Status = ReminderDeliveryState.Skipped, ProviderResponse = "Member does not have a compatible recipient address." };
            db.ReminderLogs.Add(skipped); return skipped;
        }
        var delivery = await provider.SendAsync(setting.Channel, recipient, message, ct);
        var log = new ReminderLog { MemberId = membership.MemberId, Member = membership.Member, ReminderSettingId = setting.Id, Channel = setting.Channel, Recipient = recipient, Message = message, Status = delivery.State, SentAt = delivery.State is ReminderDeliveryState.Sent or ReminderDeliveryState.Mocked ? DateTimeOffset.UtcNow : null, ProviderResponse = delivery.Response };
        db.ReminderLogs.Add(log);
        audit.Add("REMINDER_PROCESSED", nameof(ReminderLog), log.Id, current: new { membership.MemberId, setting.Channel, delivery.State });
        return log;
    }

    private static void ValidateTemplate(string template)
    {
        if (!template.Contains("{name}", StringComparison.Ordinal)) throw new ValidationException("Reminder templates must include the {name} variable.");
    }
    private static ReminderSettingView MapSetting(ReminderSetting x) => new(x.Id, x.Type.ToString(), x.Channel.ToString(), x.DayOffset, x.IsEnabled, x.TemplateEn, x.TemplateUr);
    private static ReminderLogView MapLog(ReminderLog x) => new(x.Id, x.MemberId, x.Member.FullName, x.Channel.ToString(), x.Recipient, x.Message, x.Status.ToString(), x.SentAt, x.ProviderResponse, x.CreatedAt);
}
