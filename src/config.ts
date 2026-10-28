// Read when used, not at startup, so the app and the tests run without every variable set.
export function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}
