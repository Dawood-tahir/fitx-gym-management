using System.Globalization;
using System.Text;
using System.Xml.Linq;
using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Data;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public sealed record ExportFile(byte[] Content, string ContentType, string FileName);

public interface IReportService
{
    Task<ReportResponse> GenerateAsync(string type, DateOnly? from, DateOnly? to, CancellationToken ct);
    Task<ExportFile> ExportAsync(string type, string format, DateOnly? from, DateOnly? to, CancellationToken ct);
}

public sealed class ReportService(FitxDbContext db) : IReportService
{
    private static readonly HashSet<string> ValidTypes = new(StringComparer.OrdinalIgnoreCase)
    { "revenue", "expense", "profit", "membership", "payment-collection", "outstanding", "membership-expiry", "new-members" };

    public async Task<ReportResponse> GenerateAsync(string type, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        type = type.Trim().ToLowerInvariant();
        if (!ValidTypes.Contains(type)) throw new ValidationException("Unsupported report type.");
        var (start, end) = DateRanges.Normalize(from, to);
        var startDate = DateOnly.FromDateTime(start.UtcDateTime);
        var endDate = DateOnly.FromDateTime(end.AddDays(-1).UtcDateTime);
        return type switch
        {
            "revenue" or "payment-collection" => await RevenueAsync(type, start, end, startDate, endDate, ct),
            "expense" => await ExpenseAsync(start, end, startDate, endDate, ct),
            "profit" => await ProfitAsync(start, end, startDate, endDate, ct),
            "membership" => await MembershipAsync(startDate, endDate, false, ct),
            "membership-expiry" => await MembershipAsync(startDate, endDate, true, ct),
            "outstanding" => await OutstandingAsync(startDate, endDate, ct),
            "new-members" => await NewMembersAsync(start, end, startDate, endDate, ct),
            _ => throw new ValidationException("Unsupported report type.")
        };
    }

    public async Task<ExportFile> ExportAsync(string type, string format, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        var report = await GenerateAsync(type, from, to, ct);
        var safeName = $"FITX-{report.Type}-{report.From:yyyyMMdd}-{report.To:yyyyMMdd}";
        return format.Trim().ToLowerInvariant() switch
        {
            "csv" => new ExportFile(BuildCsv(report), "text/csv; charset=utf-8", safeName + ".csv"),
            "excel" or "xls" => new ExportFile(BuildSpreadsheetXml(report), "application/vnd.ms-excel", safeName + ".xls"),
            "pdf" => new ExportFile(BuildPdf(report), "application/pdf", safeName + ".pdf"),
            _ => throw new ValidationException("Supported export formats are pdf, csv, and excel.")
        };
    }

    private async Task<ReportResponse> RevenueAsync(string type, DateTimeOffset start, DateTimeOffset end, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var payments = await db.Payments.AsNoTracking().Where(x => !x.IsVoided && x.PaymentDate >= start && x.PaymentDate < end)
            .Include(x => x.Member).Include(x => x.Membership)!.ThenInclude(x => x!.Plan).Include(x => x.PaymentMethod)
            .OrderByDescending(x => x.PaymentDate).Take(10000).ToListAsync(ct);
        var rows = payments.Select(x => Row(("Receipt", x.PaymentNumber), ("Date", x.PaymentDate.ToString("yyyy-MM-dd")),
            ("Member", x.Member.FullName), ("Plan", x.Membership?.Plan.Name), ("Method", x.PaymentMethod.Name),
            ("Amount", x.AmountPaid), ("Balance", x.RemainingAmount))).ToList();
        return new ReportResponse(type, from, to, new Dictionary<string, decimal>
        { ["paymentsReceived"] = payments.Sum(x => x.AmountPaid), ["transactions"] = payments.Count }, rows);
    }

    private async Task<ReportResponse> ExpenseAsync(DateTimeOffset start, DateTimeOffset end, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var expenses = await db.Expenses.AsNoTracking().Where(x => x.ExpenseDate >= start && x.ExpenseDate < end)
            .Include(x => x.Category).Include(x => x.PaymentMethod).OrderByDescending(x => x.ExpenseDate).Take(10000).ToListAsync(ct);
        var rows = expenses.Select(x => Row(("Expense", x.ExpenseNumber), ("Date", x.ExpenseDate.ToString("yyyy-MM-dd")),
            ("Category", x.Category.Name), ("Description", x.Description), ("Method", x.PaymentMethod.Name), ("Amount", x.Amount))).ToList();
        return new ReportResponse("expense", from, to, new Dictionary<string, decimal>
        { ["totalExpenses"] = expenses.Sum(x => x.Amount), ["transactions"] = expenses.Count }, rows);
    }

