using FITX.API.Domain;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Data;

public static class DbInitializer
{
    private static readonly string[] CategoryNames =
        ["Rent", "Electricity", "Staff Salaries", "Equipment", "Maintenance", "Marketing", "Internet", "Cleaning", "Utilities", "Other"];
    private static readonly string[] MethodNames = ["Cash", "Bank Transfer", "Card", "JazzCash", "Easypaisa", "Other"];

    public static async Task InitializeAsync(IServiceProvider services, IConfiguration configuration, IHostEnvironment environment, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<FitxDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseInitialization");

        if (configuration.GetValue("Database:ApplyMigrations", false))
        {
            var migrations = db.Database.GetMigrations();
            if (migrations.Any())
                await db.Database.MigrateAsync(cancellationToken);
            else
            {
                logger.LogWarning("No EF migrations were found; bootstrapping the schema with EnsureCreated. Generate a migration before production deployment.");
                await db.Database.EnsureCreatedAsync(cancellationToken);
            }
        }

        if (!await db.Database.CanConnectAsync(cancellationToken))
        {
            logger.LogWarning("FITX database is unavailable; startup will continue but data endpoints will fail until SQL Server is reachable.");
            return;
        }

        await SeedReferenceDataAsync(db, cancellationToken);

        if (environment.IsDevelopment() && configuration.GetValue("Seed:DevelopmentAdmin", false))
            await SeedDevelopmentAdminAsync(db, configuration, logger, cancellationToken);

        if (environment.IsDevelopment() && configuration.GetValue("Seed:DemoData", false))
            await SeedDemoDataAsync(db, cancellationToken);
    }

