import { useEffect, useMemo, useState } from 'react';
import { useSalesContext } from './context';
import './TavernaCommandCenter.css';

type Vehicle = {
  vin: string;
  title?: string;
  price?: string | number;
  mileage?: string | number;
  drivetrain?: string;
  engine?: string;
  transmission?: string;
  location?: string;
  detail_url?: string;
  exterior?: string;
  interior?: string;
  photos?: unknown[];
  posted?: boolean;
  posted_at?: string | null;
  status_label?: string;
};

type VehiclesPayload = {
  items?: Vehicle[];
  source_status?: {
    active_source?: string;
    live_cache_count?: number;
    snapshot_count?: number;
    last_synced_at?: string;
    configured_url?: string;
  };
};

type Account = {
  id?: string;
  name?: string;
  email?: string;
  has_password?: boolean;
};

type PostLog = {
  vin?: string;
  timestamp?: number;
  file?: string;
};

type VehicleAssets = {
  vin: string;
  photos?: unknown[];
  sticker_url?: string | null;
  carfax_url?: string | null;
};

type BankRank = {
  bank_code: string;
  bank_name: string;
  confidence: number;
  reasons: string[];
};

type BankRecommendation = {
  best_bank?: BankRank;
  backup_bank?: BankRank;
  ranked_banks?: BankRank[];
  high_risk_flags?: string[];
  suggested_changes?: string[];
};

type AnalyzePayload = {
  metrics?: {
    score?: number | null;
    tradelines?: number | null;
    derogatories?: number | null;
    utilization?: number | null;
    dti?: number | null;
  };
  recommendation?: BankRecommendation;
};

type StructurePayload = {
  structure?: {
    financed_amount?: number;
    estimated_payment?: number;
    ltv?: number | null;
    pti?: number | null;
    dti?: number | null;
  };
  recommendation?: BankRecommendation;
};

type RouteOneDocsStatus = {
  ok?: boolean;
  doc_count?: number;
  decoded_doc_count?: number;
  generated_profiles_count?: number;
  sales_assistant_policies_count?: number;
  last_decoded_at?: string | null;
};

type PermissionOption = {
  id: string;
  label: string;
};

type XconsoleUser = {
  username: string;
  display_name?: string;
  role?: 'admin' | 'manager' | 'operator' | string;
  active?: boolean;
  permissions?: string[];
};

type LeadItem = {
  id: string;
  customer_name?: string;
  channel?: string;
  message?: string;
  vehicle_vin?: string;
  status?: string;
  created_at?: string;
  last_message_at?: string;
};

type OfferUpStatus = {
  ready_for_live?: boolean;
  mode?: string;
  reason?: string;
  drafts_count?: number;
  posts?: Record<string, unknown>;
};

type StackStatus = {
  stack_readiness?: {
    ready_for_live_facebook_posting?: boolean;
    components?: {
      live_requirements?: Record<string, unknown>;
    };
  };
  live_requirements?: Record<string, unknown>;
  sales_assistant?: {
    ok?: boolean;
    banks_count?: number;
  };
};

type VinDecodePayload = {
  ok?: boolean;
  source?: string;
  fields?: {
    year?: string | number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    body_class?: string | null;
    drive_type?: string | null;
    engine?: string | null;
  };
};

type VehicleBankBrainPayload = {
  default_structure?: StructurePayload['structure'];
  recommendation?: BankRecommendation & { collateral_flags?: string[] };
  packet_guidance?: string[];
  assumptions?: string[];
  carfax_summary?: Record<string, unknown> | null;
};

type OneClickPostPayload = {
  post_result?: {
    mode?: 'live' | 'draft';
    live_success?: boolean;
  };
  selected_photo_indexes?: number[];
  selection_fallback_used?: boolean;
};

type VehicleTitleParts = {
  year: string;
  make: string;
  model: string;
  trim: string;
};

const THUMBNAIL_SKIP = [0, 2];
const DEFAULT_PERMISSION_OPTIONS: PermissionOption[] = [
  { id: 'inventory.view', label: 'Inventory' },
  { id: 'inventory.edit', label: 'Edit Cars' },
  { id: 'facebook.post', label: 'Facebook Post' },
  { id: 'facebook.leads', label: 'Messenger Leads' },
  { id: 'offerup.post', label: 'OfferUp' },
  { id: 'bankbrain.view', label: 'Bank Brain' },
  { id: 'bankbrain.train', label: 'Train Banks' },
  { id: 'users.manage', label: 'Users' },
  { id: 'admin.full', label: 'Admin' },
];

function vin(value: string | undefined | null): string {
  return String(value || '').trim().toUpperCase();
}

function num(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === undefined || value === null) return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: string | number | undefined | null): string {
  const parsed = num(value);
  return parsed === null ? '$0' : `$${parsed.toLocaleString()}`;
}

function miles(value: string | number | undefined): string {
  const parsed = num(value);
  return parsed === null ? 'n/a' : `${parsed.toLocaleString()} mi`;
}

function extractPhotoUrl(item: unknown): string | null {
  if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;
    for (const key of ['url', 'src', 'image', 'photo']) {
      const value = record[key];
      if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
    }
  }
  return null;
}

function normalizePhotos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of value) {
    const url = extractPhotoUrl(item);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

function nowText(value: string | undefined | null): string {
  if (!value) return 'n/a';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? value : dt.toLocaleString();
}

function defaultCaption(vehicle: Vehicle | undefined): string {
  if (!vehicle) return '';
  const lines = [vehicle.title || vehicle.vin, `Price: ${money(vehicle.price)}`, `Mileage: ${miles(vehicle.mileage)}`];
  if (vehicle.location) lines.push(`Location: ${vehicle.location}`);
  if (vehicle.detail_url) lines.push(vehicle.detail_url);
  return lines.join('\n');
}

function resolveVehiclePhotos(vehicle: Vehicle | undefined, assets?: VehicleAssets): string[] {
  const fromAssets = normalizePhotos(assets?.photos);
  return fromAssets.length ? fromAssets : normalizePhotos(vehicle?.photos);
}

function parseVehicleTitleParts(vehicle: Vehicle | undefined): VehicleTitleParts {
  const title = String(vehicle?.title || '').trim();
  if (!title) {
    return { year: 'n/a', make: 'n/a', model: 'n/a', trim: 'n/a' };
  }

  const tokens = title.split(/\s+/).filter(Boolean);
  const year = /^\d{4}$/.test(tokens[0] || '') ? tokens[0] : 'n/a';
  const make = year !== 'n/a' ? tokens[1] || 'n/a' : tokens[0] || 'n/a';
  const model = year !== 'n/a' ? tokens[2] || 'n/a' : tokens[1] || 'n/a';
  const trimStart = year !== 'n/a' ? 3 : 2;
  const trim = tokens.slice(trimStart).join(' ') || 'n/a';

  return { year, make, model, trim };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function structuredError(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.detail) return structuredError(record.detail);
    try {
      return JSON.stringify(payload);
    } catch {
      return 'Request failed';
    }
  }
  return 'Request failed';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) throw new Error(structuredError(payload));
  return payload as T;
}

