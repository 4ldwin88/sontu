// Same symbol set as Supabase Auth's required-character policy.
const symbols = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
export function passwordChecks(value: string) {
  return [
    { label: "At least 8 characters", met: [...value].length >= 8 },
    { label: "One uppercase letter", met: /[A-Z]/.test(value) },
    { label: "One lowercase letter", met: /[a-z]/.test(value) },
    { label: "One number", met: /[0-9]/.test(value) },
    {
      label: "One special character",
      met: [...value].some((c) => symbols.includes(c)),
    },
  ];
}
export function safeAccountReturn(value: string | null) {
  return value &&
    /^\/(home|discover|event|events|feed|create|core|my-events|invite|connections|profile|settings|privacy|help|about|organizations)(\/|\?|$)/.test(
      value,
    ) &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/events";
}