    private static async Task SeedReferenceDataAsync(FitxDbContext db, CancellationToken ct)
    {
        if (!await db.GymSettings.AnyAsync(ct))
            db.GymSettings.Add(new GymSetting { GymName = "FITX", Currency = "PKR", Timezone = "Asia/Karachi" });

        if (!await db.MembershipPlans.AnyAsync(ct))
        {
            db.MembershipPlans.AddRange(
                new MembershipPlan { Name = "Monthly", DurationDays = 30, Price = 2_000, Description = "One month membership", IsSystem = true },
                new MembershipPlan { Name = "3 Months", DurationDays = 90, Price = 5_500, Description = "Three month membership", IsSystem = true },
                new MembershipPlan { Name = "6 Months", DurationDays = 180, Price = 10_000, Description = "Six month membership", IsSystem = true },
                new MembershipPlan { Name = "Yearly", DurationDays = 365, Price = 18_000, Description = "Annual membership", IsSystem = true });
        }

        if (!await db.PaymentMethods.AnyAsync(ct))
            db.PaymentMethods.AddRange(MethodNames.Select(x => new PaymentMethod { Name = x, IsSystem = true }));

        if (!await db.ExpenseCategories.AnyAsync(ct))
            db.ExpenseCategories.AddRange(CategoryNames.Select(x => new ExpenseCategory { Name = x, IsSystem = true }));

        if (!await db.ReminderSettings.AnyAsync(ct))
        {
            const string enExpiring = "Hi {name}, your FITX {membership} membership expires on {expiryDate}. Please renew to continue your plan.";
            const string urExpiring = "السلام علیکم {name}، آپ کی FITX {membership} ممبرشپ {expiryDate} کو ختم ہو رہی ہے۔ براہ کرم تجدید کروا لیں۔";
            foreach (var offset in new[] { -7, -3, 0, 3, 7 })
            {
                db.ReminderSettings.Add(new ReminderSetting
                {
                    Type = offset < 0 ? ReminderType.MembershipExpiring : offset == 0 ? ReminderType.MembershipExpired : ReminderType.MembershipExpired,
                    Channel = ReminderChannel.WhatsApp,
                    DayOffset = offset,
                    TemplateEn = enExpiring,
                    TemplateUr = urExpiring,
                    IsEnabled = true
                });
            }
            db.ReminderSettings.Add(new ReminderSetting
            {
                Type = ReminderType.PaymentDue,
                Channel = ReminderChannel.Email,
                DayOffset = 0,
                TemplateEn = "Hi {name}, your outstanding FITX balance is {balance}.",
                TemplateUr = "السلام علیکم {name}، آپ کا FITX بقایا {balance} ہے۔",
                IsEnabled = true
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private static async Task SeedDevelopmentAdminAsync(FitxDbContext db, IConfiguration configuration, ILogger logger, CancellationToken ct)
    {
        var email = (configuration["Seed:DevelopmentAdminEmail"] ?? configuration["Seed:AdminEmail"] ?? "admin@fitx.local").Trim().ToLowerInvariant();
        var password = configuration["Seed:DevelopmentAdminPassword"] ?? configuration["Seed:AdminPassword"] ?? "Fitx@123";
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) return;
        // The documented local-only credential predates the production password policy.
        // It is only reachable when ASPNETCORE_ENVIRONMENT=Development and the explicit seed flag is enabled.
        db.Users.Add(new User
        {
            Name = "FITX Owner",
            Email = email,
            Phone = "+92 300 0000000",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12),
            Role = UserRole.Owner,
            Locale = "en"
        });
        await db.SaveChangesAsync(ct);
        logger.LogWarning("Development owner seeded as {Email}. Disable Seed:DevelopmentAdmin outside local development.", email);
    }

    private static async Task SeedDemoDataAsync(FitxDbContext db, CancellationToken ct)
    {
        if (await db.Members.AnyAsync(ct)) return;
        var owner = await db.Users.OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(ct);
        if (owner is null) return;

        var plans = await db.MembershipPlans.ToDictionaryAsync(x => x.Name, ct);
        var cash = await db.PaymentMethods.FirstAsync(x => x.Name == "Cash", ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var memberData = new[]
        {
            ("Arjun Mehta", "+92 300 1111101", "arjun@example.test", "Monthly", -6, 24, 2000m),
            ("Priya Sharma", "+92 300 1111102", "priya@example.test", "3 Months", -35, 55, 5500m),
            ("Rohan Singh", "+92 300 1111103", "rohan@example.test", "Monthly", -28, 2, 0m),
            ("Neha Patel", "+92 300 1111104", "neha@example.test", "Monthly", -25, 5, 1200m),
            ("Vikram Das", "+92 300 1111105", "vikram@example.test", "6 Months", -15, 165, 10000m)
        };

        var index = 1;
        foreach (var item in memberData)
        {
            var member = new Member { MemberCode = $"FITX-{index:0000}", FullName = item.Item1, Phone = item.Item2, Email = item.Item3 };
            var plan = plans[item.Item4];
            var membership = new Membership
            {
                Member = member, Plan = plan, JoiningDate = today.AddDays(item.Item5), StartDate = today.AddDays(item.Item5),
                ExpiryDate = today.AddDays(item.Item6), Fee = plan.Price, FinalFee = plan.Price
            };
            db.Members.Add(member);
            db.Memberships.Add(membership);
            if (item.Item7 > 0)
            {
                db.Payments.Add(new Payment
                {
                    PaymentNumber = $"PAY-{DateTime.UtcNow:yyyyMM}-{index:0000}", Member = member, Membership = membership,
                    PaymentMethod = cash, TotalFee = plan.Price, PayableAmount = plan.Price, AmountPaid = item.Item7,
                    RemainingAmount = plan.Price - item.Item7, PaymentDate = DateTimeOffset.UtcNow.AddDays(-index), ReceivedByUser = owner
                });
            }
            index++;
        }

        var rent = await db.ExpenseCategories.FirstAsync(x => x.Name == "Rent", ct);
        var electricity = await db.ExpenseCategories.FirstAsync(x => x.Name == "Electricity", ct);
        db.Expenses.AddRange(
            new Expense { ExpenseNumber = $"EXP-{DateTime.UtcNow:yyyyMM}-0001", Category = rent, Description = "Monthly gym rent", Amount = 30000, ExpenseDate = DateTimeOffset.UtcNow.AddDays(-10), PaymentMethod = cash, AddedByUser = owner },
            new Expense { ExpenseNumber = $"EXP-{DateTime.UtcNow:yyyyMM}-0002", Category = electricity, Description = "Electricity bill", Amount = 8500, ExpenseDate = DateTimeOffset.UtcNow.AddDays(-4), PaymentMethod = cash, AddedByUser = owner });

        await db.SaveChangesAsync(ct);
    }
}
