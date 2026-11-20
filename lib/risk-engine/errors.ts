export type RiskEngineErrorCode =
  | "ENGINE_CONFIGURATION"
  | "ENGINE_TIMEOUT"
  | "ENGINE_UNAVAILABLE"
  | "ENGINE_HTTP_ERROR"
  | "ENGINE_INVALID_RESPONSE"

export class RiskEngineError extends Error {
  constructor(
    readonly code: RiskEngineErrorCode,
    message: string,
    readonly upstreamStatus?: number,
  ) {
    super(message)
    this.name = "RiskEngineError"
  }
}

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ProfileValidationError"
  }
}

export function publicEngineError(error: RiskEngineError): {
  status: number
  body: { error: { code: RiskEngineErrorCode; message: string } }
} {
  const status =
    error.code === "ENGINE_UNAVAILABLE" || error.code === "ENGINE_TIMEOUT"
      ? 503
      : error.code === "ENGINE_CONFIGURATION"
        ? 500
        : 502

  return {
    status,
    body: { error: { code: error.code, message: error.message } },
  }
}
