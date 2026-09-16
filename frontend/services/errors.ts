export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  details?: unknown;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return typeof value === "object" && value !== null;
}

const friendlyByCode: Record<string, string> = {
  "23505": "A record with the same unique value already exists.",
  "23503": "This record is linked to data that no longer exists.",
  "23514": "One or more values are outside the allowed range.",
  "42501": "You do not have permission to perform this action.",
  PGRST116: "The requested record could not be found.",
};

export function toApiError(error: unknown, fallback = "Something went wrong while contacting Supabase.") {
  if (error instanceof ApiError) return error;
  if (!isErrorLike(error)) return new ApiError(fallback);

  const code = typeof error.code === "string" ? error.code : "";
  const status = typeof error.status === "number" ? error.status : code === "42501" ? 403 : 500;
  const sourceMessage = typeof error.message === "string" ? error.message : "";
  const message =
    friendlyByCode[code] ??
    (sourceMessage.toLowerCase().includes("invalid login credentials")
      ? "The email or password is incorrect."
      : sourceMessage.toLowerCase().includes("email not confirmed")
        ? "Confirm your email address before signing in."
        : sourceMessage.toLowerCase().includes("failed to fetch")
          ? "Could not reach Supabase. Check your connection and try again."
          : fallback);

  return new ApiError(message, status, process.env.NODE_ENV === "development" ? error.details ?? error : undefined);
}

export function throwIfError(error: unknown, fallback?: string): asserts error is null {
  if (error) throw toApiError(error, fallback);
}