    private async Task<ReportResponse> ProfitAsync(DateTimeOffset start, DateTimeOffset end, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var revenue = await db.Payments.Where(x => !x.IsVoided && x.PaymentDate >= start && x.PaymentDate < end).SumAsync(x => x.AmountPaid, ct);
        var expenses = await db.Expenses.Where(x => x.ExpenseDate >= start && x.ExpenseDate < end).SumAsync(x => x.Amount, ct);
        var rows = new List<ReportRow> { Row(("Metric", "Revenue"), ("Amount", revenue)), Row(("Metric", "Expenses"), ("Amount", expenses)), Row(("Metric", "Net Profit"), ("Amount", revenue - expenses)) };
        return new ReportResponse("profit", from, to, new Dictionary<string, decimal> { ["revenue"] = revenue, ["expenses"] = expenses, ["netProfit"] = revenue - expenses }, rows);
    }

    private async Task<ReportResponse> MembershipAsync(DateOnly from, DateOnly to, bool byExpiry, CancellationToken ct)
    {
        var source = db.Memberships.AsNoTracking().Include(x => x.Member).Include(x => x.Plan).Include(x => x.Payments).AsQueryable();
        source = byExpiry ? source.Where(x => x.ExpiryDate >= from && x.ExpiryDate <= to) : source.Where(x => x.StartDate >= from && x.StartDate <= to);
        var values = await source.OrderByDescending(x => byExpiry ? x.ExpiryDate : x.StartDate).Take(10000).ToListAsync(ct);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var rows = values.Select(x => Row(("Member ID", x.Member.MemberCode), ("Member", x.Member.FullName), ("Plan", x.Plan.Name),
            ("Start", x.StartDate), ("Expiry", x.ExpiryDate), ("Status", x.GetState(today, 7).ToString()),
            ("Fee", x.FinalFee), ("Paid", x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid)))).ToList();
        return new ReportResponse(byExpiry ? "membership-expiry" : "membership", from, to,
            new Dictionary<string, decimal> { ["memberships"] = values.Count, ["totalFees"] = values.Sum(x => x.FinalFee) }, rows);
    }

    private async Task<ReportResponse> OutstandingAsync(DateOnly from, DateOnly to, CancellationToken ct)
    {
        var values = await db.Memberships.AsNoTracking().Where(x => x.IsCurrent).Include(x => x.Member).Include(x => x.Plan).Include(x => x.Payments).ToListAsync(ct);
        values = values.Where(x => x.FinalFee > x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid)).ToList();
        var rows = values.Select(x => { var paid = x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid); return Row(("Member ID", x.Member.MemberCode), ("Member", x.Member.FullName), ("Phone", x.Member.Phone), ("Plan", x.Plan.Name), ("Expiry", x.ExpiryDate), ("Payable", x.FinalFee), ("Paid", paid), ("Balance", x.FinalFee - paid)); }).ToList();
        return new ReportResponse("outstanding", from, to, new Dictionary<string, decimal> { ["members"] = values.Count, ["outstanding"] = values.Sum(x => x.FinalFee - x.Payments.Where(p => !p.IsVoided).Sum(p => p.AmountPaid)) }, rows);
    }

    private async Task<ReportResponse> NewMembersAsync(DateTimeOffset start, DateTimeOffset end, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var values = await db.Members.AsNoTracking().Where(x => x.CreatedAt >= start && x.CreatedAt < end).OrderByDescending(x => x.CreatedAt).Take(10000).ToListAsync(ct);
        var rows = values.Select(x => Row(("Member ID", x.MemberCode), ("Name", x.FullName), ("Phone", x.Phone), ("Email", x.Email), ("Joined", x.CreatedAt.ToString("yyyy-MM-dd")))).ToList();
        return new ReportResponse("new-members", from, to, new Dictionary<string, decimal> { ["newMembers"] = values.Count }, rows);
    }

    private static ReportRow Row(params (string Key, object? Value)[] values) => new(values.ToDictionary(x => x.Key, x => x.Value));

    private static byte[] BuildCsv(ReportResponse report)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"FITX {report.Type} report,{report.From:yyyy-MM-dd} to {report.To:yyyy-MM-dd}");
        foreach (var summary in report.Summary) sb.AppendLine($"{Csv(summary.Key)},{Csv(summary.Value)}");
        if (report.Rows.Count > 0)
        {
            var columns = report.Rows[0].Values.Keys.ToList(); sb.AppendLine(string.Join(',', columns.Select(Csv)));
            foreach (var row in report.Rows) sb.AppendLine(string.Join(',', columns.Select(x => Csv(row.Values.GetValueOrDefault(x)))));
        }
        return new UTF8Encoding(true).GetBytes(sb.ToString());
    }

    private static byte[] BuildSpreadsheetXml(ReportResponse report)
    {
        XNamespace ss = "urn:schemas-microsoft-com:office:spreadsheet";
        var table = new XElement(ss + "Table");
        table.Add(XmlRow("FITX", CultureInfo.InvariantCulture.TextInfo.ToTitleCase(report.Type.Replace('-', ' ')) + " Report"));
        table.Add(XmlRow("Date Range", $"{report.From:yyyy-MM-dd} to {report.To:yyyy-MM-dd}"));
        foreach (var value in report.Summary) table.Add(XmlRow(value.Key, value.Value));
        if (report.Rows.Count > 0)
        {
            var columns = report.Rows[0].Values.Keys.ToList(); table.Add(XmlRow(columns.Cast<object?>().ToArray()));
            foreach (var row in report.Rows) table.Add(XmlRow(columns.Select(x => row.Values.GetValueOrDefault(x)).ToArray()));
        }
        var document = new XDocument(new XDeclaration("1.0", "utf-8", null), new XElement(ss + "Workbook", new XElement(ss + "Worksheet", new XAttribute(ss + "Name", "FITX Report"), table)));
        return Encoding.UTF8.GetBytes(document.ToString());
    }

    private static XElement XmlRow(params object?[] values)
    {
        XNamespace ss = "urn:schemas-microsoft-com:office:spreadsheet";
        return new XElement(ss + "Row", values.Select(value => new XElement(ss + "Cell", new XElement(ss + "Data", new XAttribute(ss + "Type", value is decimal or int or long ? "Number" : "String"), Convert.ToString(value, CultureInfo.InvariantCulture) ?? ""))));
    }

    private static byte[] BuildPdf(ReportResponse report)
    {
        var lines = new List<string> { "FITX Gym Management", report.Type.Replace('-', ' ').ToUpperInvariant() + " REPORT", $"Date range: {report.From:yyyy-MM-dd} to {report.To:yyyy-MM-dd}", "" };
        lines.AddRange(report.Summary.Select(x => $"{x.Key}: Rs. {x.Value:N2}")); lines.Add("");
        foreach (var row in report.Rows.Take(32)) lines.Add(string.Join(" | ", row.Values.Select(x => $"{x.Key}: {x.Value}")));
        if (report.Rows.Count > 32) lines.Add($"... {report.Rows.Count - 32} additional rows. Use CSV/Excel for the full dataset.");
        var streamText = new StringBuilder("BT /F1 10 Tf 40 800 Td 13 TL ");
        foreach (var line in lines) streamText.Append('(').Append(PdfEscape(TrimTo(line, 105))).Append(") Tj T* ");
        streamText.Append("ET");
        var content = Encoding.ASCII.GetBytes(streamText.ToString());
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            $"<< /Length {content.Length} >>\nstream\n{Encoding.ASCII.GetString(content)}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        };
        using var output = new MemoryStream(); using var writer = new StreamWriter(output, Encoding.ASCII, bufferSize: 1024, leaveOpen: true) { NewLine = "\n" };
        writer.WriteLine("%PDF-1.4"); writer.Flush(); var offsets = new List<long> { 0 };
        for (var i = 0; i < objects.Length; i++) { offsets.Add(output.Position); writer.WriteLine($"{i + 1} 0 obj"); writer.WriteLine(objects[i]); writer.WriteLine("endobj"); writer.Flush(); }
        var xref = output.Position; writer.WriteLine("xref"); writer.WriteLine($"0 {objects.Length + 1}"); writer.WriteLine("0000000000 65535 f ");
        foreach (var offset in offsets.Skip(1)) writer.WriteLine($"{offset:0000000000} 00000 n ");
        writer.WriteLine($"trailer << /Size {objects.Length + 1} /Root 1 0 R >>"); writer.WriteLine("startxref"); writer.WriteLine(xref); writer.WriteLine("%%EOF"); writer.Flush();
        return output.ToArray();
    }

    private static string Csv(object? value) { var text = Convert.ToString(value, CultureInfo.InvariantCulture) ?? ""; return '"' + text.Replace("\"", "\"\"") + '"'; }
    private static string PdfEscape(string value) => value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)").Select(c => c <= 127 ? c : '?').Aggregate(new StringBuilder(), (b, c) => b.Append(c)).ToString();
    private static string TrimTo(string value, int length) => value.Length <= length ? value : value[..(length - 3)] + "...";
}
