// What people send through the contact form. For now it stays here, and Péter reads it in the database.
import { collection } from "./db.ts";

export const MAX_MESSAGE = 5000;
// A cap for the whole site, so a script can't fill the database.
const PER_DAY = 50;
const KEEP_DAYS = 180;

type Message = { email: string; text: string; createdAt: Date };

function messages() {
  return collection<Message>("messages", [
    { key: { createdAt: 1 }, expireAfterSeconds: KEEP_DAYS * 86_400 },
  ]);
}

export type MessageInput = { email: string; text: string };

export function parseMessage(body: Record<string, unknown>): {
  input: MessageInput;
  errors: string[];
} {
  const field = (value: unknown) =>
    typeof value === "string" ? value.trim() : "";
  const input = { email: field(body.email), text: field(body.text) };
  const errors: string[] = [];
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    input.email.length > 200
  ) {
    errors.push("Add your email, so you can get an answer.");
  }
  if (!input.text) errors.push("Write your message.");
  if (input.text.length > MAX_MESSAGE) {
    errors.push(
      `Keep the message under ${MAX_MESSAGE.toLocaleString("en")} characters.`,
    );
  }
  return { input, errors };
}

// False when the day's messages are used up.
export async function saveMessage(input: MessageInput): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000);
  const today = await (await messages()).countDocuments({
    createdAt: { $gt: since },
  });
  if (today >= PER_DAY) return false;
  await (await messages()).insertOne({ ...input, createdAt: new Date() });
  return true;
}
