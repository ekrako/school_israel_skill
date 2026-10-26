// Sender parsing ported from smartschool/models.py (Message.from_api) in
// https://github.com/Shanksg/smartschool-webtop
// Copyright (c) 2026 Shanksg, MIT License. See THIRD_PARTY_NOTICES.md.

export interface InboxMessage {
  readonly id: string | number | undefined;
  readonly subject: string;
  readonly sender: string;
  readonly sentAt: string;
  readonly hasRead: boolean;
  readonly hasFiles: boolean;
}

type Json = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function pick(entry: Json, ...keys: string[]): unknown {
  return keys
    .map((key) => entry[key])
    .find((value) => value !== undefined && value !== null && value !== "");
}

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

/** The API sends these flags as 0/1. */
function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return Number(value) === 1;
}

/**
 * Parses messageBox/GetMessagesInbox rows. Despite their names, `student_F_name` and
 * `student_L_name` hold the sender's first and last name; staff names read last-first.
 */
export function messagesFromInbox(data: unknown): InboxMessage[] {
  return (Array.isArray(data) ? data.filter(isObject) : []).map((row) => {
    const first = text(pick(row, "student_F_name", "senderFirstName"));
    const last = text(pick(row, "student_L_name", "senderLastName"));
    const id = pick(row, "messageId", "MessageId", "id", "Id");
    return {
      id: typeof id === "string" || typeof id === "number" ? id : undefined,
      subject: text(pick(row, "subject", "Subject")),
      sender: `${last} ${first}`.trim() || text(pick(row, "fromTitle", "userTitle")),
      sentAt: text(pick(row, "sendingDate", "SendingDate")),
      hasRead: flag(row.hasRead),
      hasFiles: flag(row.filesWereAttached),
    };
  });
}
