import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVault, VAULT_STATE } from "../../hooks/useVault";
import { generatePassword } from "../../lib/passwordGenerator";

export { generatePassword };

export const PASSWORD_CATEGORIES = ["All", "Logins", "Cards", "Secure Notes", "Identity"];

/**
 * Preview-only fixture. It is clearly public, is never written to the encrypted
 * store, and is replaced by real records as soon as a vault is unlocked.
 */
export const PUBLIC_DEMO_PASSWORD = "Public-Demo-Only!23";

const demoNames = ["Example Account", "Sample Mail", "Demo Workspace", "Example Card", "Sample Note", "Demo Identity"];

export function createDemoAccounts() {
  return demoNames.map((title, index) => ({
    id: `sample-${index + 1}`,
    title,
    username: `demo${index + 1}@example.invalid`,
    website: "https://example.invalid",
    category: index < 3 ? "Logins" : PASSWORD_CATEGORIES[index - 1],
    password: PUBLIC_DEMO_PASSWORD,
  }));
}

function hydrate(record) {
  return {
    id: record.id,
    title: record.title || "Untitled",
    username: typeof record.username === "string" ? record.username : "",
    website: typeof record.website === "string" ? record.website : "",
    category: PASSWORD_CATEGORIES.includes(record.category) ? record.category : "Logins",
    password: typeof record.password === "string" ? record.password : "",
  };
}

const Context = createContext(null);

export function PasswordProvider({ children }) {
  const vault = useVault();
  const persisted = vault.state === VAULT_STATE.UNLOCKED;
  const sessionKey = vault.session?.sessionId ?? null;
  const [accounts, setAccounts] = useState(createDemoAccounts);
  const [selectedId, setSelectedId] = useState("sample-1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // `useVault()` returns a new object on every render, so it must not be an
  // effect dependency. The ref always points at the current bridge client.
  const vaultRef = useRef(vault);
  vaultRef.current = vault;
  // Mirrors the latest accounts so updates can be computed and persisted outside
  // the state updater (React may invoke an updater more than once, and a write
  // must not be duplicated).
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    let cancelled = false;
    if (!persisted) {
      setAccounts(createDemoAccounts());
      setError(null);
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    vaultRef.current
      .storeList("passwords")
      .then((res) => {
        if (cancelled) return;
        if (res && res.ok === false) {
          setError(res.error?.code || "STORE_ERROR");
          setAccounts([]);
        } else {
          const records = (res?.data?.records || []).map(hydrate);
          setError(null);
          setAccounts(records);
          setSelectedId(records[0]?.id || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("STORE_ERROR");
          setAccounts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [persisted, sessionKey]);

  const persist = useCallback(
    (record) => {
      if (!persisted) return;
      vaultRef.current.storePut("passwords", record).then((res) => {
        if (res && res.ok === false) setError(res.error?.code || "STORE_ERROR");
      });
    },
    [persisted],
  );

  const updateAccount = useCallback(
    (id, patch) => {
      const updated = accountsRef.current.find((item) => item.id === id);
      if (!updated) return;
      const next = { ...updated, ...patch };
      setAccounts((list) => list.map((item) => (item.id === id ? next : item)));
      persist(next);
    },
    [persist],
  );

  const createAccount = useCallback(() => {
    const record = {
      id: `cred-${Date.now().toString(36)}`,
      title: "New Credential",
      username: "",
      website: "",
      category: "Logins",
      password: generatePassword(20, { uppercase: true, lowercase: true, digits: true, symbols: true }),
    };
    setAccounts((current) => [record, ...current]);
    setSelectedId(record.id);
    persist(record);
    return record.id;
  }, [persist]);

  const removeAccount = useCallback(
    (id) => {
      setAccounts((current) => current.filter((item) => item.id !== id));
      if (!persisted) return;
      vaultRef.current.storeRemove("passwords", id).then((res) => {
        if (res && res.ok === false) setError(res.error?.code || "STORE_ERROR");
      });
    },
    [persisted],
  );

  const value = useMemo(
    () => ({
      accounts,
      selectedId,
      setSelectedId,
      updateAccount,
      createAccount,
      removeAccount,
      persisted,
      loading,
      error,
    }),
    [accounts, selectedId, updateAccount, createAccount, removeAccount, persisted, loading, error],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePasswords() {
  const value = useContext(Context);
  if (!value) throw new Error("PasswordProvider required");
  return value;
}
