import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"

export function internalApiError(error: unknown, method: string, route: string): NextResponse {
  const requestId = randomUUID()
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "UnknownError", message: String(error) }

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "api.unhandled_error",
    requestId,
    method,
    route,
    error: details,
  }))

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "The server could not complete this request.",
        requestId,
      },
    },
    { status: 500, headers: { "X-Request-ID": requestId } },
  )
}
