using FITX.API.Domain;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Data;

public sealed class FitxDbContext(DbContextOptions<FitxDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<MembershipPlan> MembershipPlans => Set<MembershipPlan>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<MembershipRenewal> MembershipRenewals => Set<MembershipRenewal>();
    public DbSet<PaymentMethod> PaymentMethods => Set<PaymentMethod>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ReminderSetting> ReminderSettings => Set<ReminderSetting>();
    public DbSet<ReminderLog> ReminderLogs => Set<ReminderLog>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<GymSetting> GymSettings => Set<GymSetting>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(x => x.Email).IsUnique();
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        });

        modelBuilder.Entity<RefreshToken>(entity =>
        {
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.ExpiresAt });
            entity.HasOne(x => x.User).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PasswordResetToken>(entity =>
        {
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Member>(entity =>
        {
            entity.HasIndex(x => x.MemberCode).IsUnique();
            entity.HasIndex(x => x.Phone);
            entity.HasIndex(x => x.Email);
            entity.HasQueryFilter(x => !x.IsDeleted);
        });

        modelBuilder.Entity<MembershipPlan>(entity => entity.HasIndex(x => x.Name).IsUnique());

        modelBuilder.Entity<Membership>(entity =>
        {
            entity.HasIndex(x => new { x.MemberId, x.IsCurrent });
            entity.HasIndex(x => x.ExpiryDate);
            entity.HasOne(x => x.Member).WithMany(x => x.Memberships).HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Plan).WithMany(x => x.Memberships).HasForeignKey(x => x.PlanId).OnDelete(DeleteBehavior.Restrict);
            entity.Ignore(x => x.PaidAmount);
            entity.Ignore(x => x.Balance);
        });

        modelBuilder.Entity<MembershipRenewal>(entity =>
        {
            entity.HasIndex(x => new { x.MemberId, x.RenewalDate });
            entity.HasOne(x => x.Member).WithMany().HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PreviousMembership).WithMany(x => x.Renewals).HasForeignKey(x => x.PreviousMembershipId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.NewMembership).WithMany().HasForeignKey(x => x.NewMembershipId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Payment).WithMany().HasForeignKey(x => x.PaymentId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<PaymentMethod>(entity => entity.HasIndex(x => x.Name).IsUnique());
        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasIndex(x => x.PaymentNumber).IsUnique();
            entity.HasIndex(x => x.PaymentDate);
            entity.HasIndex(x => new { x.MemberId, x.PaymentDate });
            entity.HasOne(x => x.Member).WithMany(x => x.Payments).HasForeignKey(x => x.MemberId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Membership).WithMany(x => x.Payments).HasForeignKey(x => x.MembershipId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PaymentMethod).WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.ReceivedByUser).WithMany().HasForeignKey(x => x.ReceivedByUserId).OnDelete(DeleteBehavior.Restrict);
            entity.Ignore(x => x.State);
        });

        modelBuilder.Entity<ExpenseCategory>(entity => entity.HasIndex(x => x.Name).IsUnique());
        modelBuilder.Entity<Expense>(entity =>
        {
            entity.HasIndex(x => x.ExpenseNumber).IsUnique();
            entity.HasIndex(x => x.ExpenseDate);
            entity.HasQueryFilter(x => !x.IsDeleted);
            entity.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.PaymentMethod).WithMany().HasForeignKey(x => x.PaymentMethodId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.AddedByUser).WithMany().HasForeignKey(x => x.AddedByUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ReminderSetting>(entity =>
        {
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
            entity.Property(x => x.Channel).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(x => new { x.Type, x.Channel, x.DayOffset }).IsUnique();
        });
        modelBuilder.Entity<ReminderLog>(entity =>
        {
            entity.Property(x => x.Channel).HasConversion<string>().HasMaxLength(20);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(x => new { x.MemberId, x.ReminderSettingId, x.CreatedAt });
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.Property(x => x.Kind).HasConversion<string>().HasMaxLength(40);
            entity.HasIndex(x => new { x.UserId, x.IsRead, x.CreatedAt });
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<GymSetting>().HasIndex(x => x.GymName);
        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasIndex(x => x.CreatedAt);
            entity.HasIndex(x => new { x.EntityType, x.EntityId });
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
        });
    }

    public override int SaveChanges()
    {
        ApplyTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyTimestamps()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries<EntityBase>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = now;
                entry.Entity.UpdatedAt = now;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = now;
                entry.Property(x => x.CreatedAt).IsModified = false;
            }
        }
    }
}
