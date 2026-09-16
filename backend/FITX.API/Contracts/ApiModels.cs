using System.ComponentModel.DataAnnotations;
using FITX.API.Common;
using FITX.API.Domain;

namespace FITX.API.Contracts;

public sealed class LoginRequest
{
    [Required, EmailAddress, MaxLength(254)] public string Email { get; init; } = "";
    [Required, MinLength(8), MaxLength(128)] public string Password { get; init; } = "";
    public bool RememberMe { get; init; }
}

public sealed class RefreshRequest
{
    [Required] public string RefreshToken { get; init; } = "";
}

public sealed class ForgotPasswordRequest
{
    [Required, EmailAddress] public string Email { get; init; } = "";
}

public sealed class ResetPasswordRequest
{
    [Required] public string Token { get; init; } = "";
    [Required, MinLength(10), MaxLength(128)] public string NewPassword { get; init; } = "";
}

public sealed record UserSummary(Guid Id, string Name, string? Phone, string Email, string Role, string Status, string Locale, DateTimeOffset? LastLoginAt);
public sealed record TokenResponse(string AccessToken, string RefreshToken, DateTimeOffset ExpiresAt, UserSummary User);
public sealed record ForgotPasswordResult(string Message, string? DevelopmentResetToken = null);

public sealed class MemberQuery : PageQuery
{
    public Guid? PlanId { get; init; }
    public MembershipState? MembershipStatus { get; init; }
    public PaymentState? PaymentStatus { get; init; }
}

