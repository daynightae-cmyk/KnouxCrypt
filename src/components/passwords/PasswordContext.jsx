import React, { createContext, useContext, useState } from "react";
export const PASSWORD_CATEGORIES = [
  "All",
  "Logins",
  "Cards",
  "Secure Notes",
  "Identity",
];
export const PUBLIC_DEMO_PASSWORD = "Public-Demo-Only!23";
const names = [
  "Example Account",
  "Sample Mail",
  "Demo Workspace",
  "Example Card",
  "Sample Note",
  "Demo Identity",
];
export function createDemoAccounts() {
  return names.map((title, index) => ({
    id: `sample-${index + 1}`,
    title,
    username: `demo${index + 1}@example.invalid`,
    website: "https://example.invalid",
    category: index < 3 ? "Logins" : PASSWORD_CATEGORIES[index - 1],
    password: PUBLIC_DEMO_PASSWORD,
  }));
}
export function buildPreviewPassword(length, sets, revision = 0) {
  const pools = {
    uppercase: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    lowercase: "abcdefghjkmnpqrstuvwxyz",
    digits: "23456789",
    symbols: "!@#$%&*?",
  };
  const enabled = Object.keys(pools).filter((key) => sets[key]);
  if (!enabled.length) return "";
  const size = Math.min(64, Math.max(8, Math.round(Number(length) || 8)));
  // Deterministic/public by design: never presented as a security-grade generator.
  return Array.from({ length: size }, (_, i) => {
    const pool = pools[enabled[i % enabled.length]];
    return pool[(revision * 11 + i * 7) % pool.length];
  }).join("");
}
const Context = createContext(null);
export function PasswordProvider({ children }) {
  const [accounts, setAccounts] = useState(createDemoAccounts);
  const [selectedId, setSelectedId] = useState("sample-1");
  function updateAccount(id, patch) {
    setAccounts((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              title: patch.title ?? item.title,
              username: patch.username ?? item.username,
            }
          : item,
      ),
    );
  }
  // Password content cannot be replaced with user-entered secrets.
  return (
    <Context.Provider
      value={{ accounts, selectedId, setSelectedId, updateAccount }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePasswords() {
  const value = useContext(Context);
  if (!value) throw new Error("PasswordProvider required");
  return value;
}
