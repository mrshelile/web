import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const baseUrl = process.env.RISKLENS_WEB_URL ?? "https://engine.fastapicloud.dev/"
const profilePath = new URL("../sample_profile.json", import.meta.url)
const profile = JSON.parse(await readFile(profilePath, "utf8"))

const healthResponse = await fetch(`${baseUrl}/api/risk/health`)
assert.equal(healthResponse.status, 200, "Next.js health route should reach the engine")
const health = await healthResponse.json()
assert.equal(typeof health.ok, "boolean")
assert.equal(typeof health.rule_version, "string")

const scoreResponse = await fetch(`${baseUrl}/api/risk/score`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(profile),
})
assert.equal(scoreResponse.status, 200, "Next.js score route should return an engine result")
const score = await scoreResponse.json()
assert.equal(typeof score.risk_score, "number")
assert.equal(typeof score.data_confidence, "number")
assert.equal(typeof score.priority, "string")
assert.ok(Array.isArray(score.flags))

const invalidResponse = await fetch(`${baseUrl}/api/risk/score`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...profile, bank_transactions: [{ credit: 1_000_000 }] }),
})
assert.equal(invalidResponse.status, 400, "Next.js should reject excluded sources before forwarding")
const invalid = await invalidResponse.json()
assert.equal(invalid.error.code, "INVALID_PROFILE")

console.log("Risk engine integration passed: health, score, and invalid-profile rejection")