export function TavernaCommandCenter() {
  const { selectedVin, setSelectedVin } = useSalesContext();

  const [inventory, setInventory] = useState<Vehicle[]>([]);
  const [sourceStatus, setSourceStatus] = useState<VehiclesPayload['source_status'] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<PostLog[]>([]);
  const [assetsByVin, setAssetsByVin] = useState<Record<string, VehicleAssets>>({});

  const [statusText, setStatusText] = useState('Loading Taverna v2...');
  const [search, setSearch] = useState('');
  const [dealershipUrl, setDealershipUrl] = useState('');
  const [commandBar, setCommandBar] = useState('');
  const [mode, setMode] = useState<'vehicle' | 'pipeline'>('vehicle');
  const [tab, setTab] = useState<'overview' | 'marketing' | 'finance'>('overview');

  const [caption, setCaption] = useState('');
  const [accountId, setAccountId] = useState('');
  const [marketingFlags, setMarketingFlags] = useState({
    includePrice: true,
    includeDownPromo: false,
    includeFinancing: true,
  });
  const [promoDown, setPromoDown] = useState('999');
  const [photoOrder, setPhotoOrder] = useState<number[]>([]);
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<number[]>([]);
  const [dragPhotoIndex, setDragPhotoIndex] = useState<number | null>(null);

  const [dealCost, setDealCost] = useState('');
  const [dealNotes, setDealNotes] = useState('');

  const [structureForm, setStructureForm] = useState({
    salePrice: '',
    down: '0',
    trade: '0',
    taxes: '0',
    fees: '0',
    backend: '0',
    term: '72',
    apr: '9.99',
    monthlyIncome: '',
    currentDti: '',
    score: '',
    tradelines: '',
    derogatories: '',
    utilization: '',
  });

  const [analysisText, setAnalysisText] = useState('');
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzePayload | null>(null);
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [inCreditByVin, setInCreditByVin] = useState<Record<string, boolean>>({});
  const [submittedByVin, setSubmittedByVin] = useState<Record<string, boolean>>({});

  const [postResult, setPostResult] = useState<OneClickPostPayload | null>(null);
  const [showSticker, setShowSticker] = useState(false);
  const [showCarfax, setShowCarfax] = useState(false);

  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [quickEdit, setQuickEdit] = useState({ vin: '', title: '', price: '', mileage: '' });

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);

  const selected = useMemo(
    () => inventory.find((item) => vin(item.vin) === vin(selectedVin)),
    [inventory, selectedVin],
  );
  const selectedAssets = vin(selectedVin) ? assetsByVin[vin(selectedVin)] : undefined;
  const selectedPhotos = useMemo(() => {
    const fromAssets = normalizePhotos(selectedAssets?.photos);
    return fromAssets.length ? fromAssets : normalizePhotos(selected?.photos);
  }, [selectedAssets?.photos, selected?.photos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) => {
      const blob = [item.vin, item.title || '', item.status_label || '', String(item.price || '')]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [inventory, search]);

  const orderedPhotoIndexes = photoOrder.length
    ? photoOrder.filter((index) => index >= 0 && index < selectedPhotos.length)
    : selectedPhotos.map((_, index) => index);

  const enhancedCaption = useMemo(() => {
    let text = caption || defaultCaption(selected);
    if (!marketingFlags.includePrice) {
      text = text.replace(/^Price:.*$/gim, '').replace(/\n{2,}/g, '\n').trim();
    }
    if (marketingFlags.includeDownPromo) {
      text = `${text}\nDown payment promo from ${money(promoDown)} down.`;
    }
    if (marketingFlags.includeFinancing) {
      text = `${text}\nFinancing options available.`;
    }
    return text.trim();
  }, [caption, marketingFlags.includeDownPromo, marketingFlags.includeFinancing, marketingFlags.includePrice, promoDown, selected]);

  const frontGross = (num(selected?.price) ?? 0) - (num(dealCost) ?? 0);
  const backGross = num(structureForm.backend) ?? 0;

  const pipeline = {
    posted: inventory.filter((item) => item.posted).length,
    awaitingCredit: inventory.filter((item) => !inCreditByVin[vin(item.vin)]).length,
    inStructuring: Object.values(inCreditByVin).filter(Boolean).length,
    submitted: Object.values(submittedByVin).filter(Boolean).length,
    funded: posts.length,
  };

  async function refresh() {
    setRefreshBusy(true);
    try {
      const [vehicles, accountsRes, postsRes, meRes, usersRes, leadsRes, offerupRes, statusRes] = await Promise.all([
        requestJson<VehiclesPayload>('/api/vehicles'),
        requestJson<{ items?: Account[] }>('/api/facebook/accounts'),
        requestJson<{ items?: PostLog[] }>('/api/facebook/posts'),
        requestJson<{ user?: XconsoleUser; permissions?: PermissionOption[] }>('/api/me').catch(() => ({ user: null, permissions: DEFAULT_PERMISSION_OPTIONS })),
        requestJson<{ items?: XconsoleUser[]; permissions?: PermissionOption[] }>('/api/admin/users').catch(() => ({ items: [] })),
        requestJson<{ items?: LeadItem[] }>('/api/leads/inbox').catch(() => ({ items: [] })),
        requestJson<OfferUpStatus>('/api/offerup/status').catch(() => null),
        requestJson<StackStatus>('/api/status').catch(() => null),
      ]);
      const items = Array.isArray(vehicles.items) ? vehicles.items : [];
      setInventory(items);
      setSourceStatus(vehicles.source_status || null);
      setMe(meRes.user || null);
      if (Array.isArray(meRes.permissions)) setPermissionOptions(meRes.permissions);
      if (Array.isArray(usersRes.items)) setUsers(usersRes.items);
      if (Array.isArray(usersRes.permissions)) setPermissionOptions(usersRes.permissions);
      setLeads(Array.isArray(leadsRes.items) ? leadsRes.items : []);
      setOfferup(offerupRes);
      setStackStatus(statusRes);
      if (!dealershipUrl && vehicles.source_status?.configured_url) {
        setDealershipUrl(String(vehicles.source_status.configured_url));
      }
      const accountItems = Array.isArray(accountsRes.items) ? accountsRes.items : [];
      setAccounts(accountItems);
      if (!accountId) {
        const best = accountItems.find((item) => item.id && item.has_password)?.id;
        const fallback = accountItems.find((item) => item.id)?.id;
        if (best || fallback) setAccountId(String(best || fallback));
      }
      setPosts(Array.isArray(postsRes.items) ? postsRes.items : []);
      if (!items.some((item) => vin(item.vin) === vin(selectedVin)) && items.length) {
        setSelectedVin(vin(items[0].vin));
      }
      setStatusText(`Inventory ${items.length} | Source ${vehicles.source_status?.active_source || 'runtime'}`);
    } catch (error: unknown) {
      setStatusText(`Refresh failed: ${String(error)}`);
    } finally {
      setRefreshBusy(false);
    }
  }

  async function syncInventory() {
    setSyncBusy(true);
    try {
      await requestJson('/api/inventory/sync-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: dealershipUrl || undefined, timeout_seconds: 30, persist: true }),
      });
      setStatusText('Inventory sync complete.');
      await refresh();
    } catch (error: unknown) {
      setStatusText(`Sync failed: ${String(error)}`);
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadAssets(targetVin: string, force = false) {
    const clean = vin(targetVin);
    if (!clean) return;
    if (!force && assetsByVin[clean]) return;
    try {
      const payload = await requestJson<VehicleAssets>(`/api/vehicles/${encodeURIComponent(clean)}/assets${force ? '?refresh=true' : ''}`);
      setAssetsByVin((previous) => ({ ...previous, [clean]: payload }));
    } catch {
      // Keep UI responsive if assets fail.
    }
  }

  async function post(modeOverride: 'live' | 'draft' = 'live', targetVin?: string) {
    const clean = vin(targetVin || selectedVin);
    if (!clean) {
      setStatusText('Select a vehicle first.');
      return;
    }
    const orderedSelected = orderedPhotoIndexes.filter((index) => selectedPhotoIndexes.includes(index));
    setPostBusy(true);
    try {
      const payload = await requestJson<OneClickPostPayload>('/api/facebook/post/from-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: clean,
          mode: modeOverride,
          account_id: accountId || undefined,
          caption_override: clean === vin(selectedVin) ? enhancedCaption : undefined,
          selected_photo_indexes: clean === vin(selectedVin) ? orderedSelected : [],
          skip_photo_indexes: THUMBNAIL_SKIP,
          auto_import_photos: true,
          photo_limit: 24,
        }),
      });
      setPostResult(payload);
      setStatusText(payload.post_result?.live_success ? `Posted ${clean}` : `Post saved for ${clean}`);
      await refresh();
    } catch (error: unknown) {
      setStatusText(`Facebook post failed: ${String(error)}`);
    } finally {
      setPostBusy(false);
    }
  }

  const [uploadBusy, setUploadBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [bankProfiles, setBankProfiles] = useState<Array<{ code: string; name: string }>>([]);
  const [bankHistory, setBankHistory] = useState<Array<{ bank_code?: string; outcome?: string; created_at?: string }>>([]);
  const [routeoneDocs, setRouteoneDocs] = useState<RouteOneDocsStatus | null>(null);
  const [routeoneBank, setRouteoneBank] = useState('');
  const [routeoneFiles, setRouteoneFiles] = useState<FileList | null>(null);
  const [routeoneBusy, setRouteoneBusy] = useState(false);
  const [me, setMe] = useState<XconsoleUser | null>(null);
  const [users, setUsers] = useState<XconsoleUser[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<PermissionOption[]>(DEFAULT_PERMISSION_OPTIONS);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    display_name: '',
    role: 'operator',
    permissions: ['inventory.view', 'facebook.post', 'facebook.leads', 'offerup.post', 'bankbrain.view'],
    active: true,
  });
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [leadDrafts, setLeadDrafts] = useState<Record<string, string>>({});
  const [manualLead, setManualLead] = useState({ customer_name: '', message: '', vehicle_vin: '', channel: 'facebook' });
  const [offerup, setOfferup] = useState<OfferUpStatus | null>(null);
  const [stackStatus, setStackStatus] = useState<StackStatus | null>(null);
  const [vinDecode, setVinDecode] = useState<VinDecodePayload | null>(null);
  const [vehicleBrain, setVehicleBrain] = useState<VehicleBankBrainPayload | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);
  const [offerupBusy, setOfferupBusy] = useState(false);
  const [intelBusy, setIntelBusy] = useState(false);

  function can(permission: string): boolean {
    const permissions = new Set(me?.permissions || []);
    return permissions.has('admin.full') || permissions.has(permission);
  }

  function toggleNewUserPermission(permission: string) {
    setNewUser((previous) => {
      const current = new Set(previous.permissions);
      if (current.has(permission)) current.delete(permission);
      else current.add(permission);
      return { ...previous, permissions: Array.from(current) };
    });
  }

  async function saveUser() {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      setStatusText('Username and password are required for a new user.');
      return;
    }
    setAdminBusy(true);
    try {
      const payload = await requestJson<{ items?: XconsoleUser[] }>('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      setUsers(Array.isArray(payload.items) ? payload.items : []);
      setNewUser({
        username: '',
        password: '',
        display_name: '',
        role: 'operator',
        permissions: ['inventory.view', 'facebook.post', 'facebook.leads', 'offerup.post', 'bankbrain.view'],
        active: true,
      });
      setStatusText('User access saved.');
    } catch (error: unknown) {
      setStatusText(`User save failed: ${String(error)}`);
    } finally {
      setAdminBusy(false);
    }
  }

  async function toggleExistingUserPermission(user: XconsoleUser, permission: string) {
    if (!user.username) return;
    const current = new Set(user.permissions || []);
    if (current.has(permission)) current.delete(permission);
    else current.add(permission);
    setAdminBusy(true);
    try {
      const payload = await requestJson<{ items?: XconsoleUser[] }>(`/api/admin/users/${encodeURIComponent(user.username)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          display_name: user.display_name || user.username,
          role: user.role || 'operator',
          permissions: Array.from(current),
          active: user.active !== false,
        }),
      });
      setUsers(Array.isArray(payload.items) ? payload.items : []);
      setStatusText(`Permissions updated for ${user.username}.`);
    } catch (error: unknown) {
      setStatusText(`Permission update failed: ${String(error)}`);
    } finally {
      setAdminBusy(false);
    }
  }

  async function addManualLead() {
    const message = manualLead.message.trim();
    if (!message) {
      setStatusText('Lead message is required.');
      return;
    }
    setLeadBusy(true);
    try {
      const payload = await requestJson<{ items?: LeadItem[] }>('/api/leads/manual-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...manualLead,
          customer_name: manualLead.customer_name || 'Unknown Lead',
          vehicle_vin: manualLead.vehicle_vin || vin(selectedVin),
        }),
      });
      setLeads(Array.isArray(payload.items) ? payload.items : []);
      setManualLead({ customer_name: '', message: '', vehicle_vin: '', channel: 'facebook' });
      setStatusText('Lead added to inbox.');
    } catch (error: unknown) {
      setStatusText(`Lead add failed: ${String(error)}`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function respondToLead(lead: LeadItem) {
    const responseText =
      leadDrafts[lead.id]?.trim() ||
      `Thanks for reaching out. I can help with ${lead.vehicle_vin || selected?.title || 'this vehicle'} today.`;
    setLeadBusy(true);
    try {
      const payload = await requestJson<{ items?: LeadItem[] }>('/api/leads/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          response_text: responseText,
          channel: lead.channel || 'facebook',
          mark_status: 'responded',
        }),
      });
      setLeads(Array.isArray(payload.items) ? payload.items : []);
      setLeadDrafts((previous) => ({ ...previous, [lead.id]: '' }));
      setStatusText('Lead response logged.');
    } catch (error: unknown) {
      setStatusText(`Lead response failed: ${String(error)}`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function syncFacebookLeads() {
    setLeadBusy(true);
    try {
      const payload = await requestJson<{ items?: LeadItem[]; mode?: string; guidance?: string[] }>('/api/leads/sync-facebook', {
        method: 'POST',
      });
      setLeads(Array.isArray(payload.items) ? payload.items : []);
      setStatusText(payload.guidance?.[0] || `Facebook lead sync: ${payload.mode || 'complete'}`);
    } catch (error: unknown) {
      setStatusText(`Facebook lead sync failed: ${String(error)}`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function offerupPost(modeOverride: 'draft' | 'live' = 'draft') {
    const clean = vin(selectedVin);
    if (!clean) {
      setStatusText('Select a vehicle before creating an OfferUp post.');
      return;
    }
    setOfferupBusy(true);
    try {
      const payload = await requestJson<{ status?: OfferUpStatus; live_detail?: string }>('/api/offerup/post/from-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: clean,
          mode: modeOverride,
          caption_override: enhancedCaption,
        }),
      });
      setOfferup(payload.status || null);
      setStatusText(modeOverride === 'draft' ? `OfferUp draft created for ${clean}.` : payload.live_detail || 'OfferUp live attempt finished.');
    } catch (error: unknown) {
      setStatusText(`OfferUp failed: ${String(error)}`);
    } finally {
      setOfferupBusy(false);
    }
  }

  async function loadVehicleIntel(targetVin: string) {
    const clean = vin(targetVin);
    if (!clean) return;
    setIntelBusy(true);
    try {
      const [decodeRes, brainRes] = await Promise.all([
        requestJson<VinDecodePayload>(`/api/vehicles/${encodeURIComponent(clean)}/decode`).catch(() => null),
        requestJson<VehicleBankBrainPayload>(`/api/bank-brain/vehicle/${encodeURIComponent(clean)}`).catch(() => null),
      ]);
      setVinDecode(decodeRes);
      setVehicleBrain(brainRes);
    } finally {
      setIntelBusy(false);
    }
  }

  const postedVinSet = useMemo(() => {
    const ids = new Set<string>();
    for (const item of posts) {
      const clean = vin(item.vin);
      if (clean) ids.add(clean);
    }
    return ids;
  }, [posts]);

  const bestBank = structure?.recommendation?.best_bank || analysis?.recommendation?.best_bank;
  const backupBank = structure?.recommendation?.backup_bank || analysis?.recommendation?.backup_bank;
  const rankedBanks = structure?.recommendation?.ranked_banks || analysis?.recommendation?.ranked_banks || [];
  const vehicleBestBank = vehicleBrain?.recommendation?.best_bank;
  const vehicleBackupBank = vehicleBrain?.recommendation?.backup_bank;
  const riskFlags = [
    ...(analysis?.recommendation?.high_risk_flags || []),
    ...(structure?.recommendation?.high_risk_flags || []),
    ...(vehicleBrain?.recommendation?.collateral_flags || []),
  ];
  const suggestions = [
    ...(analysis?.recommendation?.suggested_changes || []),
    ...(structure?.recommendation?.suggested_changes || []),
  ];

  function optionalNumber(value: string): number | null {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function analyzeTextInput() {
    const structured: Record<string, number> = {};
    for (const [key, raw] of Object.entries({
      score: structureForm.score,
      tradelines: structureForm.tradelines,
      derogatories: structureForm.derogatories,
      utilization: structureForm.utilization,
      dti: structureForm.currentDti,
    })) {
      const parsed = optionalNumber(raw);
      if (parsed !== null) structured[key] = parsed;
    }

    if (!analysisText.trim() && !Object.keys(structured).length) {
      setStatusText('Enter report text or metrics to analyze.');
      return;
    }

    setAnalyzeBusy(true);
    try {
      const payload = await requestJson<AnalyzePayload>('/api/bank-brain/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_text: analysisText || undefined,
          structured_data: structured,
        }),
      });
      setAnalysis(payload);
      if (selected) setInCreditByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setTab('finance');
      setStatusText('Credit analysis complete.');
    } catch (error: unknown) {
      setStatusText(`Credit analysis failed: ${String(error)}`);
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function analyzeUpload() {
    if (!analysisFile) {
      setStatusText('Choose a credit report file first.');
      return;
    }
    setUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', analysisFile);
      const payload = await requestJson<AnalyzePayload>('/api/bank-brain/analyze-upload', {
        method: 'POST',
        body: formData,
      });
      setAnalysis(payload);
      if (selected) setInCreditByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setTab('finance');
      setStatusText(`Credit report analyzed: ${analysisFile.name}`);
    } catch (error: unknown) {
      setStatusText(`Credit upload failed: ${String(error)}`);
    } finally {
      setUploadBusy(false);
    }
  }

  async function simulateStructure(overrides?: Partial<typeof structureForm>) {
    const merged = { ...structureForm, ...(overrides || {}) };
    const salePrice = optionalNumber(merged.salePrice);
    if (!salePrice || salePrice <= 0) {
      setStatusText('Sale price must be greater than 0.');
      return;
    }

    if (overrides) {
      setStructureForm((previous) => ({ ...previous, ...overrides }));
    }

    setStructureBusy(true);
    try {
      const downTotal = (optionalNumber(merged.down) ?? 0) + (optionalNumber(merged.trade) ?? 0);
      const payload = await requestJson<StructurePayload>('/api/bank-brain/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: vin(selectedVin) || undefined,
          vehicle_price: salePrice,
          taxes: optionalNumber(merged.taxes) ?? 0,
          fees: optionalNumber(merged.fees) ?? 0,
          backend_products: optionalNumber(merged.backend) ?? 0,
          down_payment: downTotal,
          term_months: optionalNumber(merged.term) ?? 72,
          apr: optionalNumber(merged.apr) ?? 9.99,
          monthly_income: optionalNumber(merged.monthlyIncome),
          current_dti: optionalNumber(merged.currentDti),
          credit_score: optionalNumber(merged.score),
          tradelines: optionalNumber(merged.tradelines),
          derogatories: optionalNumber(merged.derogatories),
          utilization: optionalNumber(merged.utilization),
        }),
      });
      setStructure(payload);
      if (selected) setInCreditByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setStatusText('Structure simulation complete.');
    } catch (error: unknown) {
      setStatusText(`Structure simulation failed: ${String(error)}`);
    } finally {
      setStructureBusy(false);
    }
  }

  async function logDecision(outcome: 'approved' | 'declined' | 'countered') {
    const bankCode = bestBank?.bank_code || vehicleBestBank?.bank_code || backupBank?.bank_code || vehicleBackupBank?.bank_code;
    if (!bankCode) {
      setStatusText('No lender recommendation available.');
      return;
    }

    setDecisionBusy(true);
    try {
      await requestJson('/api/bank-brain/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: vin(selectedVin) || undefined,
          bank_code: bankCode,
          outcome,
          notes: decisionNotes || undefined,
          metrics: analysis?.metrics || {},
        }),
      });
      const historyPayload = await requestJson<{ items?: Array<{ bank_code?: string; outcome?: string; created_at?: string }> }>(
        '/api/bank-brain/history?limit=30',
      ).catch(() => ({ items: [] }));
      setBankHistory(Array.isArray(historyPayload.items) ? historyPayload.items : []);
      if (selected) setSubmittedByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setDecisionNotes('');
      setStatusText(`Decision logged: ${bankCode} ${outcome}.`);
    } catch (error: unknown) {
      setStatusText(`Failed to log decision: ${String(error)}`);
    } finally {
      setDecisionBusy(false);
    }
  }

  async function refreshRouteOneDocs() {
    try {
      const payload = await requestJson<RouteOneDocsStatus>('/api/bank-brain/docs/status');
      setRouteoneDocs(payload);
    } catch {
      setRouteoneDocs(null);
    }
  }

  async function uploadRouteOneDocs() {
    if (!routeoneFiles?.length) {
      setStatusText('Choose RouteOne forms first.');
      return;
    }

    const form = new FormData();
    Array.from(routeoneFiles).forEach((file) => form.append('files', file));
    if (routeoneBank.trim()) form.append('bank', routeoneBank.trim());
    form.append('rebuild', 'true');
    form.append('reload_sales_data', 'true');

    setRouteoneBusy(true);
    try {
      const payload = await requestJson<{ status?: RouteOneDocsStatus }>('/api/bank-brain/docs/upload', {
        method: 'POST',
        body: form,
      });
      setRouteoneDocs(payload.status || null);
      const lenderPayload = await requestJson<{ items?: Array<{ code: string; name: string }> }>('/api/bank-brain/lenders')
        .catch(() => ({ items: [] }));
      setBankProfiles(Array.isArray(lenderPayload.items) ? lenderPayload.items : []);
      setRouteoneFiles(null);
      setStatusText(`RouteOne forms loaded. Bank Brain now has ${payload.status?.generated_profiles_count || bankProfiles.length} lender profiles.`);
    } catch (error: unknown) {
      setStatusText(`RouteOne upload failed: ${String(error)}`);
    } finally {
      setRouteoneBusy(false);
    }
  }

  async function rebuildRouteOneDocs() {
    setRouteoneBusy(true);
    try {
      const payload = await requestJson<{ status?: RouteOneDocsStatus }>('/api/bank-brain/docs/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reload_sales_data: true, max_link_depth: 1, max_links_per_resource: 12 }),
      });
      setRouteoneDocs(payload.status || null);
      setStatusText(`Bank Brain rebuilt from ${payload.status?.doc_count || 0} RouteOne docs.`);
    } catch (error: unknown) {
      setStatusText(`RouteOne rebuild failed: ${String(error)}`);
    } finally {
      setRouteoneBusy(false);
    }
  }

  function openQuickEdit(vehicle?: Vehicle) {
    if (!vehicle) {
      setQuickEdit({ vin: '', title: '', price: '', mileage: '' });
      setQuickEditOpen(true);
      return;
    }

    setQuickEdit({
      vin: vin(vehicle.vin),
      title: vehicle.title || '',
      price: num(vehicle.price) !== null ? String(num(vehicle.price)) : String(vehicle.price || ''),
      mileage: num(vehicle.mileage) !== null ? String(num(vehicle.mileage)) : String(vehicle.mileage || ''),
    });
    setQuickEditOpen(true);
  }

  async function saveQuickEdit() {
    const cleanVin = vin(quickEdit.vin);
    if (!cleanVin || !quickEdit.title.trim()) {
      setStatusText('VIN and title are required.');
      return;
    }
    try {
      await requestJson('/api/vehicles/manual-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: cleanVin,
          title: quickEdit.title.trim(),
          price: optionalNumber(quickEdit.price) ?? (quickEdit.price || null),
          mileage: optionalNumber(quickEdit.mileage) ?? (quickEdit.mileage || null),
          photos: [],
        }),
      });
      setQuickEditOpen(false);
      setSelectedVin(cleanVin);
      setStatusText(`Saved vehicle ${cleanVin}.`);
      await refresh();
    } catch (error: unknown) {
      setStatusText(`Vehicle save failed: ${String(error)}`);
    }
  }

  function togglePhoto(index: number) {
    setSelectedPhotoIndexes((previous) => {
      if (previous.includes(index)) return previous.filter((value) => value !== index);
      return [...previous, index].sort((a, b) => a - b);
    });
  }

  function movePhoto(sourceIndex: number, targetIndex: number) {
    setPhotoOrder((previous) => {
      const sourcePosition = previous.indexOf(sourceIndex);
      const targetPosition = previous.indexOf(targetIndex);
      if (sourcePosition < 0 || targetPosition < 0 || sourcePosition === targetPosition) return previous;
      const next = [...previous];
      next.splice(sourcePosition, 1);
      next.splice(targetPosition, 0, sourceIndex);
      return next;
    });
  }

  async function runCommand() {
    const raw = commandBar.trim().toLowerCase();
    if (!raw) return;
    const cmd = raw.startsWith('/') ? raw.slice(1) : raw;

    if (cmd === 'post this') {
      setMode('vehicle');
      setTab('marketing');
      await post('live');
      setCommandBar('');
      return;
    }
    if (cmd === 'best bank?' || cmd === 'best bank') {
      setMode('vehicle');
      setTab('finance');
      if (!analysis && !structure) {
        await simulateStructure();
      }
      setCommandBar('');
      return;
    }
    if (cmd === 'simulate 0 down') {
      setMode('vehicle');
      setTab('finance');
      await simulateStructure({ down: '0', trade: '0' });
      setCommandBar('');
      return;
    }
    if (cmd === 'lower price 1k') {
      if (!selected) {
        setStatusText('Select a vehicle first.');
      } else {
        const current = num(selected.price);
        if (current === null) {
          setStatusText('Current price is not numeric.');
        } else {
          openQuickEdit({ ...selected, price: Math.max(0, current - 1000) });
          setStatusText('Prepared quick edit with a $1,000 reduction.');
        }
      }
      setCommandBar('');
      return;
    }
    if (cmd === 'why decline?' || cmd === 'why decline') {
      setMode('vehicle');
      setTab('finance');
      setShowDeepDive(true);
      setStatusText('Finance deep dive opened.');
      setCommandBar('');
      return;
    }

    setStatusText('Unknown command. Try: /post this, /best bank?, /simulate 0 down, /lower price 1k, /why decline?');
    setCommandBar('');
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    void requestJson<{ items?: Array<{ code: string; name: string }> }>('/api/bank-brain/lenders')
      .then((payload) => setBankProfiles(Array.isArray(payload.items) ? payload.items : []))
      .catch(() => setBankProfiles([]));
    void requestJson<{ items?: Array<{ bank_code?: string; outcome?: string; created_at?: string }> }>(
      '/api/bank-brain/history?limit=30',
    )
      .then((payload) => setBankHistory(Array.isArray(payload.items) ? payload.items : []))
      .catch(() => setBankHistory([]));
    void refreshRouteOneDocs();
  }, []);

  useEffect(() => {
    if (!vin(selectedVin)) return;
    if (assetsByVin[vin(selectedVin)]) return;
    void loadAssets(selectedVin);
  }, [assetsByVin, selectedVin]);

  useEffect(() => {
    if (!vin(selectedVin)) return;
    void loadVehicleIntel(selectedVin);
  }, [selectedVin]);

  useEffect(() => {
    setCaption(defaultCaption(selected));
  }, [selected]);

  useEffect(() => {
    const defaults = selectedPhotos
      .map((_, index) => index)
      .filter((index) => !THUMBNAIL_SKIP.includes(index));
    setSelectedPhotoIndexes(defaults.length ? defaults : selectedPhotos.length ? [0] : []);
    setPhotoOrder(selectedPhotos.map((_, index) => index));
  }, [selectedPhotos]);

  useEffect(() => {
    if (!selected) return;
    const parsed = num(selected.price);
    setStructureForm((previous) => ({
      ...previous,
      salePrice: parsed !== null ? String(parsed) : previous.salePrice,
    }));
    if (parsed !== null && !dealCost) {
      setDealCost(String(Math.max(0, Math.round(parsed * 0.86))));
    }
  }, [selected]);

  const selectedPosted = Boolean(selected?.posted || (selected ? postedVinSet.has(vin(selected.vin)) : false));
  const selectedInCredit = selected ? Boolean(inCreditByVin[vin(selected.vin)]) : false;
  const selectedSubmitted = selected ? Boolean(submittedByVin[vin(selected.vin)]) : false;
  const approvalProbability = bestBank
    ? `${bestBank.confidence.toFixed(1)}%`
    : vehicleBestBank
      ? `${vehicleBestBank.confidence.toFixed(1)}%`
      : 'n/a';
  const selectedTitleParts = useMemo(() => parseVehicleTitleParts(selected), [selected]);
  const selectedPhotosResolved = useMemo(() => resolveVehiclePhotos(selected, selectedAssets), [selected, selectedAssets]);

  function activateVehicle(targetVin: string, nextTab: 'overview' | 'marketing' | 'finance' = 'overview') {
    const clean = vin(targetVin);
    if (!clean) return;
    setSelectedVin(clean);
    setMode('vehicle');
    setTab(nextTab);
    void loadAssets(clean);
  }

  const inventoryStats = useMemo(() => {
    const total = inventory.length;
    const postedCount = inventory.filter((item) => Boolean(item.posted || postedVinSet.has(vin(item.vin)))).length;
    const readyToMarketCount = inventory.filter((item) => {
      const clean = vin(item.vin);
      const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
      return !postedVinSet.has(clean) && !item.posted && photos.length >= 2;
    }).length;
    const docsCachedCount = inventory.filter((item) => {
      const asset = assetsByVin[vin(item.vin)];
      return Boolean(asset?.sticker_url && asset?.carfax_url);
    }).length;
    const financeLiveCount = Object.values(inCreditByVin).filter(Boolean).length;
    const averagePrice =
      total > 0
        ? Math.round(
            inventory.reduce((sum, item) => sum + (num(item.price) ?? 0), 0) / total,
          )
        : 0;

    return {
      total,
      postedCount,
      readyToMarketCount,
      docsCachedCount,
      financeLiveCount,
      averagePrice,
    };
  }, [assetsByVin, inCreditByVin, inventory, postedVinSet]);

  const readyToPostVehicles = useMemo(
    () =>
      inventory
        .filter((item) => {
          const clean = vin(item.vin);
          const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
          return !postedVinSet.has(clean) && !item.posted && photos.length >= 2;
        })
        .sort((left, right) => (num(right.price) ?? 0) - (num(left.price) ?? 0))
        .slice(0, 6),
    [assetsByVin, inventory, postedVinSet],
  );

  const needsAssetsVehicles = useMemo(
    () =>
      inventory
        .filter((item) => {
          const clean = vin(item.vin);
          const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
          const asset = assetsByVin[clean];
          return photos.length < 2 || !asset?.sticker_url || !asset?.carfax_url;
        })
        .slice(0, 6),
    [assetsByVin, inventory],
  );

  const selectedIntelligence = useMemo(() => {
    const photosCount = selectedPhotosResolved.length;
    const hasSticker = Boolean(selectedAssets?.sticker_url);
    const hasCarfax = Boolean(selectedAssets?.carfax_url);
    const dataSignals = [
      Boolean(selected?.title),
      num(selected?.price) !== null,
      num(selected?.mileage) !== null,
      Boolean(selected?.drivetrain),
      Boolean(selected?.engine),
      Boolean(selected?.transmission),
      Boolean(selected?.exterior),
      Boolean(selected?.interior),
      Boolean(selected?.detail_url),
      photosCount > 0,
      hasSticker,
      hasCarfax,
    ];
    const dataScore = clampScore((dataSignals.filter(Boolean).length / dataSignals.length) * 100);

    const marketingSignals = [
      photosCount >= 2,
      Boolean(accountId),
      enhancedCaption.trim().length >= 45,
      Boolean(selected?.detail_url),
      !selectedPosted,
    ];
    const marketingScore = clampScore(
      (marketingSignals.filter(Boolean).length / marketingSignals.length) * 100,
    );

    const financeSignals = [
      Boolean(analysis?.metrics?.score),
      Boolean(structure?.structure?.estimated_payment),
      Boolean(bestBank),
      selectedInCredit,
      selectedSubmitted,
    ];
    const financeScore = clampScore(
      (financeSignals.filter(Boolean).length / financeSignals.length) * 100,
    );

    const xScore = clampScore(dataScore * 0.35 + marketingScore * 0.25 + financeScore * 0.4);
    const label =
      xScore >= 82 ? 'Launch Ready' : xScore >= 65 ? 'Operator Ready' : xScore >= 48 ? 'Needs Setup' : 'Incomplete';

    const nextSteps = [
      photosCount < 2 ? 'Pull more vehicle photos before posting.' : null,
      !hasSticker ? 'Refresh and cache the window sticker.' : null,
      !hasCarfax ? 'Refresh and cache Carfax.' : null,
      !selectedPosted ? 'Push the live Facebook listing.' : null,
      !analysis?.metrics?.score && !structure?.structure?.estimated_payment ? 'Run Bank Brain or simulate structure.' : null,
      bestBank && !selectedSubmitted ? `Submit ${bestBank.bank_name} first.` : null,
      riskFlags[0] ? `Watch risk: ${riskFlags[0]}` : null,
    ].filter(Boolean) as string[];

    return {
      photosCount,
      hasSticker,
      hasCarfax,
      dataScore,
      marketingScore,
      financeScore,
      xScore,
      label,
      nextSteps: nextSteps.slice(0, 5),
    };
  }, [
    accountId,
    analysis?.metrics?.score,
    bestBank,
    enhancedCaption,
    riskFlags,
    selected,
    selectedAssets?.carfax_url,
    selectedAssets?.sticker_url,
    selectedInCredit,
    selectedPhotosResolved,
    selectedPosted,
    selectedSubmitted,
    structure?.structure?.estimated_payment,
  ]);

  return (
    <main className="tv2-root">
      <header className="tv2-topbar">
        <div className="tv2-brand">
          <h1>Xconsole</h1>
          <p>Taverna CDJR mission control</p>
        </div>
        <label className="tv2-search">
          <span>Search Inventory</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="VIN, model, status, price"
          />
        </label>
        <div className="tv2-top-actions">
          <span className="tv2-chip">User {me?.username || 'admin'}</span>
          <span className="tv2-chip">Leads {leads.length}</span>
          <span className="tv2-chip">OfferUp {offerup?.drafts_count ?? 0}</span>
          <span className="tv2-chip">FB Accounts {accounts.length}</span>
          <span className="tv2-chip">Banks {bankProfiles.length}</span>
          <span className="tv2-chip">RouteOne Docs {routeoneDocs?.doc_count ?? 0}</span>
          <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => openQuickEdit()}>
            Quick-add
          </button>
          <button className="tv2-btn" type="button" onClick={() => void refresh()} disabled={refreshBusy}>
            {refreshBusy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="tv2-controlbar">
        <div className="tv2-source">
          <span>Source: {sourceStatus?.active_source || 'runtime'}</span>
          <span>Live cache: {sourceStatus?.live_cache_count ?? 0}</span>
          <span>Last sync: {nowText(sourceStatus?.last_synced_at)}</span>
        </div>
        <div className="tv2-control-actions">
          <input
            className="tv2-input"
            value={dealershipUrl}
            onChange={(event) => setDealershipUrl(event.target.value)}
            placeholder="Dealership inventory URL"
          />
          <select className="tv2-input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Default Facebook account</option>
            {accounts.map((item, index) => (
              <option key={`${item.id || item.email || 'acct'}-${index}`} value={item.id || ''}>
                {item.name || item.email || item.id}
              </option>
            ))}
          </select>
          <button className="tv2-btn" type="button" onClick={() => void syncInventory()} disabled={syncBusy}>
            {syncBusy ? 'Syncing...' : 'Sync'}
          </button>
          <button className="tv2-btn" type="button" onClick={() => void refresh()} disabled={refreshBusy}>
            Reload
          </button>
        </div>
      </section>

      <p className="tv2-statusline">{statusText}</p>

      <section className="tv2-mission-strip">
        <article className="tv2-kpi tv2-kpi-accent">
          <h3>Inventory</h3>
          <p>{inventoryStats.total}</p>
          <small>live Taverna units</small>
        </article>
        <article className="tv2-kpi">
          <h3>Posted Live</h3>
          <p>{inventoryStats.postedCount}</p>
          <small>Facebook completed</small>
        </article>
        <article className="tv2-kpi">
          <h3>Ready To Market</h3>
          <p>{inventoryStats.readyToMarketCount}</p>
          <small>2+ photos and not posted</small>
        </article>
        <article className="tv2-kpi">
          <h3>Docs Cached</h3>
          <p>{inventoryStats.docsCachedCount}</p>
          <small>sticker + Carfax ready</small>
        </article>
        <article className="tv2-kpi">
          <h3>Avg Ticket</h3>
          <p>{money(inventoryStats.averagePrice)}</p>
          <small>Taverna used average</small>
        </article>
        <article className="tv2-kpi">
          <h3>Finance Live</h3>
          <p>{inventoryStats.financeLiveCount}</p>
          <small>Bank Brain active</small>
        </article>
      </section>

      <section className="tv2-operator-grid">
        <article className="tv2-console-card tv2-access-card">
          <div className="tv2-card-head">
            <div>
              <h3>Access Control</h3>
              <p>Feature gates for posting, leads, OfferUp, and Bank Brain.</p>
            </div>
            <span className={`tv2-badge${can('users.manage') ? ' ok' : ' warn'}`}>
              {can('users.manage') ? 'Admin' : 'Limited'}
            </span>
          </div>
          {can('users.manage') ? (
            <>
              <div className="tv2-user-list">
                {users.slice(0, 4).map((user) => (
                  <div className="tv2-user-row" key={user.username}>
                    <div>
                      <strong>{user.display_name || user.username}</strong>
                      <span>{user.username} | {user.role || 'operator'} | {user.active === false ? 'disabled' : 'active'}</span>
                    </div>
                    <div className="tv2-permission-wrap">
                      {permissionOptions.map((permission) => (
                        <button
                          className={`tv2-permission-pill${user.permissions?.includes(permission.id) ? ' is-on' : ''}`}
                          key={`${user.username}-${permission.id}`}
                          type="button"
                          onClick={() => void toggleExistingUserPermission(user, permission.id)}
                          disabled={adminBusy || user.role === 'admin'}
                        >
                          {permission.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="tv2-mini-form">
                <input value={newUser.username} onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))} placeholder="username" />
                <input value={newUser.password} onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))} placeholder="password" type="password" />
                <input value={newUser.display_name} onChange={(event) => setNewUser((prev) => ({ ...prev, display_name: event.target.value }))} placeholder="display name" />
                <select value={newUser.role} onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value }))}>
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="tv2-permission-wrap">
                {permissionOptions.map((permission) => (
                  <button
                    className={`tv2-permission-pill${newUser.permissions.includes(permission.id) ? ' is-on' : ''}`}
                    key={`new-${permission.id}`}
                    type="button"
                    onClick={() => toggleNewUserPermission(permission.id)}
                  >
                    {permission.label}
                  </button>
                ))}
              </div>
              <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void saveUser()} disabled={adminBusy}>
                {adminBusy ? 'Saving...' : 'Add User'}
              </button>
            </>
          ) : (
            <p className="tv2-empty">Your current user can use assigned tools but cannot manage access.</p>
          )}
        </article>

        <article className="tv2-console-card">
          <div className="tv2-card-head">
            <div>
              <h3>Lead Inbox</h3>
              <p>Messenger-style responses stay next to inventory.</p>
            </div>
            <button className="tv2-btn" type="button" onClick={() => void syncFacebookLeads()} disabled={leadBusy || !can('facebook.leads')}>
              {leadBusy ? 'Working...' : 'Sync FB'}
            </button>
          </div>
          <div className="tv2-mini-form tv2-mini-form-leads">
            <input value={manualLead.customer_name} onChange={(event) => setManualLead((prev) => ({ ...prev, customer_name: event.target.value }))} placeholder="lead name" />
            <input value={manualLead.vehicle_vin || vin(selectedVin)} onChange={(event) => setManualLead((prev) => ({ ...prev, vehicle_vin: event.target.value }))} placeholder="VIN" />
            <input value={manualLead.message} onChange={(event) => setManualLead((prev) => ({ ...prev, message: event.target.value }))} placeholder="message from buyer" />
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void addManualLead()} disabled={leadBusy || !can('facebook.leads')}>
              Add
            </button>
          </div>
          <div className="tv2-lead-list">
            {leads.slice(0, 4).map((lead) => (
              <article className="tv2-lead-item" key={lead.id}>
                <div>
                  <strong>{lead.customer_name || 'Unknown Lead'}</strong>
                  <span>{lead.channel || 'facebook'} | {lead.vehicle_vin || 'no VIN'} | {lead.status || 'new'}</span>
                  <p>{lead.message || 'No message text captured.'}</p>
                </div>
                <textarea
                  value={leadDrafts[lead.id] || ''}
                  onChange={(event) => setLeadDrafts((prev) => ({ ...prev, [lead.id]: event.target.value }))}
                  placeholder="type response"
                />
                <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void respondToLead(lead)} disabled={leadBusy || !can('facebook.leads')}>
                  Respond
                </button>
              </article>
            ))}
            {!leads.length ? <p className="tv2-empty">No captured leads yet. Use Add or connect Facebook Page credentials.</p> : null}
          </div>
        </article>

        <article className="tv2-console-card">
          <div className="tv2-card-head">
            <div>
              <h3>Marketplace Command</h3>
              <p>One selected vehicle controls Facebook and OfferUp.</p>
            </div>
            <span className={`tv2-badge${stackStatus?.stack_readiness?.ready_for_live_facebook_posting ? ' ok' : ' warn'}`}>
              {stackStatus?.stack_readiness?.ready_for_live_facebook_posting ? 'FB Live Ready' : 'FB Needs Setup'}
            </span>
          </div>
          <div className="tv2-market-grid">
            <div>
              <span>Selected VIN</span>
              <strong>{vin(selectedVin) || 'none'}</strong>
            </div>
            <div>
              <span>Photos selected</span>
              <strong>{selectedPhotoIndexes.length}</strong>
            </div>
            <div>
              <span>OfferUp drafts</span>
              <strong>{offerup?.drafts_count ?? 0}</strong>
            </div>
            <div>
              <span>Facebook account</span>
              <strong>{accountId || 'default'}</strong>
            </div>
          </div>
          <div className="tv2-split-actions">
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void post('live')} disabled={postBusy || !selected || !can('facebook.post')}>
              Post Facebook
            </button>
            <button className="tv2-btn" type="button" onClick={() => void post('draft')} disabled={postBusy || !selected || !can('facebook.post')}>
              FB Draft
            </button>
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void offerupPost('draft')} disabled={offerupBusy || !selected || !can('offerup.post')}>
              OfferUp Draft
            </button>
            <button className="tv2-btn" type="button" onClick={() => void offerupPost('live')} disabled={offerupBusy || !selected || !can('offerup.post')}>
              OfferUp Live Check
            </button>
          </div>
          <p className="tv2-muted-note">{offerup?.reason || 'OfferUp creates operator-ready drafts until live session automation is connected.'}</p>
        </article>

        <article className="tv2-console-card">
          <div className="tv2-card-head">
            <div>
              <h3>VIN + Bank Brain</h3>
              <p>Collateral-aware lender suggestion before credit upload.</p>
            </div>
            <button className="tv2-btn" type="button" onClick={() => selectedVin && void loadVehicleIntel(selectedVin)} disabled={intelBusy || !selectedVin}>
              {intelBusy ? 'Reading...' : 'Reload VIN'}
            </button>
          </div>
          <div className="tv2-intel-grid">
            <div>
              <span>Decoded</span>
              <strong>
                {[vinDecode?.fields?.year, vinDecode?.fields?.make, vinDecode?.fields?.model].filter(Boolean).join(' ') || selected?.title || 'n/a'}
              </strong>
            </div>
            <div>
              <span>Body / Drive</span>
              <strong>{[vinDecode?.fields?.body_class, vinDecode?.fields?.drive_type].filter(Boolean).join(' / ') || 'n/a'}</strong>
            </div>
            <div>
              <span>Primary Bank</span>
              <strong>{vehicleBestBank?.bank_name || bestBank?.bank_name || 'needs structure'}</strong>
            </div>
            <div>
              <span>Probability</span>
              <strong>{approvalProbability}</strong>
            </div>
            <div>
              <span>LTV</span>
              <strong>{vehicleBrain?.default_structure?.ltv ?? structure?.structure?.ltv ?? 'n/a'}%</strong>
            </div>
            <div>
              <span>Backup</span>
              <strong>{vehicleBackupBank?.bank_name || backupBank?.bank_name || 'n/a'}</strong>
            </div>
          </div>
          <div className="tv2-pill-wrap">
            {(vehicleBrain?.recommendation?.collateral_flags?.length ? vehicleBrain.recommendation.collateral_flags : vehicleBrain?.packet_guidance || ['Upload credit report for bureau-specific recommendation.'])
              .slice(0, 3)
              .map((item, index) => <span className="tv2-pill" key={`intel-${index}`}>{item}</span>)}
          </div>
        </article>
      </section>

      <section className="tv2-layout">
        <aside className="tv2-inventory-pane">
          <div className="tv2-pane-head">
            <h2>Inventory Stream</h2>
            <span>{filtered.length}</span>
          </div>

          <div className="tv2-inventory-list">
            {filtered.map((vehicle, idx) => {
              const clean = vin(vehicle.vin);
              const rowPhoto = normalizePhotos(vehicle.photos)[0] || null;
              const rowPosted = Boolean(vehicle.posted || postedVinSet.has(clean));
              const active = clean === vin(selectedVin);

              return (
                <article
                  key={`${clean || vehicle.title || 'vehicle'}-${idx}`}
                  className={`tv2-vehicle-row${active ? ' is-active' : ''}`}
                  onClick={() => activateVehicle(clean)}
                >
                  <div className="tv2-row-photo">
                    {rowPhoto ? <img src={rowPhoto} alt={vehicle.title || clean} loading="lazy" /> : <span>No Photo</span>}
                  </div>
                  <div className="tv2-row-main">
                    <h3>{vehicle.title || clean}</h3>
                    <p>{money(vehicle.price)}</p>
                    <p>{miles(vehicle.mileage)}</p>
                    <p>{[vehicle.drivetrain, vehicle.engine].filter(Boolean).join(' | ') || vehicle.status_label || 'In Stock'}</p>
                    <p className="tv2-row-status">
                      Posted: <strong className={rowPosted ? 'is-yes' : 'is-no'}>{rowPosted ? 'YES' : 'NO'}</strong>
                    </p>
                  </div>
                  <div className="tv2-row-actions">
                    <button
                      className="tv2-btn tv2-btn-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void post('live', clean);
                      }}
                    >
                      Post
                    </button>
                    <button
                      className="tv2-btn tv2-btn-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        activateVehicle(clean, 'finance');
                      }}
                    >
                      Finance
                    </button>
                    <button
                      className="tv2-btn tv2-btn-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openQuickEdit(vehicle);
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </article>
              );
            })}
            {!filtered.length ? <p className="tv2-empty">No inventory found.</p> : null}
          </div>
        </aside>

        <section className="tv2-workspace-pane">
          <div className="tv2-workspace-head">
            <div>
              <h2>{selected?.title || 'Select a vehicle'}</h2>
              <p>
                {selected
                  ? `${money(selected.price)} | ${miles(selected.mileage)} | VIN ${vin(selected.vin)} | ${selectedTitleParts.make} ${selectedTitleParts.model}`
                  : 'Select a vehicle from the left stream.'}
              </p>
            </div>
            <div className="tv2-head-rail">
              <div className="tv2-head-actions">
                <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void post('live')} disabled={!selected || postBusy}>
                  {postBusy ? 'Posting...' : 'Post to Facebook'}
                </button>
                <button className="tv2-btn" type="button" onClick={() => selected && void loadAssets(vin(selected.vin), true)} disabled={!selected}>
                  Refresh Assets
                </button>
                <button className="tv2-btn" type="button" onClick={() => setShowSticker(true)} disabled={!selectedAssets?.sticker_url}>
                  Sticker
                </button>
                <button className="tv2-btn" type="button" onClick={() => setShowCarfax(true)} disabled={!selectedAssets?.carfax_url}>
                  Carfax
                </button>
              </div>
              <div className="tv2-mode-toggle">
                <button
                  className={`tv2-toggle-btn${mode === 'vehicle' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setMode('vehicle')}
                >
                  Vehicle Mode
                </button>
                <button
                  className={`tv2-toggle-btn${mode === 'pipeline' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setMode('pipeline')}
                >
                  Pipeline Mode
                </button>
              </div>
            </div>
          </div>

          <div className="tv2-command-bar">
            <span>/</span>
            <input
              value={commandBar}
              onChange={(event) => setCommandBar(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                void runCommand();
              }}
              placeholder="post this | best bank? | simulate 0 down"
            />
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void runCommand()}>
              Run
            </button>
          </div>

          {mode === 'pipeline' ? (
            <div className="tv2-pipeline">
              <div className="tv2-pipeline-cards">
                <article className="tv2-kpi"><h3>Posted</h3><p>{pipeline.posted}</p></article>
                <article className="tv2-kpi"><h3>Awaiting Credit</h3><p>{pipeline.awaitingCredit}</p></article>
                <article className="tv2-kpi"><h3>In Structuring</h3><p>{pipeline.inStructuring}</p></article>
                <article className="tv2-kpi"><h3>Submitted</h3><p>{pipeline.submitted}</p></article>
                <article className="tv2-kpi"><h3>Funded</h3><p>{pipeline.funded}</p></article>
              </div>
              <div className="tv2-pipeline-grid">
                <div className="tv2-card">
                  <h3>Ready To Post</h3>
                  <ul className="tv2-list-inline tv2-list-inline-actions">
                    {readyToPostVehicles.map((vehicle) => (
                      <li key={`ready-${vehicle.vin}`}>
                        <button className="tv2-link-action" type="button" onClick={() => activateVehicle(vin(vehicle.vin), 'marketing')}>
                          {vehicle.title || vin(vehicle.vin)}
                        </button>
                        <span>{money(vehicle.price)}</span>
                        <span>{miles(vehicle.mileage)}</span>
                      </li>
                    ))}
                    {!readyToPostVehicles.length ? <li className="tv2-empty-list">No launch-ready units yet.</li> : null}
                  </ul>
                </div>
                <div className="tv2-card">
                  <h3>Needs Assets</h3>
                  <ul className="tv2-list-inline tv2-list-inline-actions">
                    {needsAssetsVehicles.map((vehicle) => (
                      <li key={`assets-${vehicle.vin}`}>
                        <button className="tv2-link-action" type="button" onClick={() => activateVehicle(vin(vehicle.vin), 'overview')}>
                          {vehicle.title || vin(vehicle.vin)}
                        </button>
                        <span>{money(vehicle.price)}</span>
                        <span>{resolveVehiclePhotos(vehicle, assetsByVin[vin(vehicle.vin)]).length} photos</span>
                      </li>
                    ))}
                    {!needsAssetsVehicles.length ? <li className="tv2-empty-list">Asset stack looks complete.</li> : null}
                  </ul>
                </div>
                <div className="tv2-card">
                  <h3>Recent Decisions</h3>
                  <ul className="tv2-list-inline">
                    {bankHistory
                      .slice()
                      .reverse()
                      .slice(0, 8)
                      .map((item, index) => (
                        <li key={`${item.bank_code || 'BANK'}-${item.created_at || index}`}>
                          <span>{(item.bank_code || 'BANK').toUpperCase()}</span>
                          <span>{item.outcome || 'pending'}</span>
                          <span>{nowText(item.created_at)}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="tv2-tabs">
                <button className={`tv2-tab${tab === 'overview' ? ' is-active' : ''}`} type="button" onClick={() => setTab('overview')}>
                  Overview
                </button>
                <button className={`tv2-tab${tab === 'marketing' ? ' is-active' : ''}`} type="button" onClick={() => setTab('marketing')}>
                  Marketing
                </button>
                <button className={`tv2-tab${tab === 'finance' ? ' is-active' : ''}`} type="button" onClick={() => setTab('finance')}>
                  Finance
                </button>
              </div>

              {!selected ? <div className="tv2-empty tv2-empty-workspace">Select a vehicle to activate the workspace.</div> : null}

              {selected && tab === 'overview' ? (
                <div className="tv2-tab-panel">
                  <section className="tv2-overview-hero">
                    <article className="tv2-card tv2-card-photo-showcase">
                      <div className="tv2-card-head">
                        <h3>Inventory Visuals</h3>
                        <span className="tv2-chip tv2-chip-soft">{selectedIntelligence.photosCount} photos</span>
                      </div>
                      <div className="tv2-photo-grid">
                        {orderedPhotoIndexes
                          .filter((index) => !THUMBNAIL_SKIP.includes(index))
                          .map((index) => (
                            <figure key={`overview-photo-${index}`}>
                              <img src={selectedPhotos[index]} alt={`${selected.title} ${index + 1}`} loading="lazy" />
                              <figcaption>Image {index + 1}</figcaption>
                            </figure>
                          ))}
                      </div>
                    </article>

                    <article className="tv2-card tv2-intelligence-card">
                      <div className="tv2-card-head">
                        <h3>Vehicle Intelligence</h3>
                        <span className="tv2-chip tv2-chip-accent">X-Score {selectedIntelligence.xScore}</span>
                      </div>
                      <p className="tv2-intelligence-status">{selectedIntelligence.label}</p>
                      <div className="tv2-score-grid">
                        <div><span>Data</span><strong>{selectedIntelligence.dataScore}</strong></div>
                        <div><span>Marketing</span><strong>{selectedIntelligence.marketingScore}</strong></div>
                        <div><span>Finance</span><strong>{selectedIntelligence.financeScore}</strong></div>
                      </div>
                      <ul className="tv2-action-list">
                        {selectedIntelligence.nextSteps.map((step, index) => (
                          <li key={`step-${index}`}>{step}</li>
                        ))}
                        {!selectedIntelligence.nextSteps.length ? <li>Vehicle is fully staged for the next operator action.</li> : null}
                      </ul>
                    </article>

                    <article className="tv2-card tv2-bank-snapshot-card">
                      <div className="tv2-card-head">
                        <h3>Bank Brain Snapshot</h3>
                      <span className={`tv2-badge${bestBank || vehicleBestBank ? ' ok' : ' warn'}`}>{bestBank || vehicleBestBank ? 'Live' : 'Pending'}</span>
                      </div>
                      <p className="tv2-bank-snapshot-score">{approvalProbability}</p>
                      <p>Primary lender: {bestBank?.bank_name || vehicleBestBank?.bank_name || 'n/a'}</p>
                      <p>Backup lender: {backupBank?.bank_name || vehicleBackupBank?.bank_name || 'n/a'}</p>
                      <p>Risk flags: {riskFlags.length ? riskFlags.slice(0, 2).join(' | ') : 'none'}</p>
                    </article>
                  </section>

                  <section className="tv2-overview-mid">
                    <article className="tv2-kpi tv2-kpi-large"><h3>Price</h3><p>{money(selected.price)}</p></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Mileage</h3><p>{miles(selected.mileage)}</p></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Cost</h3><input className="tv2-input" value={dealCost} onChange={(event) => setDealCost(event.target.value)} /></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Front / Back Gross</h3><p>{money(frontGross)} / {money(backGross)}</p></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Powertrain</h3><p>{selected.drivetrain || 'n/a'} / {selected.transmission || 'n/a'}</p></article>
                  </section>

                  <section className="tv2-overview-grid">
                    <article className="tv2-card">
                      <h3>Vehicle Context</h3>
                      <div className="tv2-vehicle-brief-grid">
                        <div>
                          <span>Year</span>
                          <strong>{selectedTitleParts.year}</strong>
                        </div>
                        <div>
                          <span>Make</span>
                          <strong>{selectedTitleParts.make}</strong>
                        </div>
                        <div>
                          <span>Model</span>
                          <strong>{selectedTitleParts.model}</strong>
                        </div>
                        <div>
                          <span>Trim</span>
                          <strong>{selectedTitleParts.trim}</strong>
                        </div>
                        <div>
                          <span>Exterior</span>
                          <strong>{selected.exterior || 'n/a'}</strong>
                        </div>
                        <div>
                          <span>Interior</span>
                          <strong>{selected.interior || 'n/a'}</strong>
                        </div>
                        <div>
                          <span>Engine</span>
                          <strong>{selected.engine || 'n/a'}</strong>
                        </div>
                        <div>
                          <span>Location</span>
                          <strong>{selected.location || 'n/a'}</strong>
                        </div>
                      </div>
                    </article>

                    <article className="tv2-card">
                      <h3>Asset Stack</h3>
                      <div className="tv2-asset-list">
                        <div><span>Photos</span><strong>{selectedIntelligence.photosCount}</strong></div>
                        <div><span>Sticker</span><strong>{selectedIntelligence.hasSticker ? 'Ready' : 'Missing'}</strong></div>
                        <div><span>Carfax</span><strong>{selectedIntelligence.hasCarfax ? 'Ready' : 'Missing'}</strong></div>
                        <div><span>Listing URL</span><strong>{selected.detail_url ? 'Ready' : 'Missing'}</strong></div>
                      </div>
                    </article>

                    <label className="tv2-card tv2-notes-card">
                      <span>Deal Notes</span>
                      <textarea value={dealNotes} onChange={(event) => setDealNotes(event.target.value)} />
                    </label>
                  </section>

                  <section className="tv2-status-badges">
                    <span className={`tv2-badge${selectedPosted ? ' ok' : ' warn'}`}>Facebook Posted</span>
                    <span className={`tv2-badge${selectedPosted ? ' ok' : ' warn'}`}>Marketplace Listed</span>
                    <span className={`tv2-badge${selectedInCredit ? ' ok' : ' warn'}`}>In Credit App</span>
                    <span className={`tv2-badge${selectedSubmitted ? ' ok' : ' warn'}`}>Bank Submitted</span>
                    <span className={`tv2-badge${selectedIntelligence.hasSticker ? ' ok' : ' warn'}`}>Sticker Cached</span>
                    <span className={`tv2-badge${selectedIntelligence.hasCarfax ? ' ok' : ' warn'}`}>Carfax Cached</span>
                  </section>
                </div>
              ) : null}

              {selected && tab === 'marketing' ? (
                <div className="tv2-tab-panel tv2-marketing">
                  <article className="tv2-card">
                    <h3>Photo Selection</h3>
                    <p>Drag to reorder. First and third are skipped by default.</p>
                    <div className="tv2-marketing-photos">
                      {orderedPhotoIndexes.map((index) => {
                        const isSelected = selectedPhotoIndexes.includes(index);
                        return (
                          <article
                            key={`photo-${index}`}
                            className={`tv2-photo-tile${isSelected ? ' is-selected' : ''}`}
                            draggable
                            onDragStart={() => setDragPhotoIndex(index)}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => {
                              if (dragPhotoIndex === null) return;
                              movePhoto(dragPhotoIndex, index);
                              setDragPhotoIndex(null);
                            }}
                          >
                            <img src={selectedPhotos[index]} alt={`${selected.title} ${index + 1}`} loading="lazy" />
                            <div className="tv2-photo-meta">
                              <span>Image {index + 1}</span>
                              <button className="tv2-btn tv2-btn-xs" type="button" onClick={() => togglePhoto(index)}>
                                {isSelected ? 'Deselect' : 'Select'}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </article>

                  <article className="tv2-card">
                    <h3>Facebook Caption</h3>
                    <p>Posting account: {accounts.find((item) => item.id === accountId)?.name || accounts.find((item) => item.id === accountId)?.email || accountId || 'default account'}</p>
                    <textarea
                      className="tv2-caption-input"
                      value={caption}
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="Editable caption"
                    />
                    <div className="tv2-marketing-toggles">
                      <label>
                        <input
                          type="checkbox"
                          checked={marketingFlags.includePrice}
                          onChange={(event) =>
                            setMarketingFlags((previous) => ({ ...previous, includePrice: event.target.checked }))
                          }
                        />
                        Include Price
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={marketingFlags.includeDownPromo}
                          onChange={(event) =>
                            setMarketingFlags((previous) => ({ ...previous, includeDownPromo: event.target.checked }))
                          }
                        />
                        Down Payment Promo
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={marketingFlags.includeFinancing}
                          onChange={(event) =>
                            setMarketingFlags((previous) => ({ ...previous, includeFinancing: event.target.checked }))
                          }
                        />
                        Financing Language
                      </label>
                    </div>
                    <label className="tv2-inline-field">
                      <span>Promo Down</span>
                      <input value={promoDown} onChange={(event) => setPromoDown(event.target.value)} />
                    </label>
                    <div className="tv2-preview"><pre>{enhancedCaption || 'No caption generated.'}</pre></div>
                    <button className="tv2-btn tv2-btn-primary tv2-btn-post" type="button" onClick={() => void post('live')} disabled={postBusy}>
                      {postBusy ? 'Posting...' : 'Post To Facebook'}
                    </button>
                    {postResult ? (
                      <div className="tv2-result">
                        <p>Selected photos: {postResult.selected_photo_indexes?.length ?? 0}</p>
                        <p>Mode: {postResult.post_result?.mode || 'n/a'}</p>
                        <p>Live success: {postResult.post_result?.live_success ? 'yes' : 'no'}</p>
                        <p>Fallback used: {postResult.selection_fallback_used ? 'yes' : 'no'}</p>
                      </div>
                    ) : null}
                    <div className="tv2-subcard">
                      <h4>Recent Post Logs</h4>
                      <ul className="tv2-list-inline">
                        {posts.slice(0, 5).map((item, index) => (
                          <li key={`${item.vin || 'vin'}-${item.timestamp || index}`}>
                            <span>{item.vin || 'VIN n/a'}</span>
                            <span>{nowText(item.timestamp ? new Date(item.timestamp * 1000).toISOString() : '')}</span>
                          </li>
                        ))}
                        {!posts.length ? <li className="tv2-empty-list">No post activity yet.</li> : null}
                      </ul>
                    </div>
                  </article>
                </div>
              ) : null}

              {selected && tab === 'finance' ? (
                <div className="tv2-tab-panel">
                  <div className="tv2-finance-workbench">
                    <div className="tv2-finance-column">
                      <article className="tv2-card tv2-vehicle-brief">
                        <div className="tv2-card-head">
                          <h3>Vehicle Context</h3>
                          <span className={`tv2-badge${selectedPosted ? ' ok' : ' warn'}`}>{selectedPosted ? 'Posted' : 'Not Posted'}</span>
                        </div>
                        <div className="tv2-vehicle-brief-grid">
                          <div>
                            <span>Vehicle</span>
                            <strong>{selected.title || vin(selected.vin)}</strong>
                          </div>
                          <div>
                            <span>Price</span>
                            <strong>{money(selected.price)}</strong>
                          </div>
                          <div>
                            <span>Mileage</span>
                            <strong>{miles(selected.mileage)}</strong>
                          </div>
                          <div>
                            <span>Gross View</span>
                            <strong>{money(frontGross)} / {money(backGross)}</strong>
                          </div>
                        </div>
                      </article>

                      <article className="tv2-card">
                        <div className="tv2-card-head">
                          <h3>Deal Structure Inputs</h3>
                          <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void simulateStructure()} disabled={structureBusy}>
                            {structureBusy ? 'Simulating...' : 'Simulate'}
                          </button>
                        </div>
                        <div className="tv2-form-grid">
                          <label><span>Sale Price</span><input value={structureForm.salePrice} onChange={(event) => setStructureForm((prev) => ({ ...prev, salePrice: event.target.value }))} /></label>
                          <label><span>Down</span><input value={structureForm.down} onChange={(event) => setStructureForm((prev) => ({ ...prev, down: event.target.value }))} /></label>
                          <label><span>Trade</span><input value={structureForm.trade} onChange={(event) => setStructureForm((prev) => ({ ...prev, trade: event.target.value }))} /></label>
                          <label><span>Taxes</span><input value={structureForm.taxes} onChange={(event) => setStructureForm((prev) => ({ ...prev, taxes: event.target.value }))} /></label>
                          <label><span>Fees</span><input value={structureForm.fees} onChange={(event) => setStructureForm((prev) => ({ ...prev, fees: event.target.value }))} /></label>
                          <label><span>Backend</span><input value={structureForm.backend} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend: event.target.value }))} /></label>
                          <label><span>Term</span><input value={structureForm.term} onChange={(event) => setStructureForm((prev) => ({ ...prev, term: event.target.value }))} /></label>
                          <label><span>APR</span><input value={structureForm.apr} onChange={(event) => setStructureForm((prev) => ({ ...prev, apr: event.target.value }))} /></label>
                          <label><span>Monthly Income</span><input value={structureForm.monthlyIncome} onChange={(event) => setStructureForm((prev) => ({ ...prev, monthlyIncome: event.target.value }))} /></label>
                          <label><span>Current DTI</span><input value={structureForm.currentDti} onChange={(event) => setStructureForm((prev) => ({ ...prev, currentDti: event.target.value }))} /></label>
                        </div>
                        <div className="tv2-metric-strip">
                          <article><h4>Payment</h4><p>{money(structure?.structure?.estimated_payment ?? null)}</p></article>
                          <article><h4>LTV</h4><p>{structure?.structure?.ltv ?? 'n/a'}%</p></article>
                          <article><h4>PTI</h4><p>{structure?.structure?.pti ?? 'n/a'}%</p></article>
                          <article><h4>DTI</h4><p>{structure?.structure?.dti ?? 'n/a'}%</p></article>
                        </div>
                      </article>

                      <article className="tv2-card">
                        <h3>Credit Upload Panel</h3>
                        <textarea value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} placeholder="Paste credit report details" />
                        <div className="tv2-inline-actions">
                          <input type="file" accept=".txt,.json,.pdf,.csv" onChange={(event) => setAnalysisFile(event.target.files?.[0] || null)} />
                          <button className="tv2-btn" type="button" onClick={() => void analyzeTextInput()} disabled={analyzeBusy}>{analyzeBusy ? 'Analyzing...' : 'Analyze Text'}</button>
                          <button className="tv2-btn" type="button" onClick={() => void analyzeUpload()} disabled={uploadBusy}>{uploadBusy ? 'Uploading...' : 'Analyze Upload'}</button>
                        </div>
                        <div className="tv2-form-grid">
                          <label><span>Score</span><input value={structureForm.score} onChange={(event) => setStructureForm((prev) => ({ ...prev, score: event.target.value }))} /></label>
                          <label><span>Tradelines</span><input value={structureForm.tradelines} onChange={(event) => setStructureForm((prev) => ({ ...prev, tradelines: event.target.value }))} /></label>
                          <label><span>Derogatories</span><input value={structureForm.derogatories} onChange={(event) => setStructureForm((prev) => ({ ...prev, derogatories: event.target.value }))} /></label>
                          <label><span>Utilization %</span><input value={structureForm.utilization} onChange={(event) => setStructureForm((prev) => ({ ...prev, utilization: event.target.value }))} /></label>
                        </div>
                        <div className="tv2-metric-strip tv2-metric-strip-compact">
                          <article><h4>Score</h4><p>{analysis?.metrics?.score ?? 'n/a'}</p></article>
                          <article><h4>Tradelines</h4><p>{analysis?.metrics?.tradelines ?? 'n/a'}</p></article>
                          <article><h4>Derogs</h4><p>{analysis?.metrics?.derogatories ?? 'n/a'}</p></article>
                          <article><h4>Util.</h4><p>{analysis?.metrics?.utilization ?? 'n/a'}%</p></article>
                        </div>
                      </article>
                    </div>

                    <div className="tv2-finance-column tv2-finance-sidecar">
                      <article className="tv2-card tv2-approval-card">
                        <div className="tv2-card-head">
                          <h3>Approval Probability</h3>
                          <span className={`tv2-badge${bestBank || vehicleBestBank ? ' ok' : ' warn'}`}>{bestBank || vehicleBestBank ? 'Live' : 'Pending'}</span>
                        </div>
                        <p className="tv2-approval-score">{approvalProbability}</p>
                        <p>Primary lender: {bestBank?.bank_name || vehicleBestBank?.bank_name || 'n/a'}</p>
                        <p>Backup lender: {backupBank?.bank_name || vehicleBackupBank?.bank_name || 'n/a'}</p>
                      </article>

                      <article className="tv2-card">
                        <div className="tv2-card-head">
                          <h3>RouteOne Forms</h3>
                          <span className={`tv2-badge${routeoneDocs?.ok ? ' ok' : ' warn'}`}>
                            {routeoneDocs?.ok ? 'Trained' : 'Needs Docs'}
                          </span>
                        </div>
                        <div className="tv2-metric-strip tv2-metric-strip-compact">
                          <article><h4>Docs</h4><p>{routeoneDocs?.doc_count ?? 0}</p></article>
                          <article><h4>Decoded</h4><p>{routeoneDocs?.decoded_doc_count ?? 0}</p></article>
                          <article><h4>Profiles</h4><p>{routeoneDocs?.generated_profiles_count ?? bankProfiles.length}</p></article>
                          <article><h4>Live</h4><p>{routeoneDocs?.sales_assistant_policies_count ?? bankProfiles.length}</p></article>
                        </div>
                        <label className="tv2-inline-field">
                          <span>Bank / Folder</span>
                          <input value={routeoneBank} onChange={(event) => setRouteoneBank(event.target.value)} placeholder="Ally, Chase, Capital One..." />
                        </label>
                        <div className="tv2-inline-actions">
                          <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.html,.htm,.txt" onChange={(event) => setRouteoneFiles(event.target.files)} />
                          <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void uploadRouteOneDocs()} disabled={routeoneBusy}>
                            {routeoneBusy ? 'Training...' : 'Upload + Train'}
                          </button>
                          <button className="tv2-btn" type="button" onClick={() => void rebuildRouteOneDocs()} disabled={routeoneBusy}>
                            Rebuild
                          </button>
                        </div>
                        <small>Use this after downloading RouteOne rate sheets/forms. Hyperlinked PDFs are decoded during rebuild.</small>
                      </article>

                      <article className="tv2-card">
                        <div className="tv2-card-head">
                          <h3>Credit Structuring Assistant</h3>
                          <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void simulateStructure()} disabled={structureBusy}>
                            {structureBusy ? 'Recalculating...' : 'Recalculate'}
                          </button>
                        </div>
                        <div className="tv2-form-grid">
                          <label><span>Down</span><input value={structureForm.down} onChange={(event) => setStructureForm((prev) => ({ ...prev, down: event.target.value }))} /></label>
                          <label><span>Trade</span><input value={structureForm.trade} onChange={(event) => setStructureForm((prev) => ({ ...prev, trade: event.target.value }))} /></label>
                          <label><span>Backend</span><input value={structureForm.backend} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend: event.target.value }))} /></label>
                          <label><span>Term</span><input value={structureForm.term} onChange={(event) => setStructureForm((prev) => ({ ...prev, term: event.target.value }))} /></label>
                        </div>
                        <div className="tv2-metric-strip tv2-structuring-strip">
                          <article><h4>Best Bank</h4><p>{bestBank?.bank_name || vehicleBestBank?.bank_name || 'n/a'}</p></article>
                          <article><h4>Backup</h4><p>{backupBank?.bank_name || vehicleBackupBank?.bank_name || 'n/a'}</p></article>
                          <article><h4>Financed</h4><p>{money(structure?.structure?.financed_amount ?? null)}</p></article>
                          <article><h4>Payment</h4><p>{money(structure?.structure?.estimated_payment ?? null)}</p></article>
                        </div>
                      </article>

                      <article className="tv2-card">
                        <div className="tv2-card-head">
                          <h3>Bank Match Engine</h3>
                          <button className="tv2-btn" type="button" onClick={() => setShowDeepDive((value) => !value)}>
                            {showDeepDive ? 'Hide Deep Dive' : 'Show Deep Dive'}
                          </button>
                        </div>
                        <div className="tv2-bank-reco-grid">
                          <article><h4>Primary Lender</h4><p>{bestBank?.bank_name || vehicleBestBank?.bank_name || 'n/a'}</p><small>{bestBank ? `${bestBank.confidence.toFixed(1)}%` : vehicleBestBank ? `${vehicleBestBank.confidence.toFixed(1)}%` : ''}</small></article>
                          <article><h4>Backup Lender</h4><p>{backupBank?.bank_name || vehicleBackupBank?.bank_name || 'n/a'}</p><small>{backupBank ? `${backupBank.confidence.toFixed(1)}%` : vehicleBackupBank ? `${vehicleBackupBank.confidence.toFixed(1)}%` : ''}</small></article>
                        </div>
                        <div className="tv2-advice-grid">
                          <article><h4>Risk Flags</h4><ul>{(riskFlags.length ? riskFlags : ['none']).map((item, i) => <li key={`risk-${i}`}>{item}</li>)}</ul></article>
                          <article><h4>Suggestions</h4><ul>{(suggestions.length ? suggestions : ['none']).map((item, i) => <li key={`suggest-${i}`}>{item}</li>)}</ul></article>
                        </div>
                        <label className="tv2-inline-field"><span>Decision Notes</span><input value={decisionNotes} onChange={(event) => setDecisionNotes(event.target.value)} /></label>
                        <div className="tv2-inline-actions">
                          <button className="tv2-btn" type="button" onClick={() => void logDecision('approved')} disabled={decisionBusy}>Approve</button>
                          <button className="tv2-btn" type="button" onClick={() => void logDecision('countered')} disabled={decisionBusy}>Counter</button>
                          <button className="tv2-btn" type="button" onClick={() => void logDecision('declined')} disabled={decisionBusy}>Decline</button>
                        </div>
                        {showDeepDive ? (
                          <div className="tv2-deep-dive">
                            <table>
                              <thead><tr><th>Bank</th><th>Confidence</th><th>Reasons</th></tr></thead>
                              <tbody>
                                {rankedBanks.map((bank) => (
                                  <tr key={bank.bank_code}>
                                    <td>{bank.bank_name}</td>
                                    <td>{bank.confidence.toFixed(1)}%</td>
                                    <td>{bank.reasons.length ? bank.reasons.join(' | ') : 'No major negatives'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="tv2-pill-wrap">
                              {bankProfiles.map((profile) => <span key={profile.code} className="tv2-pill">{profile.name} ({profile.code})</span>)}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </section>

      {showSticker ? (
        <section className="tv2-modal-overlay" onClick={() => setShowSticker(false)}>
          <article className="tv2-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Window Sticker</h3>
              <button className="tv2-btn" type="button" onClick={() => setShowSticker(false)}>Close</button>
            </header>
            {selectedAssets?.sticker_url ? <iframe title="sticker" src={selectedAssets.sticker_url} /> : <p className="tv2-empty">Sticker not available.</p>}
          </article>
        </section>
      ) : null}

      {showCarfax ? (
        <section className="tv2-modal-overlay" onClick={() => setShowCarfax(false)}>
          <article className="tv2-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>Carfax</h3>
              <button className="tv2-btn" type="button" onClick={() => setShowCarfax(false)}>Close</button>
            </header>
            {selectedAssets?.carfax_url ? <iframe title="carfax" src={selectedAssets.carfax_url} /> : <p className="tv2-empty">Carfax not available.</p>}
          </article>
        </section>
      ) : null}

      {quickEditOpen ? (
        <section className="tv2-modal-overlay" onClick={() => setQuickEditOpen(false)}>
          <article className="tv2-modal tv2-modal-edit" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{quickEdit.vin ? 'Edit Vehicle' : 'Quick-add Vehicle'}</h3>
              <button className="tv2-btn" type="button" onClick={() => setQuickEditOpen(false)}>Close</button>
            </header>
            <div className="tv2-form-grid">
              <label><span>VIN</span><input value={quickEdit.vin} onChange={(event) => setQuickEdit((prev) => ({ ...prev, vin: event.target.value }))} /></label>
              <label><span>Title</span><input value={quickEdit.title} onChange={(event) => setQuickEdit((prev) => ({ ...prev, title: event.target.value }))} /></label>
              <label><span>Price</span><input value={quickEdit.price} onChange={(event) => setQuickEdit((prev) => ({ ...prev, price: event.target.value }))} /></label>
              <label><span>Mileage</span><input value={quickEdit.mileage} onChange={(event) => setQuickEdit((prev) => ({ ...prev, mileage: event.target.value }))} /></label>
            </div>
            <div className="tv2-inline-actions">
              <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void saveQuickEdit()}>Save Vehicle</button>
              <button className="tv2-btn" type="button" onClick={() => setQuickEditOpen(false)}>Cancel</button>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
