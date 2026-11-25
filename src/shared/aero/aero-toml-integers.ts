import { parse as parseToml } from 'smol-toml'
import { z } from 'zod'

// Rust's serde rejects a decimal (`2.0`) for an `i64`/`u32`/`u64` field, while a JS number cannot tell
// `2` from `2.0`. So TOML is parsed with every integer as a bigint, and only the fields that Rust
// types as integers accept a bigint (mapped to a number); a float then fails validation like in Rust.
// That holds for modeled fields only: a key the schema does not declare is dropped without a type check.

const U32_MAX = 4_294_967_295n
const U64_MAX = 18_446_744_073_709_551_615n
const I64_MIN = -9_223_372_036_854_775_808n
const I64_MAX = 9_223_372_036_854_775_807n

/** Parses TOML text with integers as bigints; throws on malformed TOML. */
export function parseAeroToml(raw: string): unknown {
  return parseToml(raw, { integersAsBigInt: true })
}

function integerBetween(min: bigint, max: bigint, rustType: string): z.ZodType<number> {
  return z
    .bigint({ error: `expected an integer (${rustType}), not a decimal or another type` })
    .refine((value) => value >= min && value <= max, { error: `out of range for ${rustType}` })
    .transform(Number)
}

/** A Rust `i64` field. */
export const aeroI64 = integerBetween(I64_MIN, I64_MAX, 'i64')
/** A Rust `u32` field. */
export const aeroU32 = integerBetween(0n, U32_MAX, 'u32')
/** A Rust `u64` field. */
export const aeroU64 = integerBetween(0n, U64_MAX, 'u64')
/** A Rust `f64` field: serde also takes a TOML integer there. */
/** `z.number()` rejects `inf`/`nan`, which TOML allows and Rust's `f64` accepts. */
export const aeroF64 = z.union([
  z.number(),
  z.literal(Infinity),
  z.literal(-Infinity),
  z.nan(),
  z.bigint().transform(Number)
])
