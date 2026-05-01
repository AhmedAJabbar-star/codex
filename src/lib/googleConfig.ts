export interface GoogleConfig {
  sheetId: string;
  assignmentsGid: string;
  usersGid: string;
  archiveGid: string;
  serviceAccountEmail: string;
  clientId: string;
}

const KEY = 'google_sheet_config_v1';

const DEFAULT_CONFIG: GoogleConfig = {
  sheetId: '1vAuWBa1ERY0EYL2T-MMTO7MYM0yP7dGJP64dBCRMSzQ',
  assignmentsGid: '1147039908',
  usersGid: 'users',
  archiveGid: 'archive',
  serviceAccountEmail: '',
  clientId: '',
};

export function getGoogleConfig(): GoogleConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveGoogleConfig(cfg: GoogleConfig) {
  localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function buildCsvUrl(gid: string | number): string {
  const { sheetId } = getGoogleConfig();
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}
