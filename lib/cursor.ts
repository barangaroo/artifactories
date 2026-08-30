import { isCanonicalBase64Url } from "@/lib/crypto";

export interface MessageCursor {
  createdAt: string;
  id: string;
}

function isCursorTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/,
  );
  if (!match) return false;
  const [, year, month, day, hour, minute, second, micros] = match;
  if (Number(year) < 1) return false;
  const timestamp = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${micros.slice(0, 3)}Z`,
  );
  return (
    !Number.isNaN(timestamp.getTime()) &&
    timestamp.getUTCFullYear() === Number(year) &&
    timestamp.getUTCMonth() + 1 === Number(month) &&
    timestamp.getUTCDate() === Number(day) &&
    timestamp.getUTCHours() === Number(hour) &&
    timestamp.getUTCMinutes() === Number(minute) &&
    timestamp.getUTCSeconds() === Number(second)
  );
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdAt, i: cursor.id }), "utf8").toString(
    "base64url",
  );
}

export function decodeMessageCursor(value: string): MessageCursor | null {
  if (value.length < 16 || value.length > 256 || !isCanonicalBase64Url(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.t !== "string" ||
      !isCursorTimestamp(record.t) ||
      typeof record.i !== "string" ||
      !/^msg_[A-Za-z0-9_-]{16}$/.test(record.i)
    ) {
      return null;
    }
    return { createdAt: record.t, id: record.i };
  } catch {
    return null;
  }
}
