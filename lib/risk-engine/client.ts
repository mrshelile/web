import "server-only"

import { RiskEngineError } from "./errors"
import { parseEngineHealth, parseScoreResult } from "./schemas"
import type { EngineHealth, ScoreResult, TaxpayerProfile } from "./types"

const DEFAULT_ENGINE_URL = "https://engine.fastapicloud.dev"
const HEALTH_TIMEOUT_MS = 5_000
const SCORE_TIMEOUT_MS = 15_000

function engineBaseUrl(): string {
  const configured = process.env.RISKLENS_ENGINE_URL?.trim() || DEFAULT_ENGINE_URL
  let url: URL
  try {
    url = new URL(configured)
  } catch {
    throw new RiskEngineError("ENGINE_CONFIGURATION", "Risk engine URL is invalid")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new RiskEngineError("ENGINE_CONFIGURATION", "Risk engine URL must use HTTP or HTTPS")
  }
  return configured.replace(/\/+$/, "")
}

async function requestJson(path: "/health" | "/score", init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${engineBaseUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) {
      const message =
        response.status === 401 || response.status === 403
          ? "Risk engine authentication failed"
          : `Risk engine returned HTTP ${response.status}`
      throw new RiskEngineError("ENGINE_HTTP_ERROR", message, response.status)
    }

    try {
      const text = await response.text()
      if (!text.trim()) {
        throw new RiskEngineError("ENGINE_INVALID_RESPONSE", "Risk engine returned an empty response", response.status)
      }
      return JSON.parse(text) as unknown
    } catch (error) {
      if (error instanceof RiskEngineError) throw error
      throw new RiskEngineError("ENGINE_INVALID_RESPONSE", "Risk engine returned invalid JSON", response.status)
    }
  } catch (error) {
    if (error instanceof RiskEngineError) throw error
    if (controller.signal.aborted) {
      throw new RiskEngineError("ENGINE_TIMEOUT", "Risk engine request timed out")
    }
    throw new RiskEngineError("ENGINE_UNAVAILABLE", "Risk engine is unavailable")
  } finally {
    clearTimeout(timeout)
  }
}

function serviceHeaders(json = false): Headers {
  const headers = new Headers()
  if (json) headers.set("Content-Type", "application/json")
  const key = process.env.RISKLENS_ENGINE_API_KEY
  if (key) headers.set("X-API-Key", key)
  return headers
}

export async function checkEngineHealth(): Promise<EngineHealth> {
  return parseEngineHealth(await requestJson("/health", { method: "GET", headers: serviceHeaders() }, HEALTH_TIMEOUT_MS))
}

export async function scoreProfile(profile: TaxpayerProfile): Promise<ScoreResult> {
  return parseScoreResult(
    await requestJson(
      "/score",
      { method: "POST", headers: serviceHeaders(true), body: JSON.stringify(profile) },
      SCORE_TIMEOUT_MS,
    ),
  )
}
