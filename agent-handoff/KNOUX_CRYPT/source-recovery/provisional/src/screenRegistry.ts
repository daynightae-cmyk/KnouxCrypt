export const SCREEN_IDS = {
  SPLASH: "SPLASH",
  SECURE_ACCESS_LOGIN: "SECURE_ACCESS_LOGIN",
  HOME: "HOME",
  ENCRYPT: "ENCRYPT",
  VAULT: "VAULT",
  NOTES: "NOTES",
  PASSWORDS: "PASSWORDS",
  AUTHENTICATOR: "AUTHENTICATOR",
  KEY_FORGE: "KEY_FORGE",
  PRIVACY: "PRIVACY",
  BACKUP: "BACKUP",
  LOGIN: "LOGIN",
} as const;

export type ScreenId = (typeof SCREEN_IDS)[keyof typeof SCREEN_IDS];

export const screenRegistry: ReadonlyArray<{
  id: ScreenId;
  implemented: boolean;
}> = [
  { id: SCREEN_IDS.SPLASH, implemented: true },
  { id: SCREEN_IDS.SECURE_ACCESS_LOGIN, implemented: true },
  { id: SCREEN_IDS.HOME, implemented: true },
  { id: SCREEN_IDS.ENCRYPT, implemented: false },
  { id: SCREEN_IDS.VAULT, implemented: false },
  { id: SCREEN_IDS.NOTES, implemented: false },
  { id: SCREEN_IDS.PASSWORDS, implemented: false },
  { id: SCREEN_IDS.AUTHENTICATOR, implemented: false },
  { id: SCREEN_IDS.KEY_FORGE, implemented: false },
  { id: SCREEN_IDS.PRIVACY, implemented: false },
  { id: SCREEN_IDS.BACKUP, implemented: false },
  { id: SCREEN_IDS.LOGIN, implemented: false },
];
