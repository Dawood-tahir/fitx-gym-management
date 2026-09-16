using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace FITX.API.Domain;

public enum UserRole { Owner, Admin, Staff }
public enum UserStatus { Active, Disabled }
public enum MembershipState { Active, ExpiringSoon, Expired }
public enum PaymentState { Paid, Partial, Unpaid }
public enum ReminderType { MembershipExpiring, MembershipExpired, PaymentDue, OverduePayment }
public enum ReminderChannel { WhatsApp, Sms, Email }
public enum ReminderDeliveryState { Pending, Sent, Failed, Mocked, Skipped }
public enum NotificationKind { MembershipExpiring, UnpaidFee, PaymentReceived, HighExpense, MembershipRenewed, System }

public abstract class EntityBase
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class User : EntityBase
{
    [MaxLength(120)] public required string Name { get; set; }
    [MaxLength(30)] public string? Phone { get; set; }
    [MaxLength(254)] public required string Email { get; set; }
    [MaxLength(100)] public required string PasswordHash { get; set; }
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; } = UserStatus.Active;
    [MaxLength(5)] public string Locale { get; set; } = "en";
    public DateTimeOffset? LastLoginAt { get; set; }
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}

public sealed class RefreshToken : EntityBase
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    [MaxLength(128)] public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    [MaxLength(128)] public string? ReplacedByTokenHash { get; set; }
    [MaxLength(64)] public string? CreatedByIp { get; set; }
    [MaxLength(64)] public string? RevokedByIp { get; set; }
    [NotMapped] public bool IsActive => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
}

public sealed class PasswordResetToken : EntityBase
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;
    [MaxLength(128)] public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
}

public sealed class Member : EntityBase
{
    [MaxLength(24)] public required string MemberCode { get; set; }
    [MaxLength(120)] public required string FullName { get; set; }
    [MaxLength(30)] public required string Phone { get; set; }
    [MaxLength(254)] public string? Email { get; set; }
    [MaxLength(40)] public string? NationalId { get; set; }
    [MaxLength(20)] public string? Gender { get; set; }
    public DateOnly? DateOfBirth { get; set; }
    [MaxLength(500)] public string? Address { get; set; }
    [MaxLength(2000)] public string? Notes { get; set; }
    public bool IsDeleted { get; set; }
    public ICollection<Membership> Memberships { get; set; } = [];
    public ICollection<Payment> Payments { get; set; } = [];
}