public sealed class CreateMemberRequest
{
    [Required, MinLength(2), MaxLength(120)] public string FullName { get; init; } = "";
    [Required, MaxLength(30)] public string Phone { get; init; } = "";
    [EmailAddress, MaxLength(254)] public string? Email { get; init; }
    [MaxLength(40)] public string? NationalId { get; init; }
    [MaxLength(20)] public string? Gender { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    [MaxLength(500)] public string? Address { get; init; }
    [MaxLength(2000)] public string? Notes { get; init; }
    [Required] public Guid PlanId { get; init; }
    public DateOnly JoiningDate { get; init; }
    public DateOnly MembershipStartDate { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal? MembershipFee { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal Discount { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal AmountPaid { get; init; }
    public Guid? PaymentMethodId { get; init; }
    [MaxLength(120)] public string? PaymentReference { get; init; }
}

public sealed class UpdateMemberRequest
{
    [Required, MinLength(2), MaxLength(120)] public string FullName { get; init; } = "";
    [Required, MaxLength(30)] public string Phone { get; init; } = "";
    [EmailAddress, MaxLength(254)] public string? Email { get; init; }
    [MaxLength(40)] public string? NationalId { get; init; }
    [MaxLength(20)] public string? Gender { get; init; }
    public DateOnly? DateOfBirth { get; init; }
    [MaxLength(500)] public string? Address { get; init; }
    [MaxLength(2000)] public string? Notes { get; init; }
}

public sealed class RenewMembershipRequest
{
    [Required] public Guid PlanId { get; init; }
    public DateOnly RenewalDate { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal? MembershipFee { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal Discount { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal AmountPaid { get; init; }
    public Guid? PaymentMethodId { get; init; }
    [MaxLength(120)] public string? ReferenceNumber { get; init; }
    [MaxLength(1000)] public string? Notes { get; init; }
}

public sealed record MembershipView(
    Guid Id, Guid PlanId, string Plan, DateOnly JoiningDate, DateOnly StartDate, DateOnly ExpiryDate,
    decimal Fee, decimal Discount, decimal FinalFee, decimal AmountPaid, decimal Balance, string Status, bool IsCurrent);

public sealed record MemberListItem(
    Guid Id, string MemberCode, string FullName, string Phone, string? Email, MembershipView? Membership,
    string MembershipStatus, string PaymentStatus);

public sealed record MemberDetails(
    Guid Id, string MemberCode, string FullName, string Phone, string? Email, string? NationalId, string? Gender,
    DateOnly? DateOfBirth, string? Address, string? Notes, MembershipView? CurrentMembership,
    IReadOnlyList<MembershipView> MembershipHistory, IReadOnlyList<PaymentView> PaymentHistory,
    IReadOnlyList<RenewalView> RenewalHistory, DateTimeOffset CreatedAt);

public sealed record RenewalView(
    Guid Id, Guid MemberId, string Member, string PreviousPlan, string NewPlan, DateOnly RenewalDate,
    DateOnly NewExpiryDate, decimal AmountPaid, Guid? PaymentId, DateTimeOffset CreatedAt);

public sealed class PlanRequest
{
    [Required, MinLength(2), MaxLength(80)] public string Name { get; init; } = "";
    [Range(1, 3650)] public int DurationDays { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal Price { get; init; }
    [MaxLength(500)] public string? Description { get; init; }
    public bool IsActive { get; init; } = true;
}

public sealed record PlanView(Guid Id, string Name, int DurationDays, decimal Price, string? Description, bool IsActive, bool IsSystem);

public sealed class PaymentQuery : PageQuery
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public Guid? MemberId { get; init; }
    public Guid? PlanId { get; init; }
    public Guid? PaymentMethodId { get; init; }
    public PaymentState? Status { get; init; }
}

public sealed class CreatePaymentRequest
{
    [Required] public Guid MemberId { get; init; }
    public Guid? MembershipId { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal TotalFee { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal Discount { get; init; }
    [Range(typeof(decimal), "0", "999999999")] public decimal AmountPaid { get; init; }
    [Required] public Guid PaymentMethodId { get; init; }
    public DateTimeOffset? PaymentDate { get; init; }
    [MaxLength(120)] public string? ReferenceNumber { get; init; }
    [MaxLength(1000)] public string? Notes { get; init; }
}

public sealed class UpdatePaymentRequest
{
    [Range(typeof(decimal), "0", "999999999")] public decimal AmountPaid { get; init; }
    [Required] public Guid PaymentMethodId { get; init; }
    public DateTimeOffset PaymentDate { get; init; }
    [MaxLength(120)] public string? ReferenceNumber { get; init; }
    [MaxLength(1000)] public string? Notes { get; init; }
}

public sealed record PaymentView(
    Guid Id, string PaymentNumber, DateTimeOffset PaymentDate, Guid MemberId, string Member, string MemberCode,
    Guid? MembershipId, string? MembershipPlan, decimal TotalFee, decimal Discount, decimal PayableAmount,
    decimal AmountPaid, decimal RemainingAmount, Guid PaymentMethodId, string PaymentMethod, string Status,
    string ReceivedBy, string? ReferenceNumber, string? Notes);
public sealed record PaymentSummary(decimal PaymentsThisMonth, decimal OutstandingAmount, int PaidMembers, int UnpaidMembers);

public sealed class ExpenseQuery : PageQuery
{
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
    public Guid? CategoryId { get; init; }
    public Guid? PaymentMethodId { get; init; }
}

public sealed class ExpenseRequest
{
    [Required] public Guid CategoryId { get; init; }
    [Required, MinLength(2), MaxLength(500)] public string Description { get; init; } = "";
    [Range(typeof(decimal), "0.01", "999999999")] public decimal Amount { get; init; }
    public DateTimeOffset ExpenseDate { get; init; }
    [Required] public Guid PaymentMethodId { get; init; }
    [MaxLength(120)] public string? ReferenceNumber { get; init; }
    [MaxLength(1000)] public string? Notes { get; init; }
}

public sealed record ExpenseView(
    Guid Id, string ExpenseNumber, DateTimeOffset ExpenseDate, Guid CategoryId, string Category,
    string Description, decimal Amount, Guid PaymentMethodId, string PaymentMethod, string AddedBy,
    string? ReferenceNumber, string? Notes);
public sealed record ExpenseSummary(decimal TotalThisMonth, string? LargestCategory, decimal ChangePercentFromLastMonth);

public sealed record MethodView(Guid Id, string Name, bool IsActive, bool IsSystem);
public sealed class NamedOptionRequest
{
    [Required, MinLength(2), MaxLength(80)] public string Name { get; init; } = "";
    public bool IsActive { get; init; } = true;
}

public sealed class StaffQuery : PageQuery
{
    public UserRole? Role { get; init; }
    public UserStatus? Status { get; init; }
}

public sealed class CreateStaffRequest
{
    [Required, MinLength(2), MaxLength(120)] public string Name { get; init; } = "";
    [MaxLength(30)] public string? Phone { get; init; }
    [Required, EmailAddress, MaxLength(254)] public string Email { get; init; } = "";
    [Required, MinLength(10), MaxLength(128)] public string Password { get; init; } = "";
    public UserRole Role { get; init; } = UserRole.Staff;
}

public sealed class UpdateStaffRequest
{
    [Required, MinLength(2), MaxLength(120)] public string Name { get; init; } = "";
    [MaxLength(30)] public string? Phone { get; init; }
    [Required, EmailAddress, MaxLength(254)] public string Email { get; init; } = "";
    public UserRole Role { get; init; }
    public UserStatus Status { get; init; }
}

public sealed class StaffResetPasswordRequest
{
    [Required, MinLength(10), MaxLength(128)] public string NewPassword { get; init; } = "";
}

public sealed class GymSettingsRequest
{
    [Required, MaxLength(120)] public string GymName { get; init; } = "FITX";
    [MaxLength(30)] public string? Phone { get; init; }
    [EmailAddress, MaxLength(254)] public string? Email { get; init; }
    [MaxLength(500)] public string? Address { get; init; }
    [Url, MaxLength(500)] public string? LogoUrl { get; init; }
    [Required, StringLength(3, MinimumLength = 3)] public string Currency { get; init; } = "PKR";
    [Required, MaxLength(80)] public string Timezone { get; init; } = "Asia/Karachi";
    [RegularExpression("^(en|ur)$")] public string DefaultLocale { get; init; } = "en";
    [Range(1, 90)] public int ExpiringSoonDays { get; init; } = 7;
    [Range(typeof(decimal), "0", "999999999")] public decimal HighExpenseThreshold { get; init; }
}

public sealed record GymSettingsView(
    Guid Id, string GymName, string? Phone, string? Email, string? Address, string? LogoUrl,
    string Currency, string Timezone, string DefaultLocale, int ExpiringSoonDays, decimal HighExpenseThreshold);

public sealed class UpdateLocaleRequest
{
    [RegularExpression("^(en|ur)$")] public string Locale { get; init; } = "en";
}

public sealed class ReminderSettingRequest
{
    public ReminderType Type { get; init; }
    public ReminderChannel Channel { get; init; }
    [Range(-365, 365)] public int DayOffset { get; init; }
    public bool IsEnabled { get; init; }
    [Required, MaxLength(1000)] public string TemplateEn { get; init; } = "";
    [Required, MaxLength(1000)] public string TemplateUr { get; init; } = "";
}

public sealed record ReminderSettingView(
    Guid Id, string Type, string Channel, int DayOffset, bool IsEnabled, string TemplateEn, string TemplateUr);
public sealed record ReminderCandidate(
    Guid MemberId, string Member, string Phone, string? Email, Guid MembershipId, string Plan,
    DateOnly ExpiryDate, decimal Balance, string Reason);
public sealed record ReminderLogView(
    Guid Id, Guid MemberId, string Member, string Channel, string Recipient, string Message,
    string Status, DateTimeOffset? SentAt, string? ProviderResponse, DateTimeOffset CreatedAt);
public sealed record ReminderProcessResult(int Considered, int Created, int Skipped, string ProviderMode);

public sealed class SendReminderRequest
{
    [Required] public Guid MemberId { get; init; }
    [Required] public Guid ReminderSettingId { get; init; }
    [RegularExpression("^(en|ur)$")] public string Locale { get; init; } = "en";
}

public sealed record NotificationView(
    Guid Id, string Kind, string Title, string Message, string? ActionUrl, bool IsRead, DateTimeOffset CreatedAt);

public sealed record KpiCard(string Key, decimal Value, decimal? ChangePercent, string Unit);
public sealed record ChartPoint(string Label, decimal Revenue, decimal Expenses, decimal Profit, int NewMembers);
public sealed record DistributionPoint(string Label, decimal Value);
public sealed record DashboardResponse(
    IReadOnlyList<KpiCard> Kpis, IReadOnlyList<ChartPoint> MonthlyTrend,
    IReadOnlyList<DistributionPoint> MembershipStatuses, IReadOnlyList<DistributionPoint> PaymentStatuses,
    IReadOnlyList<DistributionPoint> MembershipPlans, IReadOnlyList<MemberListItem> RecentMembers,
    IReadOnlyList<PaymentView> RecentPayments, IReadOnlyList<ExpenseView> RecentExpenses);

public sealed record ReportRow(IReadOnlyDictionary<string, object?> Values);
public sealed record ReportResponse(
    string Type, DateOnly From, DateOnly To, IReadOnlyDictionary<string, decimal> Summary,
    IReadOnlyList<ReportRow> Rows);

public sealed record AuditLogView(
    Guid Id, string? User, string Action, string EntityType, string? EntityId, string? IpAddress,
    string? PreviousValuesJson, string? NewValuesJson, DateTimeOffset CreatedAt);
public sealed record GlobalSearchItem(string Type, Guid Id, string Title, string Subtitle, string Url);
public sealed record GlobalSearchResult(IReadOnlyList<GlobalSearchItem> Items);
