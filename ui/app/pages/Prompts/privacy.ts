/**
 * Lightweight PII redaction for the Stream/Metadata views. Real implementation
 * runs server-side; this is a defense-in-depth pass that masks the most common
 * personally-identifiable patterns so a "Mask PII" toggle is meaningful even
 * when the upstream pipeline didn't redact.
 */

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE =
  /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC = /\b(?:\d[ -]*?){13,16}\b/g;
const TICKET = /\b[A-Z]{2,5}-\d{3,}\b/g;
/**
 * PNR (Passenger Name Record): 6 alphanumeric uppercase chars with at least
 * one letter — covers airline locator codes like "ABC123", "U1A2B3", etc.
 * The lookahead enforces "exactly 6 chars then word boundary" so we don't
 * eat into longer hex strings or trace IDs.
 */
const PNR = /\b(?=[A-Z0-9]{6}\b)[A-Z0-9]*[A-Z][A-Z0-9]*\b/g;

const apply = (input: string): string =>
  input
    .replace(EMAIL, "•••@•••")
    .replace(PHONE, "•••-•••-••••")
    .replace(SSN, "•••-••-••••")
    .replace(CC, "•••• •••• •••• ••••")
    .replace(TICKET, "•••-•••")
    .replace(PNR, "••••••");

export const maskPII = (text: string): string =>
  text && text.length > 0 ? apply(text) : text;