public sealed class MembershipPlan : EntityBase
{
    [MaxLength(80)] public required string Name { get; set; }
    public int DurationDays { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal Price { get; set; }
    [MaxLength(500)] public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
    public ICollection<Membership> Memberships { get; set; } = [];
}

public sealed class Membership : EntityBase
{
    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;
    public Guid PlanId { get; set; }
    public MembershipPlan Plan { get; set; } = null!;
    public DateOnly JoiningDate { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly ExpiryDate { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal Fee { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal Discount { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal FinalFee { get; set; }
    public bool IsCurrent { get; set; } = true;
    [MaxLength(1000)] public string? Notes { get; set; }
    public ICollection<Payment> Payments { get; set; } = [];
    public ICollection<MembershipRenewal> Renewals { get; set; } = [];

    public MembershipState GetState(DateOnly today, int warningDays) =>
        ExpiryDate < today ? MembershipState.Expired :
        ExpiryDate <= today.AddDays(warningDays) ? MembershipState.ExpiringSoon : MembershipState.Active;

    public decimal PaidAmount => Payments.Where(x => !x.IsVoided).Sum(x => x.AmountPaid);
    public decimal Balance => Math.Max(0, FinalFee - PaidAmount);
}

public sealed class MembershipRenewal : EntityBase
{
    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;
    public Guid PreviousMembershipId { get; set; }
    public Membership PreviousMembership { get; set; } = null!;
    public Guid NewMembershipId { get; set; }
    public Membership NewMembership { get; set; } = null!;
    public DateOnly RenewalDate { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal AmountPaid { get; set; }
    public Guid? PaymentId { get; set; }
    public Payment? Payment { get; set; }
    public Guid CreatedByUserId { get; set; }
}

public sealed class PaymentMethod : EntityBase
{
    [MaxLength(80)] public required string Name { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
}

public sealed class Payment : EntityBase
{
    [MaxLength(30)] public required string PaymentNumber { get; set; }
    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;
    public Guid? MembershipId { get; set; }
    public Membership? Membership { get; set; }
    public Guid PaymentMethodId { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = null!;
    [Column(TypeName = "decimal(18,2)")] public decimal TotalFee { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal Discount { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal PayableAmount { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal AmountPaid { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal RemainingAmount { get; set; }
    public DateTimeOffset PaymentDate { get; set; }
    [MaxLength(120)] public string? ReferenceNumber { get; set; }
    [MaxLength(1000)] public string? Notes { get; set; }
    public Guid ReceivedByUserId { get; set; }
    public User ReceivedByUser { get; set; } = null!;
    public bool IsVoided { get; set; }
    public DateTimeOffset? VoidedAt { get; set; }
    public Guid? VoidedByUserId { get; set; }
    [NotMapped] public PaymentState State => AmountPaid <= 0 ? PaymentState.Unpaid : RemainingAmount > 0 ? PaymentState.Partial : PaymentState.Paid;
}

public sealed class ExpenseCategory : EntityBase
{
    [MaxLength(80)] public required string Name { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsSystem { get; set; }
}

public sealed class Expense : EntityBase
{
    [MaxLength(30)] public required string ExpenseNumber { get; set; }
    public Guid CategoryId { get; set; }
    public ExpenseCategory Category { get; set; } = null!;
    [MaxLength(500)] public required string Description { get; set; }
    [Column(TypeName = "decimal(18,2)")] public decimal Amount { get; set; }
    public DateTimeOffset ExpenseDate { get; set; }
    public Guid PaymentMethodId { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = null!;
    [MaxLength(120)] public string? ReferenceNumber { get; set; }
    [MaxLength(1000)] public string? Notes { get; set; }
    public Guid AddedByUserId { get; set; }
    public User AddedByUser { get; set; } = null!;
    public bool IsDeleted { get; set; }
}

public sealed class ReminderSetting : EntityBase
{
    public ReminderType Type { get; set; }
    public ReminderChannel Channel { get; set; }
    public int DayOffset { get; set; }
    public bool IsEnabled { get; set; } = true;
    [MaxLength(1000)] public required string TemplateEn { get; set; }
    [MaxLength(1000)] public required string TemplateUr { get; set; }
}

public sealed class ReminderLog : EntityBase
{
    public Guid MemberId { get; set; }
    public Member Member { get; set; } = null!;
    public Guid ReminderSettingId { get; set; }
    public ReminderSetting ReminderSetting { get; set; } = null!;
    public ReminderChannel Channel { get; set; }
    [MaxLength(30)] public required string Recipient { get; set; }
    [MaxLength(1200)] public required string Message { get; set; }
    public ReminderDeliveryState Status { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    [MaxLength(500)] public string? ProviderResponse { get; set; }
}

public sealed class Notification : EntityBase
{
    public Guid? UserId { get; set; }
    public User? User { get; set; }
    public NotificationKind Kind { get; set; }
    [MaxLength(180)] public required string Title { get; set; }
    [MaxLength(600)] public required string Message { get; set; }
    [MaxLength(300)] public string? ActionUrl { get; set; }
    public bool IsRead { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}

public sealed class GymSetting : EntityBase
{
    [MaxLength(120)] public string GymName { get; set; } = "FITX";
    [MaxLength(30)] public string? Phone { get; set; }
    [MaxLength(254)] public string? Email { get; set; }
    [MaxLength(500)] public string? Address { get; set; }
    [MaxLength(500)] public string? LogoUrl { get; set; }
    [MaxLength(3)] public string Currency { get; set; } = "PKR";
    [MaxLength(80)] public string Timezone { get; set; } = "Asia/Karachi";
    [MaxLength(5)] public string DefaultLocale { get; set; } = "en";
    public int ExpiringSoonDays { get; set; } = 7;
    [Column(TypeName = "decimal(18,2)")] public decimal HighExpenseThreshold { get; set; } = 50000;
}

public sealed class AuditLog : EntityBase
{
    public Guid? UserId { get; set; }
    public User? User { get; set; }
    [MaxLength(120)] public required string Action { get; set; }
    [MaxLength(120)] public required string EntityType { get; set; }
    [MaxLength(80)] public string? EntityId { get; set; }
    [MaxLength(64)] public string? IpAddress { get; set; }
    public string? PreviousValuesJson { get; set; }
    public string? NewValuesJson { get; set; }
}
