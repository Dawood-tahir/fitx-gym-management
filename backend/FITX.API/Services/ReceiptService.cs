using System.Text;
using FITX.API.Common;
using FITX.API.Data;
using Microsoft.EntityFrameworkCore;

namespace FITX.API.Services;

public interface IReceiptService
{
    Task<ExportFile> CreatePaymentReceiptAsync(Guid paymentId, CancellationToken ct);
}

public sealed class ReceiptService(FitxDbContext db) : IReceiptService
{
    public async Task<ExportFile> CreatePaymentReceiptAsync(Guid paymentId, CancellationToken ct)
    {
        var payment = await db.Payments.AsNoTracking().Where(x => !x.IsVoided)
            .Include(x => x.Member).Include(x => x.Membership)!.ThenInclude(x => x!.Plan)
            .Include(x => x.PaymentMethod).Include(x => x.ReceivedByUser)
            .SingleOrDefaultAsync(x => x.Id == paymentId, ct) ?? throw new NotFoundException("Payment not found.");
        var gym = await db.GymSettings.AsNoTracking().FirstOrDefaultAsync(ct);
        var lines = new[]
        {
            gym?.GymName ?? "FITX", "GYM MANAGEMENT", "PAYMENT RECEIPT", "",
            $"Receipt Number: {payment.PaymentNumber}",
            $"Payment Date: {payment.PaymentDate:yyyy-MM-dd HH:mm}",
            $"Member: {payment.Member.FullName}",
            $"Member ID: {payment.Member.MemberCode}",
            $"Membership Plan: {payment.Membership?.Plan.Name ?? "N/A"}",
            $"Payment Amount: Rs. {payment.AmountPaid:N2}",
            $"Payment Method: {payment.PaymentMethod.Name}",
            $"Remaining Balance: Rs. {payment.RemainingAmount:N2}",
            $"Received By: {payment.ReceivedByUser.Name}", "",
            "Thank you. Train Better. Manage Smarter.",
            $"Generated: {DateTimeOffset.UtcNow:yyyy-MM-dd HH:mm} UTC"
        };
        return new ExportFile(BuildPdf(lines), "application/pdf", $"FITX-Receipt-{payment.PaymentNumber}.pdf");
    }

    private static byte[] BuildPdf(IEnumerable<string> lines)
    {
        var streamText = new StringBuilder("BT /F1 11 Tf 48 790 Td 18 TL ");
        foreach (var raw in lines)
        {
            var line = raw.Length > 90 ? raw[..87] + "..." : raw;
            var escaped = line.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
            streamText.Append('(').Append(escaped).Append(") Tj T* ");
        }
        streamText.Append("ET");
        var content = Encoding.ASCII.GetBytes(streamText.ToString());
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            $"<< /Length {content.Length} >>\nstream\n{Encoding.ASCII.GetString(content)}\nendstream",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
        };
        using var output = new MemoryStream();
        using var writer = new StreamWriter(output, Encoding.ASCII, 1024, true) { NewLine = "\n" };
        writer.WriteLine("%PDF-1.4"); writer.Flush(); var offsets = new List<long>();
        for (var i = 0; i < objects.Length; i++) { offsets.Add(output.Position); writer.WriteLine($"{i + 1} 0 obj"); writer.WriteLine(objects[i]); writer.WriteLine("endobj"); writer.Flush(); }
        var xref = output.Position; writer.WriteLine("xref"); writer.WriteLine($"0 {objects.Length + 1}"); writer.WriteLine("0000000000 65535 f ");
        foreach (var offset in offsets) writer.WriteLine($"{offset:0000000000} 00000 n ");
        writer.WriteLine($"trailer << /Size {objects.Length + 1} /Root 1 0 R >>"); writer.WriteLine("startxref"); writer.WriteLine(xref); writer.WriteLine("%%EOF"); writer.Flush();
        return output.ToArray();
    }
}
