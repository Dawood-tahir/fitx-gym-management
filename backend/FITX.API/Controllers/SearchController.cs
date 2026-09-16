using FITX.API.Common;
using FITX.API.Contracts;
using FITX.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FITX.API.Controllers;

[Authorize(Roles = Roles.All), Route("api/search")]
public sealed class SearchController(ISearchService search) : ApiControllerBase
{
    [HttpGet]
    public async Task<ActionResult<ApiResponse<GlobalSearchResult>>> Get([FromQuery] string q, CancellationToken ct) => OkResponse(await search.SearchAsync(q ?? "", ct));
}
