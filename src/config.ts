// Read when used, not at startup, so the app and the tests run without every variable set.
export function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

// For encryption keys: long enough that guessing them is hopeless.
export function secretEnv(name: string): string {
  const value = env(name);
  if (value.length < 32) {
    throw new Error(
      `${name} needs at least 32 characters: openssl rand -hex 32`,
    );
  }
  return value;
}
