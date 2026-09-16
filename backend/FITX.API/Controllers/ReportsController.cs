using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.OwnerOrAdmin), Route("api/reports")]
public sealed class ReportsController(IReportService reports) : ApiControllerBase
{
    [HttpGet("{type}")]
    public async Task<ActionResult<ApiResponse<ReportResponse>>> Generate(string type, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct) => OkResponse(await reports.GenerateAsync(type, from, to, ct));

    [HttpGet("{type}/export")]
    public async Task<IActionResult> Export(string type, [FromQuery] string format, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken ct)
    {
        var file = await reports.ExportAsync(type, format, from, to, ct); return File(file.Content, file.ContentType, file.FileName);
    }
}
