import { useEffect, useMemo, useRef, useState } from 'react';
import { useSalesContext } from './context';
import './TavernaCommandCenter.css';

declare global {
  interface Window {
    __XCONSOLE_BASIC_AUTH__?: string;
  }
}

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
  body_style?: string | null;
  fuel_type?: string | null;
  stock_number?: string | number | null;
  msrp?: string | number | null;
  photos?: unknown[];
  posted?: boolean;
  posted_at?: string | null;
  posted_status?: string | null;
  marketplace_status?: string | null;
  listing_url?: string | null;
  post_detail?: string | null;
  last_post_attempt_at?: string | null;
  status_label?: string;
  inventory_category?: string;
  has_jd_power_trade_in?: boolean;
  jd_power_trade_in?: number | null;
  jd_power_ltv?: number | null;
  bank_sale_price?: number | null;
  default_bank_fees?: number | null;
};

type VehiclesPayload = {
  items?: Vehicle[];
  count?: number;
  active_count?: number;
  in_transit_count?: number;
  source_status?: {
    active_source?: string;
    live_cache_count?: number;
    live_cache_active_count?: number;
    live_cache_in_transit_count?: number;
    snapshot_count?: number;
    last_synced_at?: string;
    configured_url?: string;
  };
};

type InventoryFilter = 'all' | 'ready' | 'needs-assets' | 'unposted' | 'posted' | 'used' | 'new';
type InventorySort = 'ltv-low' | 'title' | 'price-low' | 'price-high';

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
  photos_count?: number;
  main_photo?: string | null;
  sticker_url?: string | null;
  carfax_url?: string | null;
  sticker_view_url?: string | null;
  carfax_view_url?: string | null;
  sticker_highlights?: string[];
  marketing_summary?: string[];
  buyer_profile?: {
    kind?: string;
    buyer?: string;
    features?: string[];
  } | null;
  carfax_summary?: {
    summary?: string;
    highlights?: string[];
    facts?: {
      owner_count?: string | null;
      accident_damage?: string | null;
      title_brand?: string | null;
      service_history?: string | null;
      usage?: string | null;
      value_badge?: string | null;
      market_position?: string | null;
      market_delta?: string | null;
      carfax_value?: string | null;
      service_records_count?: number | null;
      last_service_date?: string | null;
      accident_counts?: Record<string, number>;
      report_access?: string | null;
    };
    source?: string;
    updated_at?: string;
  } | null;
};

type Dealership = {
  id?: string;
  name: string;
  preowned_url?: string | null;
  used_url?: string | null;
  new_url?: string | null;
  active?: boolean;
};

type DealershipsPayload = {
  items?: Dealership[];
  count?: number;
  active_source_urls?: string[];
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
    current_dti?: number | null;
    monthly_income?: number | null;
    years_at_address?: number | null;
    years_at_job?: number | null;
  };
  route_one_fill?: {
    title?: string;
    first_name?: string;
    middle_name?: string;
    last_name?: string;
    suffix?: string;
    dob_month?: string;
    dob_day?: string;
    dob_year?: string;
    ssn?: string;
    home_phone?: string;
    cellular_phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    time_at_address_years?: string;
    time_at_address_months?: string;
    time_at_job_years?: string;
    time_at_job_months?: string;
    employment_type?: string;
    employment_status?: string;
    employment_title?: string;
    employer?: string;
    other_income_source?: string;
    other_income_amount?: string;
    income_interval?: string;
    residence_type?: string;
    rent_mortgage?: string;
  };
  recommendation?: BankRecommendation;
  file_understanding?: {
    format?: string;
    extracted_text_chars?: number;
    ocr_pages?: number;
    warnings?: string[];
  };
  extracted_text_chars?: number;
  extracted_preview?: string;
};

type StructurePayload = {
  structure?: {
    vin?: string | null;
    vehicle_price?: number;
    financed_amount?: number;
    estimated_payment?: number;
    book_value?: number | null;
    jd_power_trade_in?: number | null;
    book_value_source?: string;
    fees?: number;
    backend_products?: number;
    ltv?: number | null;
    ltv_formula?: string;
    pti?: number | null;
    dti?: number | null;
  };
  recommendation?: BankRecommendation;
};

type VehicleRecommendation = {
  vin: string;
  title?: string;
  sale_price?: number;
  taxes?: number | null;
  ltv_basis?: number | null;
  jd_power_trade_in?: number | null;
  ltv?: number | null;
  ltv_formula?: string;
  estimated_payment?: number | null;
  best_bank?: BankRank;
  confidence?: number;
  reason?: string;
};

type RouteOneDocsStatus = {
  ok?: boolean;
  doc_count?: number;
  decoded_doc_count?: number;
  generated_profiles_count?: number;
  sales_assistant_policies_count?: number;
  last_decoded_at?: string | null;
};

type ValuationStatus = {
  ok?: boolean;
  count?: number;
  source_file?: string | null;
  updated_at?: string | null;
  diagnostics?: Record<string, unknown>;
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
  conversation_id?: string;
  profile_id?: string;
  responses?: Array<{
    response_text?: string;
    created_at?: string;
    delivery_status?: string;
    author?: string;
  }>;
  thread?: Array<{
    direction?: string;
    text?: string;
    created_at?: string;
    delivery_status?: string;
    author?: string;
    attachments?: Array<{
      type?: string;
      url?: string | null;
      title?: string | null;
    }>;
  }>;
};

type OfferUpStatus = {
  ready_for_live?: boolean;
  mode?: string;
  reason?: string;
  drafts_count?: number;
  posts?: Record<string, unknown>;
};

type StackStatus = {
  deployment?: {
    release?: string | null;
    project_name?: string | null;
    service_name?: string | null;
    deployment_id?: string | null;
    public_domain?: string | null;
    environment?: string | null;
  };
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
    live_detail?: string;
    marketplace_status?: string;
    listing_url?: string | null;
    text?: string;
  };
  selected_photo_indexes?: number[];
  selection_fallback_used?: boolean;
};

type FacebookLiveStatus = {
  ok?: boolean;
  vin?: string;
  title?: string;
  stage?: string;
  type?: string;
  batch_current?: number;
  batch_total?: number;
  posted?: number;
  failed?: number;
  updated_at?: string | null;
};

type VehicleTitleParts = {
  year: string;
  make: string;
  model: string;
  trim: string;
};

type RequestFailure = {
  target: string;
  status?: number;
  statusText?: string;
  message: string;
  bodyPreview?: string;
};

type RequestSafeResult<T> = { ok: true; value: T } | { ok: false; failure: RequestFailure };

const THUMBNAIL_SKIP = [0, 2];
const FACEBOOK_PRICE_BUMP = 2400;
const DEFAULT_BANK_FEES = 2400;
const MARKETPLACE_LOCATION = 'Plantation, Florida 33317';
const DEFAULT_PERMISSION_OPTIONS: PermissionOption[] = [
  { id: 'inventory.view', label: 'Inventory' },
  { id: 'inventory.edit', label: 'Edit Cars' },
  { id: 'facebook.post', label: 'Facebook Post' },
  { id: 'facebook.leads', label: 'Messenger Leads' },
  { id: 'offerup.post', label: 'OfferUp' },
  { id: 'bankbrain.view', label: 'Bank Brain' },
  { id: 'bankbrain.train', label: 'Train Banks' },
  { id: 'dealerships.manage', label: 'Dealerships' },
  { id: 'assets.view', label: 'Vehicle Assets' },
  { id: 'stickers.view', label: 'Stickers' },
  { id: 'carfax.view', label: 'Carfax' },
  { id: 'users.manage', label: 'Users' },
  { id: 'admin.full', label: 'Admin' },
];

const UI_BUILD_LABEL = 'UI 2026-04-30 ROUTEONE FINANCE';

function vin(value: string | undefined | null): string {
  return String(value || '').trim().toUpperCase();
}

function readableFacebookStatus(value: unknown): string {
  let text = typeof value === 'string' ? value : structuredError(value);
  text = text.replace(/\u001b\[[0-9;]*m/g, '').replace(/\\u001b\[[0-9;]*m/g, '');
  const jsonStart = text.lastIndexOf('{"ok"');
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart));
      text = structuredError(parsed);
    } catch {
      // Keep the readable portion below.
    }
  }
  const lower = text.toLowerCase();
  if (lower.includes('location') && (lower.includes('dropdown') || lower.includes('option') || lower.includes('could not be selected'))) {
    return 'Marketplace stopped on location. Use Plantation, FL 33317/ZIP selector and retry.';
  }
  if (lower.includes('login_required') || lower.includes('login required')) {
    return 'Facebook session needs a visible login/approval before posting.';
  }
  if (lower.includes('publish was not confirmed')) {
    return 'Facebook clicked Publish, but Marketplace did not confirm. Check visible browser for a required field or review prompt.';
  }
  if (lower.includes('required facebook vehicle')) {
    return 'Facebook stopped on a required Marketplace vehicle field. The automation did not mark it posted.';
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 260 ? `${text.slice(0, 260)}...` : text;
}

function isIdleFacebookStage(value: unknown): boolean {
  return String(value || '').trim() === 'No live Facebook publish running.';
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

function marketplaceDownPayment(vehicle: Vehicle | undefined): number {
  const ltv = num(vehicle?.jd_power_ltv);
  if (ltv === null) return 999;
  if (ltv <= 90) return 750;
  if (ltv <= 98) return 999;
  if (ltv <= 108) return 1499;
  if (ltv <= 118) return 1999;
  return 2999;
}

function downPaymentMoney(vehicle: Vehicle | undefined): string {
  return `$${marketplaceDownPayment(vehicle).toLocaleString()}`;
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

function leadThreadIsVisibleStatus(value: string | undefined | null): boolean {
  const status = String(value || '').trim().toLowerCase();
  if (!status) return true;
  return status === 'sent' || status === 'delivered' || status === 'received';
}

function isInternalLeadNoise(text: string | undefined | null, author?: string | null): boolean {
  const haystack = `${String(author || '')} ${String(text || '')}`.trim().toLowerCase();
  if (!haystack) return false;
  if (/\b(?:xconsole|policy-window patch)\b/.test(haystack)) return true;
  if (/\b(?:test reply|second live test|live reply test|can you confirm you got this)\b/.test(haystack)) return true;
  return false;
}

function normalizeLeadThread(
  thread: LeadItem['thread'] | undefined,
): Array<NonNullable<LeadItem['thread']>[number]> {
  if (!Array.isArray(thread)) return [];
  return thread.filter((item) => {
    const text = String(item?.text || '').trim();
    const attachments = Array.isArray(item?.attachments) ? item?.attachments.filter(Boolean) : [];
    if (!text && !attachments.length) return false;
    if (item?.direction === 'outbound' && !leadThreadIsVisibleStatus(item?.delivery_status)) return false;
    if (isInternalLeadNoise(text, String(item?.author || ''))) return false;
    return true;
  });
}

function isVisibleLead(lead: LeadItem | undefined): boolean {
  if (!lead) return false;
  const customerName = String(lead.customer_name || '').trim().toLowerCase();
  if (customerName === 'admin' || customerName === 'xconsole') return false;
  const preview = String(lead.message || '').trim();
  if (isInternalLeadNoise(preview, lead.customer_name)) return false;
  const thread = normalizeLeadThread(lead.thread);
  return thread.length > 0 || Boolean(preview);
}

function leadPreviewText(lead: LeadItem | undefined): string {
  if (!lead) return 'No conversation';
  const thread = normalizeLeadThread(lead.thread);
  const latest = thread[thread.length - 1];
  const latestText = String(latest?.text || '').trim();
  if (latestText) return latestText;
  const firstAttachment = Array.isArray(latest?.attachments) ? latest?.attachments[0] : null;
  if (firstAttachment?.title) return firstAttachment.title;
  if (firstAttachment?.type) return `${firstAttachment.type} attachment`;
  return String(lead.message || 'No message yet.').trim() || 'No message yet.';
}

function renderLinkedMessage(text: string): Array<string | JSX.Element> {
  const source = String(text || '');
  if (!source) return [''];
  const urlPattern = /(https?:\/\/[^\s]+)/gi;
  const parts = source.split(urlPattern);
  return parts.map((part, index) => {
    if (/^https?:\/\//i.test(part)) {
      return <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>;
    }
    return part;
  });
}

function textList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || '').trim()).filter(Boolean);
}

function buyerProfileText(vehicle: Vehicle | undefined, assets?: VehicleAssets): string {
  const title = String(vehicle?.title || '').toLowerCase();
  const body = String((vehicle as Record<string, unknown> | undefined)?.body_style || '').toLowerCase();
  const text = `${title} ${body}`;
  if (text.includes('aviator') || text.includes('black label') || text.includes('navigator')) {
    return 'Luxury SUV shoppers who want a premium cabin, AWD confidence, family space, and a high-end look without stepping into new-car money.';
  }
  if (text.includes('pacifica') || text.includes('minivan') || text.includes('voyager')) {
    return 'Families, rideshare drivers, and road-trip buyers who care about easy passenger space, comfort, and practical cargo room.';
  }
  if (text.includes('wrangler') || text.includes('gladiator')) {
    return 'Jeep shoppers who want weekend capability, open-air personality, and a vehicle that still works for daily driving.';
  }
  if (text.includes('ram 2500') || text.includes('ram 3500') || text.includes('chassis') || text.includes('promaster')) {
    return 'Business owners, contractors, and buyers who need work-ready capability more than luxury extras.';
  }
  if (text.includes('ram 1500') || text.includes('pickup') || text.includes('truck') || text.includes('f-150')) {
    return 'Truck buyers who need hauling and road presence but still want everyday comfort.';
  }
  if (text.includes('tahoe') || text.includes('expedition') || text.includes('suburban') || text.includes('durango') || text.includes('wagoneer')) {
    return 'Large-SUV buyers who need real family room, road-trip comfort, and confident daily usability.';
  }
  return assets?.buyer_profile?.buyer || 'Buyers who want a clean, inspected vehicle with straightforward numbers and financing options.';
}

function defaultCaption(vehicle: Vehicle | undefined, assets?: VehicleAssets): string {
  if (!vehicle) return '';
  const buyer = buyerProfileText(vehicle, assets);
  const stickerHighlights = textList(assets?.sticker_highlights);
  const carfaxSummary = assets?.carfax_summary?.summary;
  const lines = [
    vehicle.title || vehicle.vin,
    `${downPaymentMoney(vehicle)} down options available for qualified buyers.`,
    `Mileage: ${miles(vehicle.mileage)}`,
    '',
    buyer,
  ];
  lines.push(
    '',
    'Clean, inspected, serviced as needed, and ready for a straightforward test drive.',
    'Financing options available for qualified buyers.',
  );
  if (stickerHighlights.length) {
    lines.push('', 'Best highlights:', ...stickerHighlights.slice(0, 4).map((item) => `- ${item}`));
  }
  if (carfaxSummary && assets?.carfax_url) {
    lines.push('', 'CARFAX:', `- ${carfaxSummary}`);
  }
  lines.push('', 'Message me "APP" and I will send the quick finance application.');
  return lines.join('\n');
}

function resolveVehiclePhotos(vehicle: Vehicle | undefined, assets?: VehicleAssets): string[] {
  const fromAssets = normalizePhotos(assets?.photos);
  return fromAssets.length ? fromAssets : normalizePhotos(vehicle?.photos);
}

function vehicleCondition(vehicle: Vehicle | undefined): 'new' | 'used' | 'unknown' {
  const raw = [
    vehicle?.inventory_category,
    vehicle?.status_label,
    vehicle?.detail_url,
    vehicle?.title,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (/\/new(?:\/|-inventory)/.test(raw) || /\bnew\b/.test(raw)) return 'new';
  if (/\/(?:used|certified)(?:\/|-inventory)/.test(raw) || /\bused\b|\bpre-owned\b|\bcpo\b|\bcertified\b/.test(raw)) return 'used';
  return 'unknown';
}

function isActiveInventoryVehicle(vehicle: Vehicle | undefined): boolean {
  const raw = String(vehicle?.status_label || '').toLowerCase();
  return !raw.includes('transit') && !raw.includes('factory');
}

function vehicleMake(vehicle: Vehicle | undefined): string {
  const title = String(vehicle?.title || '').trim();
  const tokens = title.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && /^(19|20)\d{2}$/.test(tokens[0])) {
    return tokens[1];
  }
  return tokens[0] || 'Other';
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
    if (Object.keys(record).length === 0) return 'Request failed (empty response payload).';
    if (record.detail) return structuredError(record.detail);
    if (record.live_detail) return structuredError(record.live_detail);
    if (record.message) return structuredError(record.message);
    if (record.error) return structuredError(record.error);
    try {
      return JSON.stringify(payload);
    } catch {
      return 'Request failed';
    }
  }
  return 'Request failed';
}

function formatRequestError(error: unknown, defaultTarget = ''): string {
  if (error instanceof Error) {
    return error.message || 'Request failed';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (!Object.keys(record).length) {
      return defaultTarget ? `Request failed for ${defaultTarget}` : 'Request failed';
    }
    if (record.message) return formatRequestError(record.message, defaultTarget);
    if (record.detail) return formatRequestError(record.detail, defaultTarget);
    if (record.live_detail) return formatRequestError(record.live_detail, defaultTarget);
    if (record.error) return formatRequestError(record.error, defaultTarget);
    if (record.body) return formatRequestError(record.body, defaultTarget);
    try {
      return JSON.stringify(record);
    } catch {
      return 'Request failed';
    }
  }
  if (defaultTarget) return `Request failed for ${defaultTarget}`;
  return 'Request failed';
}

function titleCaseStatus(value: string | undefined | null): string {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return 'Not Posted';
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isVehicleMarketplaceLive(vehicle: Vehicle | undefined): boolean {
  if (!vehicle) return false;
  const status = String(vehicle.marketplace_status || '').toLowerCase();
  const listingUrl = String(vehicle.listing_url || '').trim();
  return status === 'live' && Boolean(listingUrl);
}

function vehicleMarketplaceLabel(vehicle: Vehicle | undefined): string {
  if (!vehicle) return 'Not Posted';
  const status = String(vehicle.marketplace_status || '').toLowerCase();
  if (status === 'live' && !String(vehicle.listing_url || '').trim()) return 'Needs Review';
  if (vehicle.posted_status) return String(vehicle.posted_status);
  if (vehicle.marketplace_status) return titleCaseStatus(vehicle.marketplace_status);
  return vehicle.posted ? 'Live' : 'Not Posted';
}

function apiUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return new URL(url, `${window.location.protocol}//${window.location.host}`).toString();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const target = apiUrl(url);
  const headers = new Headers(init?.headers || {});
  const authHeader = String(window.__XCONSOLE_BASIC_AUTH__ || '').trim();
  if (authHeader && !headers.has('Authorization')) {
    headers.set('Authorization', authHeader);
  }
  const response = await fetch(target, { credentials: 'same-origin', ...init, headers });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const rawText = (await response.text().catch(() => '')).trim();
  const isJsonLike = contentType.includes('application/json') || contentType.includes('application/problem+json') || rawText.startsWith('{') || rawText.startsWith('[');

  let payload: unknown = {};
  let parseError = '';
  if (rawText) {
    if (isJsonLike) {
      try {
        payload = JSON.parse(rawText);
      } catch (error) {
        parseError = `Response was not valid JSON (${(error as Error).message || 'unknown parse error'}).`;
      }
    } else {
      parseError = `Response was not JSON for API endpoint (${contentType || 'unknown content type'}).`;
    }
  }

  if (!response.ok) {
    const bodyMessage = parseError
      ? parseError
      : structuredError(payload);
    const snippet = rawText ? ` Body: ${rawText.slice(0, 240)}` : '';
    const statusMessage = `Request ${response.status} ${response.statusText} for ${target}`;
    throw new Error(`${statusMessage}: ${bodyMessage || 'Request failed.'}${snippet}`);
  }

  if (!rawText) {
    throw new Error(`Request for ${target} returned empty body.`);
  }
  if (parseError) {
    throw new Error(`Response parsing failed for ${target}: ${parseError}`);
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload as Record<string, unknown>).length === 0) {
    throw new Error(`Request for ${target} returned an empty JSON object.`);
  }
  return payload as T;
}

async function requestJsonSafe<T>(url: string, init?: RequestInit): Promise<RequestSafeResult<T>> {
  const target = apiUrl(url);
  try {
    const value = await requestJson<T>(url, init);
    return { ok: true, value };
  } catch (error: unknown) {
    const message = formatRequestError(error, target);
    return {
      ok: false,
      failure: {
        target,
        message,
        bodyPreview: message.length > 220 ? `${message.slice(0, 217)}...` : message,
      },
    };
  }
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
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [makeFilter, setMakeFilter] = useState('all');
  const [inventorySort, setInventorySort] = useState<InventorySort>('ltv-low');
  const [priceFloor, setPriceFloor] = useState<number | null>(null);
  const [priceCeiling, setPriceCeiling] = useState<number | null>(null);
  const [priceFilterDirty, setPriceFilterDirty] = useState(false);
  const [dealershipUrl, setDealershipUrl] = useState('');
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [dealerForm, setDealerForm] = useState({ name: '', preowned_url: '', used_url: '', new_url: '' });
  const [dealerBusy, setDealerBusy] = useState(false);
  const [commandBar, setCommandBar] = useState('');
  const [mode, setMode] = useState<'vehicle' | 'pipeline'>('vehicle');
  const [tab, setTab] = useState<'overview' | 'assets' | 'marketing' | 'intelligence' | 'finance'>('overview');
  const [financePanel, setFinancePanel] = useState<'summary' | 'structure' | 'compare' | 'upload'>('summary');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  const [caption, setCaption] = useState('');
  const [accountId, setAccountId] = useState('');
  const [marketingFlags, setMarketingFlags] = useState({
    includePrice: false,
    includeDownPromo: false,
    includeFinancing: true,
  });
  const [promoDown, setPromoDown] = useState('999');
  const [photoOrder, setPhotoOrder] = useState<number[]>([]);
  const [selectedPhotoIndexes, setSelectedPhotoIndexes] = useState<number[]>([]);
  const [dragPhotoIndex, setDragPhotoIndex] = useState<number | null>(null);

  const [dealCost, setDealCost] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const leadInboxPollInFlight = useRef(false);
  const leadSyncPollInFlight = useRef(false);
  const marketplaceSyncInFlight = useRef(false);

  const [structureForm, setStructureForm] = useState({
    salePrice: '',
    down: '0',
    trade: '0',
    taxes: '0',
    fees: String(DEFAULT_BANK_FEES),
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

  const [routeOneForm, setRouteOneForm] = useState({
    title: '',
    firstName: '',
    middleName: '',
    lastName: '',
    suffix: '',
    dobMonth: '',
    dobDay: '',
    dobYear: '',
    ssn: '',
    homePhone: '',
    cellularPhone: '',
    email: '',
    address: '',
    zip: '',
    city: '',
    state: 'FL',
    county: '',
    timeAtAddressYears: '',
    timeAtAddressMonths: '',
    residenceType: '',
    rentMortgage: '',
    employmentType: '',
    employmentStatus: '',
    employmentTitle: '',
    employer: '',
    employerPhone: '',
    timeAtJobYears: '',
    timeAtJobMonths: '',
    incomeInterval: 'Monthly',
    otherIncomeSource: '',
    otherIncomeAmount: '',
    otherIncomeInterval: '',
    saleAssetType: 'Auto',
    intendedUse: 'Personal',
    saleCondition: '',
    stockNumber: '',
    fuelType: '',
    tradeYear: '',
    tradeMake: '',
    tradeModel: '',
    tradeStyle: '',
    lienHolder: '',
    titleRegFees: '0',
    rebate: '0',
    tradeOwed: '0',
    gap: '0',
    creditLife: '0',
    disability: '0',
    otherInsSvc: '0',
    wholesaleInvoice: '',
    retail: '',
    msrp: '',
    comments: '',
    creditBureau: 'Experian',
  });

  const [analysisText, setAnalysisText] = useState('');
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzePayload | null>(null);
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [inCreditByVin, setInCreditByVin] = useState<Record<string, boolean>>({});
  const [submittedByVin, setSubmittedByVin] = useState<Record<string, boolean>>({});

  const [postResult, setPostResult] = useState<OneClickPostPayload | null>(null);
  const [assetModal, setAssetModal] = useState<'sticker' | 'carfax' | null>(null);

  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [quickEdit, setQuickEdit] = useState({ vin: '', title: '', price: '', mileage: '' });

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [autoFullSyncAttempted, setAutoFullSyncAttempted] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchSelectedVins, setBatchSelectedVins] = useState<Record<string, boolean>>({});
  const [batchQueue, setBatchQueue] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [liveStatus, setLiveStatus] = useState<FacebookLiveStatus | null>(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);

  const selected = useMemo(
    () => inventory.find((item) => vin(item.vin) === vin(selectedVin)),
    [inventory, selectedVin],
  );
  const selectedAssets = vin(selectedVin) ? assetsByVin[vin(selectedVin)] : undefined;
  const selectedAssetData = useMemo(() => {
    const cleanVin = vin(selected?.vin || selectedAssets?.vin);
    const row = (selected || {}) as Record<string, unknown>;
    const fallback: Partial<VehicleAssets> | null = cleanVin
      ? {
          vin: cleanVin,
          photos: Array.isArray(row.photos) ? row.photos : undefined,
          sticker_url: typeof row.sticker_url === 'string' ? row.sticker_url : null,
          carfax_url: typeof row.carfax_url === 'string' ? row.carfax_url : null,
          sticker_highlights: Array.isArray(row.sticker_highlights) ? (row.sticker_highlights as string[]) : undefined,
          marketing_summary: Array.isArray(row.marketing_summary) ? (row.marketing_summary as string[]) : undefined,
          carfax_summary: row.carfax_summary && typeof row.carfax_summary === 'object'
            ? (row.carfax_summary as VehicleAssets['carfax_summary'])
            : null,
          sticker_view_url: typeof row.sticker_url === 'string' && row.sticker_url
            ? `/api/vehicles/${encodeURIComponent(cleanVin)}/asset-view/sticker`
            : null,
          carfax_view_url: typeof row.carfax_url === 'string' && row.carfax_url
            ? `/api/vehicles/${encodeURIComponent(cleanVin)}/asset-view/carfax`
            : null,
        }
      : null;
    if (!fallback && !selectedAssets) return undefined;
    return {
      ...(fallback || {}),
      ...(selectedAssets || {}),
      vin: cleanVin || selectedAssets?.vin || '',
      sticker_view_url: selectedAssets?.sticker_view_url || fallback?.sticker_view_url || null,
      carfax_view_url: selectedAssets?.carfax_view_url || fallback?.carfax_view_url || null,
    } as VehicleAssets;
  }, [selected, selectedAssets]);
  const selectedPhotos = useMemo(() => {
    const fromAssets = normalizePhotos(selectedAssetData?.photos);
    return fromAssets.length ? fromAssets : normalizePhotos(selected?.photos);
  }, [selectedAssetData?.photos, selected?.photos]);
  const inventoryPriceBounds = useMemo(() => {
    const prices = inventory
      .map((item) => num(item.price))
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (!prices.length) return { min: 0, max: 0, step: 500 };
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const min = Math.floor(rawMin / 500) * 500;
    const max = Math.ceil(rawMax / 500) * 500;
    const spread = Math.max(max - min, 500);
    const step = spread <= 10000 ? 250 : 500;
    return { min, max, step };
  }, [inventory]);

  useEffect(() => {
    const { min, max } = inventoryPriceBounds;
    setPriceFloor((current) => {
      if (current === null || Number.isNaN(current)) return min;
      return Math.min(Math.max(current, min), max);
    });
    setPriceCeiling((current) => {
      if (current === null || Number.isNaN(current)) return max;
      return Math.max(Math.min(current, max), min);
    });
  }, [inventoryPriceBounds]);

  useEffect(() => {
    if (priceFloor === null || priceCeiling === null) return;
    if (priceFloor > priceCeiling) {
      setPriceCeiling(priceFloor);
    }
  }, [priceFloor, priceCeiling]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minPrice = priceFloor ?? inventoryPriceBounds.min;
    const maxPrice = priceCeiling ?? inventoryPriceBounds.max;
    return inventory.filter((item) => {
      if (!isActiveInventoryVehicle(item)) return false;
      const clean = vin(item.vin);
      const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
      const posted = isVehicleMarketplaceLive(item);
      const condition = vehicleCondition(item);
      const make = vehicleMake(item).toLowerCase();
      const itemPrice = num(item.price);

      if (inventoryFilter === 'ready' && (posted || photos.length < 2)) return false;
      if (inventoryFilter === 'needs-assets' && photos.length >= 2) return false;
      if (inventoryFilter === 'unposted' && posted) return false;
      if (inventoryFilter === 'posted' && !posted) return false;
      if (inventoryFilter === 'used' && condition !== 'used') return false;
      if (inventoryFilter === 'new' && condition !== 'new') return false;
      if (makeFilter !== 'all' && make !== makeFilter.toLowerCase()) return false;
      if (priceFilterDirty && itemPrice !== null && (itemPrice < minPrice || itemPrice > maxPrice)) return false;
      if (!q) return true;

      const blob = [item.vin, item.title || '', item.status_label || '', String(item.price || '')]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    }).sort((left, right) => {
      if (inventorySort === 'price-low' || inventorySort === 'price-high') {
        const leftPrice = num(left.price) ?? Number.POSITIVE_INFINITY;
        const rightPrice = num(right.price) ?? Number.POSITIVE_INFINITY;
        return inventorySort === 'price-low' ? leftPrice - rightPrice : rightPrice - leftPrice;
      }
      if (inventorySort === 'title') {
        return String(left.title || '').localeCompare(String(right.title || ''));
      }
      const leftLtv = num(left.jd_power_ltv);
      const rightLtv = num(right.jd_power_ltv);
      if (leftLtv !== null && rightLtv === null) return -1;
      if (leftLtv === null && rightLtv !== null) return 1;
      if (leftLtv !== null && rightLtv !== null && leftLtv !== rightLtv) return leftLtv - rightLtv;
      return String(left.title || '').localeCompare(String(right.title || ''));
    });
  }, [assetsByVin, inventory, inventoryFilter, inventorySort, inventoryPriceBounds.max, inventoryPriceBounds.min, makeFilter, priceCeiling, priceFilterDirty, priceFloor, search]);

  const orderedPhotoIndexes = photoOrder.length
    ? photoOrder.filter((index) => index >= 0 && index < selectedPhotos.length)
    : selectedPhotos.map((_, index) => index);

  const enhancedCaption = useMemo(() => {
    let text = caption || defaultCaption(selected, selectedAssets);
    text = text.replace(/\$[1-9]\d{1,2},\d{3}(?:\.\d+)?(?:\s*(?:plus|\+)?\s*tax(?:es)?\.?)?/gi, downPaymentMoney(selected));
    if (!marketingFlags.includePrice) {
      text = text
        .replace(/^Price:.*$/gim, '')
        .replace(/^Location:.*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
    if (marketingFlags.includeDownPromo) {
      text = `${text}\nDown payment promo from ${money(promoDown)} down.`;
    }
    if (marketingFlags.includeFinancing) {
      text = `${text}\nFinancing options available.`;
    }
    return text.trim();
  }, [caption, marketingFlags.includeDownPromo, marketingFlags.includeFinancing, marketingFlags.includePrice, promoDown, selected, selectedAssets]);

  const frontGross = (num(selected?.price) ?? 0) - (num(dealCost) ?? 0);
  const backGross = num(structureForm.backend) ?? 0;

  const pipeline = {
    posted: inventory.filter(isVehicleMarketplaceLive).length,
    awaitingCredit: inventory.filter((item) => !inCreditByVin[vin(item.vin)]).length,
    inStructuring: Object.values(inCreditByVin).filter(Boolean).length,
    submitted: Object.values(submittedByVin).filter(Boolean).length,
    funded: posts.length,
  };

  async function refresh() {
    setRefreshBusy(true);
    const existingInventory = [...inventory];
    const existingWarnings: string[] = [];
    const loadSafe = async <T,>(
      label: string,
      path: string,
      fallback: T,
      init?: RequestInit,
    ): Promise<T> => {
      const result = await requestJsonSafe<T>(path, init);
      if (result.ok) return result.value;
      existingWarnings.push(`${label}: ${result.failure.message}`);
      return fallback;
    };

    try {
      let vehicles = await loadSafe<VehiclesPayload>('inventory list', '/api/inventory/active', {
        count: existingInventory.length,
        items: existingInventory,
        active_count: 0,
        in_transit_count: 0,
        source_status: sourceStatus,
      });
      let items = Array.isArray(vehicles.items) ? vehicles.items : existingInventory;
      let sourceStatusValue = vehicles.source_status;
      if (!autoFullSyncAttempted && items.length > 0 && items.length < 50) {
        setAutoFullSyncAttempted(true);
        setStatusText(`Only ${items.length} units loaded. Running one full website sync...`);
        const synced = await requestJsonSafe<VehiclesPayload>('/api/inventory/sync-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source_url: dealershipUrl || vehicles.source_status?.configured_url || undefined,
            timeout_seconds: 180,
            persist: true,
          }),
        });
        if (synced.ok) {
          vehicles = synced.value;
          items = Array.isArray(synced.value.items) ? synced.value.items : items;
          sourceStatusValue = synced.value.source_status;
        } else {
          existingWarnings.push(`inventory sync: ${synced.failure.message}`);
        }
      }

      const [accountsRes, postsRes, meRes, usersRes, leadsRes, offerupRes, statusRes, dealershipsRes] = await Promise.all([
        loadSafe<{ items?: Account[] }>('facebook accounts', '/api/facebook/accounts', { items: [] as Account[] }),
        loadSafe<{ items?: PostLog[] }>('facebook posts', '/api/facebook/posts', { items: [] as PostLog[] }),
        loadSafe<{ user?: XconsoleUser; permissions?: PermissionOption[] }>(
          'me',
          '/api/me',
          { user: null, permissions: DEFAULT_PERMISSION_OPTIONS },
        ),
        loadSafe<{ items?: XconsoleUser[]; permissions?: PermissionOption[] }>(
          'users',
          '/api/admin/users',
          { items: [], permissions: [] as PermissionOption[] },
        ),
        loadSafe<{ items?: LeadItem[]; sync?: unknown }>('lead inbox', '/api/leads/inbox?source=all', { items: [] }),
        loadSafe<OfferUpStatus>('offerup status', '/api/offerup/status', null as unknown as OfferUpStatus),
        loadSafe<StackStatus>('system status', '/api/status', null as unknown as StackStatus),
        loadSafe<DealershipsPayload>('dealerships', '/api/dealerships', { items: [], active_source_urls: [] }),
      ]);

      setMe(meRes.user || null);
      if (Array.isArray(meRes.permissions)) setPermissionOptions(meRes.permissions);
      if (Array.isArray(usersRes.items)) setUsers(usersRes.items);
      if (Array.isArray(usersRes.permissions)) setPermissionOptions(usersRes.permissions);
      setLeads(Array.isArray(leadsRes.items) ? leadsRes.items : []);
      setOfferup(offerupRes);
      setStackStatus(statusRes);
      setInventory(items);
      setSourceStatus(sourceStatusValue || null);
      setDealerships(Array.isArray(dealershipsRes.items) ? dealershipsRes.items : []);
      if (!dealershipUrl && sourceStatusValue?.configured_url) {
        setDealershipUrl(String(sourceStatusValue.configured_url));
      } else if (!dealershipUrl && Array.isArray(dealershipsRes.active_source_urls) && dealershipsRes.active_source_urls.length) {
        setDealershipUrl(dealershipsRes.active_source_urls.join(', '));
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
      const sourceLabel = sourceStatusValue?.active_source || 'runtime';
      if (existingWarnings.length) {
        setStatusText(`Inventory ${items.length} | Source ${sourceLabel} | Warnings: ${existingWarnings.join(' | ')}`);
        console.warn('[refresh] warnings', existingWarnings);
      } else {
        setStatusText(`Inventory ${items.length} | Source ${sourceLabel}`);
      }
    } catch (error: unknown) {
      setStatusText(`Refresh failed: ${formatRequestError(error, '/api/refresh')}`);
    } finally {
      setRefreshBusy(false);
    }
  }

  async function syncInventory(sourceOverride?: string) {
    setSyncBusy(true);
    try {
      await requestJson('/api/inventory/sync-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: sourceOverride || dealershipUrl || undefined, timeout_seconds: 180, persist: true }),
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
    if (!clean) return undefined;
    if (!force && assetsByVin[clean]) return assetsByVin[clean];
    try {
      const payload = await requestJson<VehicleAssets>(`/api/vehicles/${encodeURIComponent(clean)}/assets${force ? '?refresh=true' : ''}`);
      setAssetsByVin((previous) => ({ ...previous, [clean]: payload }));
      setInventory((previous) => previous.map((vehicle) => {
        if (vin(vehicle.vin) !== clean) return vehicle;
        return {
          ...vehicle,
          photos: Array.isArray(payload.photos) && payload.photos.length ? payload.photos : vehicle.photos,
          photos_count: payload.photos_count ?? vehicle.photos_count,
          main_photo: payload.main_photo ?? vehicle.main_photo,
          sticker_url: payload.sticker_url ?? vehicle.sticker_url,
          carfax_url: payload.carfax_url ?? vehicle.carfax_url,
          carfax_facts: payload.carfax_facts ?? vehicle.carfax_facts,
          carfax_summary: payload.carfax_summary ?? vehicle.carfax_summary,
        };
      }));
      return payload;
    } catch {
      // Keep UI responsive if assets fail.
      return undefined;
    }
  }

  async function loadFacebookLiveStatus() {
    try {
      const payload = await requestJson<FacebookLiveStatus>('/api/facebook/live-status');
      if (isIdleFacebookStage(payload.stage) && (postBusy || batchBusy)) {
        return;
      }
      setLiveStatus(payload);
      if (payload.stage && !isIdleFacebookStage(payload.stage)) {
        const prefix = payload.vin ? `Facebook ${payload.vin}` : 'Facebook';
        const batch = payload.batch_total ? ` batch ${payload.batch_current || 0}/${payload.batch_total}` : '';
        const counts = payload.batch_total ? ` | posted ${payload.posted || 0} | failed ${payload.failed || 0}` : '';
        setStatusText(`${prefix}${batch}: ${readableFacebookStatus(payload.stage)}${counts}`);
      }
    } catch {
      // Status polling should never interrupt the posting flow.
    }
  }

  async function syncMarketplaceStatuses(silent = true) {
    const payload = await requestJson<{ counts?: Record<string, number>; updates?: unknown[]; synced_at?: string }>('/api/facebook/sync-marketplace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verify_live_urls: true, processing_review_minutes: 45 }),
    });
    if (!silent) {
      const counts = payload.counts || {};
      setStatusText(`Marketplace sync: ${counts.live || 0} live, ${counts.processing || 0} processing, ${counts.needs_review || 0} needs review.`);
      await refresh();
    }
    return payload;
  }

  async function postVehicle(modeOverride: 'live' | 'draft', targetVin: string, options: { refreshAfter?: boolean; batchIndex?: number; batchTotal?: number } = {}) {
    const clean = vin(targetVin || selectedVin);
    if (!clean) {
      setStatusText('Select a vehicle first.');
      return null;
    }
    const targetVehicle = inventory.find((item) => vin(item.vin) === clean);
    if (clean !== vin(selectedVin)) {
      setSelectedVin(clean);
    }
    const orderedSelected = orderedPhotoIndexes.filter((index) => selectedPhotoIndexes.includes(index));
    const batchPrefix = options.batchTotal ? `Batch ${options.batchIndex}/${options.batchTotal}: ` : '';
    const preparingStage = `Preparing Facebook ${modeOverride} for ${targetVehicle?.title || clean}. VIN ${clean}. Importing photos and opening Marketplace automation...`;
    setStatusText(`${batchPrefix}${preparingStage}`);
    setLiveStatus({
      ok: true,
      vin: clean,
      title: targetVehicle?.title || clean,
      stage: preparingStage,
      type: 'main',
      updated_at: new Date().toISOString(),
    });
    setPostResult(null);
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
    if (!payload.post_result) {
      const currentLiveStatus = await requestJsonSafe<FacebookLiveStatus>('/api/facebook/live-status');
      if (currentLiveStatus.ok && currentLiveStatus.value?.stage && !isIdleFacebookStage(currentLiveStatus.value.stage)) {
        setLiveStatus(currentLiveStatus.value);
        setStatusText(`${batchPrefix}${readableFacebookStatus(currentLiveStatus.value.stage)}`);
      } else {
        setStatusText(`${batchPrefix}Facebook returned no post result for ${clean}.`);
      }
      if (options.refreshAfter !== false) {
        await refresh();
      }
      return payload;
    }
    const postState = payload.post_result?.marketplace_status || (payload.post_result?.live_success ? 'live' : 'needs_review');
    setLiveStatus({
      ok: Boolean(payload.post_result?.live_success),
      vin: clean,
      title: targetVehicle?.title || clean,
      stage: payload.post_result?.live_success
        ? 'Marketplace listing confirmed.'
        : payload.post_result?.live_detail || `${titleCaseStatus(postState)} for ${clean}.`,
      type: payload.post_result?.live_success ? 'success' : postState,
      updated_at: new Date().toISOString(),
    });
    setStatusText(
      payload.post_result?.live_success
        ? `${batchPrefix}Posted live ${clean}`
        : `${batchPrefix}${titleCaseStatus(postState)} for ${clean}: ${readableFacebookStatus(payload.post_result?.live_detail || 'Marketplace listing was not confirmed live.')}`,
    );
    if (options.refreshAfter !== false) {
      void refresh().catch(() => undefined);
    }
    return payload;
  }

  async function post(modeOverride: 'live' | 'draft' = 'live', targetVin?: string) {
    setPostBusy(true);
    try {
      await postVehicle(modeOverride, targetVin || selectedVin, { refreshAfter: true });
    } catch (error: unknown) {
      setStatusText(`Facebook post failed: ${readableFacebookStatus(error)}`);
    } finally {
      setPostBusy(false);
    }
  }

  function toggleBatchVin(targetVin: string) {
    const clean = vin(targetVin);
    if (!clean) return;
    setBatchSelectedVins((previous) => ({ ...previous, [clean]: !previous[clean] }));
  }

  function selectVisibleUnpostedForBatch(limit = 10) {
    const selectedVins: Record<string, boolean> = {};
    filtered
      .filter((vehicle) => {
        const clean = vin(vehicle.vin);
        return clean && !isVehicleMarketplaceLive(vehicle);
      })
      .slice(0, limit)
      .forEach((vehicle) => {
        selectedVins[vin(vehicle.vin)] = true;
      });
    setBatchSelectedVins(selectedVins);
    setStatusText(`Selected ${Object.keys(selectedVins).length} visible unposted vehicles for Facebook batch.`);
  }

  async function postSelectedBatch() {
    const queue = Object.keys(batchSelectedVins).filter((clean) => batchSelectedVins[clean]);
    if (!queue.length) {
      setStatusText('Select vehicles in the inventory list before starting a Facebook batch.');
      return;
    }
    setBatchBusy(true);
    setPostBusy(true);
    setBatchQueue(queue);
    setBatchProgress({ current: 0, total: queue.length, success: 0, failed: 0 });
    try {
      setSelectedVin(queue[0]);
      setStatusText(`Facebook batch starting: ${queue.length} vehicles. One browser session will stay open while Marketplace forms post one after another.`);
      const payload = await requestJson<{
        posted?: number;
        failed?: number;
        live_detail?: string;
        live_success?: boolean;
      }>('/api/facebook/post/batch-from-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vins: queue,
          account_id: accountId || undefined,
          skip_photo_indexes: THUMBNAIL_SKIP,
          auto_import_photos: true,
          photo_limit: 24,
        }),
      });
      const success = payload.posted || 0;
      const failed = payload.failed || 0;
      setBatchProgress({ current: queue.length, total: queue.length, success, failed });
      setStatusText(payload.live_detail || `Facebook batch finished: ${success} posted, ${failed} failed.`);
      setBatchSelectedVins({});
      void refresh().catch(() => undefined);
    } catch (error: unknown) {
      setStatusText(`Facebook batch failed: ${readableFacebookStatus(error)}`);
    } finally {
      setBatchBusy(false);
      setPostBusy(false);
      setBatchQueue([]);
    }
  }

  async function saveDealership() {
    if (!dealerForm.name.trim()) {
      setStatusText('Dealership name is required.');
      return;
    }
    setDealerBusy(true);
    try {
      const payload = await requestJson<DealershipsPayload & { dealership?: Dealership }>('/api/dealerships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: dealerForm.name.trim(),
          preowned_url: dealerForm.preowned_url.trim() || null,
          used_url: dealerForm.used_url.trim() || null,
          new_url: dealerForm.new_url.trim() || null,
          active: true,
        }),
      });
      setDealerships(Array.isArray(payload.items) ? payload.items : []);
      const urls = Array.isArray(payload.active_source_urls) ? payload.active_source_urls.join(', ') : '';
      if (urls) setDealershipUrl(urls);
      setDealerForm({ name: '', preowned_url: '', used_url: '', new_url: '' });
      setStatusText(`${payload.dealership?.name || 'Dealership'} saved. Syncing all active inventory sources...`);
      await syncInventory(urls);
    } catch (error: unknown) {
      setStatusText(`Dealership save failed: ${String(error)}`);
    } finally {
      setDealerBusy(false);
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
  const [valuationStatus, setValuationStatus] = useState<ValuationStatus | null>(null);
  const [valuationFile, setValuationFile] = useState<File | null>(null);
  const [vehicleRecommendations, setVehicleRecommendations] = useState<VehicleRecommendation[]>([]);
  const [me, setMe] = useState<XconsoleUser | null>(null);
  const [users, setUsers] = useState<XconsoleUser[]>([]);
  const [permissionOptions, setPermissionOptions] = useState<PermissionOption[]>(DEFAULT_PERMISSION_OPTIONS);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    display_name: '',
    role: 'operator',
    permissions: ['inventory.view', 'assets.view', 'stickers.view', 'carfax.view', 'facebook.post', 'facebook.leads', 'offerup.post', 'bankbrain.view'],
    active: true,
  });
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [leadDrafts, setLeadDrafts] = useState<Record<string, string>>({});
  const [leadAttachmentFile, setLeadAttachmentFile] = useState<File | null>(null);
  const [leadSyncMeta, setLeadSyncMeta] = useState<Record<string, unknown> | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState('');
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
        permissions: ['inventory.view', 'assets.view', 'stickers.view', 'carfax.view', 'facebook.post', 'facebook.leads', 'offerup.post', 'bankbrain.view'],
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

  async function respondToLead(
    lead: LeadItem,
    options?: {
      draftOverride?: string;
      attachmentUrl?: string | null;
      attachmentType?: string;
      attachmentFile?: File | null;
      clearDraft?: boolean;
    },
  ) {
    const attachmentUrl = String(options?.attachmentUrl || '').trim();
    const attachmentFile = options?.attachmentFile || leadAttachmentFile;
    const attachmentType = options?.attachmentType
      || (attachmentFile ? (String(attachmentFile.type || '').toLowerCase().startsWith('image/') ? 'image' : 'file') : 'image');
    const responseText =
      options?.draftOverride?.trim()
      || leadDrafts[lead.id]?.trim()
      || (attachmentUrl || attachmentFile ? '' : `Thanks for reaching out. I can help with ${lead.vehicle_vin || selected?.title || 'this vehicle'} today.`);
    setLeadBusy(true);
    try {
      const payload = attachmentFile
        ? await requestJson<{ items?: LeadItem[]; delivery_note?: string }>('/api/leads/respond-upload', {
            method: 'POST',
            body: (() => {
              const form = new FormData();
              form.append('lead_id', lead.id);
              form.append('response_text', responseText);
              form.append('channel', lead.channel || 'facebook');
              form.append('mark_status', 'responded');
              form.append('attachment_type', attachmentType);
              form.append('attachment_file', attachmentFile);
              return form;
            })(),
          })
        : await requestJson<{ items?: LeadItem[]; delivery_note?: string }>('/api/leads/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: lead.id,
              response_text: responseText,
              channel: lead.channel || 'facebook',
              mark_status: 'responded',
              attachment_url: attachmentUrl || undefined,
              attachment_type: attachmentUrl ? attachmentType : undefined,
            }),
          });
      setLeads(Array.isArray(payload.items) ? payload.items : []);
      if (options?.clearDraft !== false) {
        setLeadDrafts((previous) => ({ ...previous, [lead.id]: '' }));
      }
      setLeadAttachmentFile(null);
      setSelectedLeadId(lead.id);
      setStatusText(payload.delivery_note || 'Lead response sent.');
    } catch (error: unknown) {
      setStatusText(`Lead response failed: ${formatRequestError(error, '/api/leads/respond')}`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function syncFacebookLeads() {
    setLeadBusy(true);
    try {
      const payload = await requestJson<{ items?: LeadItem[]; mode?: string; guidance?: string[]; warnings?: string[]; pagination?: Record<string, unknown> }>('/api/leads/sync-facebook?source=all', {
        method: 'POST',
      });
      setLeadSyncMeta(payload as unknown as Record<string, unknown>);
      const refreshed = await loadLeadInbox(true, true);
      setLeads(Array.isArray(refreshed.items) ? (refreshed.items as LeadItem[]) : []);
      setStatusText(payload.guidance?.[0] || `Facebook lead sync: ${payload.mode || 'complete'}`);
    } catch (error: unknown) {
      setStatusText(`Facebook lead sync failed: ${formatRequestError(error, '/api/leads/sync-facebook')}`);
    } finally {
      setLeadBusy(false);
    }
  }

  async function loadLeadInbox(sync = false, force = false) {
    const payload = await requestJson<{ items?: LeadItem[]; sync?: unknown }>(
      `/api/leads/inbox?source=all${sync ? '&sync=true' : ''}${force ? '&force_sync=true' : ''}`,
    );
    setLeads(Array.isArray(payload.items) ? payload.items : []);
    if (payload.sync && typeof payload.sync === 'object') {
      setLeadSyncMeta(payload.sync as Record<string, unknown>);
    }
    return payload;
  }

  function fillLeadDraft(message: string) {
    if (!activeLead) return;
    setLeadDrafts((previous) => ({ ...previous, [activeLead.id]: message }));
  }

  async function sendLeadAsset(kind: 'carfax' | 'sticker' | 'photos' | 'finance') {
    if (!activeLead) return;
    const title = selected?.title || 'this vehicle';
    if (kind === 'carfax') {
      const link = selectedAssets?.carfax_url || selected?.detail_url || '';
      if (!link) {
        setStatusText('No CARFAX link is available for this vehicle yet.');
        return;
      }
      await respondToLead(activeLead, {
        draftOverride: `${title} CARFAX: ${link}`,
        clearDraft: true,
      });
      return;
    }
    if (kind === 'sticker') {
      const link = selectedAssets?.sticker_url || selected?.detail_url || '';
      if (!link) {
        setStatusText('No window sticker link is available for this vehicle yet.');
        return;
      }
      await respondToLead(activeLead, {
        draftOverride: `${title} window sticker: ${link}`,
        clearDraft: true,
      });
      return;
    }
    if (kind === 'photos') {
      const photo = selectedPhotosResolved[0];
      if (photo) {
        await respondToLead(activeLead, {
          draftOverride: `Here are photos for ${title}.`,
          attachmentUrl: photo,
          attachmentType: 'image',
          clearDraft: true,
        });
        return;
      }
      fillLeadDraft(`I can send more photos of ${title}. Tell me what angle you want to see.`);
      return;
    }
    fillLeadDraft(`I can send the quick finance application for ${title}. Reply APP and I’ll get it right over to you.`);
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
      if (brainRes?.default_structure) {
        setStructure({
          structure: brainRes.default_structure,
          recommendation: brainRes.recommendation,
        });
      }
    } finally {
      setIntelBusy(false);
    }
  }

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
    const clean = value.trim();
    if (!clean) return null;
    const parsed = Number(clean);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function updateRouteOneField(field: keyof typeof routeOneForm, value: string) {
    setRouteOneForm((previous) => ({ ...previous, [field]: value }));
  }

  function analysisMetricOverrides(payload: AnalyzePayload): Partial<typeof structureForm> {
    const metrics = payload.metrics;
    if (!metrics) return {};
    const updates: Partial<typeof structureForm> = {};
    if (metrics.score !== null && metrics.score !== undefined) updates.score = String(metrics.score);
    if (metrics.tradelines !== null && metrics.tradelines !== undefined) updates.tradelines = String(metrics.tradelines);
    if (metrics.derogatories !== null && metrics.derogatories !== undefined) updates.derogatories = String(metrics.derogatories);
    if (metrics.utilization !== null && metrics.utilization !== undefined) updates.utilization = String(metrics.utilization);
    if (metrics.dti !== null && metrics.dti !== undefined) updates.currentDti = String(metrics.dti);
    if (metrics.current_dti !== null && metrics.current_dti !== undefined) updates.currentDti = String(metrics.current_dti);
    if (metrics.monthly_income !== null && metrics.monthly_income !== undefined) updates.monthlyIncome = String(metrics.monthly_income);
    return updates;
  }

  function applyAnalysisMetrics(payload: AnalyzePayload): Partial<typeof structureForm> {
    const updates = analysisMetricOverrides(payload);
    if (!Object.keys(updates).length) return updates;
    setStructureForm((previous) => ({
      ...previous,
      ...updates,
    }));
    return updates;
  }

  function applyRouteOneAutofill(payload: AnalyzePayload) {
    const fill = payload.route_one_fill;
    if (!fill) return;
    const updates: Partial<typeof routeOneForm> = {};
    const clean = (value: string | undefined): string => String(value || '').trim();
    const setIfEmpty = (field: keyof typeof routeOneForm, value: string) => {
      if (!value) return;
      if (!routeOneForm[field]?.trim()) {
        updates[field] = value;
      }
    };

    setIfEmpty('title', clean(fill.title));
    setIfEmpty('firstName', clean(fill.first_name));
    setIfEmpty('middleName', clean(fill.middle_name));
    setIfEmpty('lastName', clean(fill.last_name));
    setIfEmpty('suffix', clean(fill.suffix));
    setIfEmpty('dobMonth', clean(fill.dob_month));
    setIfEmpty('dobDay', clean(fill.dob_day));
    setIfEmpty('dobYear', clean(fill.dob_year));
    setIfEmpty('ssn', clean(fill.ssn));
    setIfEmpty('homePhone', clean(fill.home_phone));
    setIfEmpty('cellularPhone', clean(fill.cellular_phone));
    setIfEmpty('email', clean(fill.email));
    setIfEmpty('address', clean(fill.address));
    setIfEmpty('city', clean(fill.city));
    setIfEmpty('state', clean(fill.state));
    setIfEmpty('zip', clean(fill.zip));
    setIfEmpty('timeAtAddressYears', clean(fill.time_at_address_years));
    setIfEmpty('timeAtAddressMonths', clean(fill.time_at_address_months));
    setIfEmpty('timeAtJobYears', clean(fill.time_at_job_years));
    setIfEmpty('timeAtJobMonths', clean(fill.time_at_job_months));
    setIfEmpty('employmentType', clean(fill.employment_type));
    setIfEmpty('employmentStatus', clean(fill.employment_status));
    setIfEmpty('employmentTitle', clean(fill.employment_title));
    setIfEmpty('employer', clean(fill.employer));
    setIfEmpty('otherIncomeSource', clean(fill.other_income_source));
    setIfEmpty('otherIncomeAmount', clean(fill.other_income_amount));
    setIfEmpty('incomeInterval', clean(fill.income_interval));
    setIfEmpty('residenceType', clean(fill.residence_type));
    setIfEmpty('rentMortgage', clean(fill.rent_mortgage));

    if (Object.keys(updates).length) {
      setRouteOneForm((previous) => ({ ...previous, ...updates }));
      setStatusText(`RouteOne form auto-filled ${Object.keys(updates).length} field(s) from upload analysis.`);
    }
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
      const metricUpdates = applyAnalysisMetrics(payload);
      applyRouteOneAutofill(payload);
      if (selected) setInCreditByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setTab('finance');
      if (selected && optionalNumber(structureForm.salePrice)) {
        await simulateStructure(metricUpdates);
      }
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
      const metricUpdates = applyAnalysisMetrics(payload);
      applyRouteOneAutofill(payload);
      if (selected) setInCreditByVin((previous) => ({ ...previous, [vin(selected.vin)]: true }));
      setTab('finance');
      if (selected && optionalNumber(structureForm.salePrice)) {
        await simulateStructure(metricUpdates);
      }
      const chars = payload.extracted_text_chars ?? payload.file_understanding?.extracted_text_chars ?? 0;
      const ocr = payload.file_understanding?.ocr_pages ? ` OCR pages: ${payload.file_understanding.ocr_pages}.` : '';
      setStatusText(`File processed: ${analysisFile.name}. ${chars} text chars extracted.${ocr} Fields filled where detected.`);
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
          book_value: optionalNumber(String(selected?.jd_power_trade_in ?? '')),
          taxes: optionalNumber(merged.taxes) ?? 0,
          tax_rate: 0.06,
          fees: optionalNumber(merged.fees) ?? DEFAULT_BANK_FEES,
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
    try {
      const valuations = await requestJson<ValuationStatus>('/api/bank-brain/valuations/status');
      setValuationStatus(valuations);
    } catch {
      setValuationStatus(null);
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

  async function uploadValuations() {
    if (!valuationFile) {
      setStatusText('Choose a JD Power valuation XLS first.');
      return;
    }
    setRouteoneBusy(true);
    try {
      const form = new FormData();
      form.append('file', valuationFile);
      const payload = await requestJson<ValuationStatus>('/api/bank-brain/valuations/upload', {
        method: 'POST',
        body: form,
      });
      setValuationStatus(payload);
      setStatusText(`JD Power valuations loaded: ${payload.count || 0} units.`);
      if (selected) await simulateStructure();
    } catch (error: unknown) {
      setStatusText(`JD Power upload failed: ${String(error)}`);
    } finally {
      setRouteoneBusy(false);
    }
  }

  async function recommendVehicles() {
    setStructureBusy(true);
    try {
      const payload = await requestJson<{ items?: VehicleRecommendation[] }>('/api/bank-brain/recommend-vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: optionalNumber(structureForm.score),
          monthly_income: optionalNumber(structureForm.monthlyIncome),
          current_dti: optionalNumber(structureForm.currentDti),
          down_payment: (optionalNumber(structureForm.down) ?? 0) + (optionalNumber(structureForm.trade) ?? 0),
          max_results: 10,
        }),
      });
      setVehicleRecommendations(Array.isArray(payload.items) ? payload.items : []);
      setStatusText('Suggested vehicles refreshed.');
    } catch (error: unknown) {
      setStatusText(`Vehicle recommendations failed: ${String(error)}`);
    } finally {
      setStructureBusy(false);
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

  async function openAssetModal(kind: 'sticker' | 'carfax') {
    if (!selected) {
      setStatusText('Select a vehicle first.');
      return;
    }
    let hasAsset =
      kind === 'sticker'
        ? Boolean(selectedAssetData?.sticker_view_url || selectedAssetData?.sticker_url)
        : Boolean(selectedAssetData?.carfax_view_url || selectedAssetData?.carfax_url);
    if (!hasAsset) {
      setStatusText(kind === 'sticker' ? 'Refreshing sticker cache...' : 'Refreshing CARFAX cache...');
      const freshAssets = await loadAssets(selected.vin, true);
      hasAsset =
        kind === 'sticker'
          ? Boolean(freshAssets?.sticker_view_url || freshAssets?.sticker_url || selected?.sticker_url)
          : Boolean(freshAssets?.carfax_view_url || freshAssets?.carfax_url || selected?.carfax_url);
    }
    if (!hasAsset) {
      setStatusText(kind === 'sticker' ? 'Sticker is not cached for this vehicle yet.' : 'Carfax is not cached for this vehicle yet.');
      return;
    }
    setAssetModal(kind);
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
    const id = window.setInterval(() => {
      if (leadInboxPollInFlight.current) return;
      leadInboxPollInFlight.current = true;
      void loadLeadInbox(false, false)
        .catch(() => undefined)
        .finally(() => {
          leadInboxPollInFlight.current = false;
        });
    }, 45000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (marketplaceSyncInFlight.current) return;
      marketplaceSyncInFlight.current = true;
      void syncMarketplaceStatuses(true)
        .then(() => refresh())
        .catch(() => undefined)
        .finally(() => {
          marketplaceSyncInFlight.current = false;
        });
    }, 180000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!postBusy && !batchBusy) return;
    void loadFacebookLiveStatus();
    const id = window.setInterval(() => {
      void loadFacebookLiveStatus();
    }, 2500);
    return () => window.clearInterval(id);
  }, [postBusy, batchBusy]);

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
    if (!leads.length) {
      if (selectedLeadId) setSelectedLeadId('');
      return;
    }
    if (selectedLeadId && leads.some((lead) => lead.id === selectedLeadId)) return;
    const linked = leads.find((lead) => vin(lead.vehicle_vin) === vin(selectedVin));
    setSelectedLeadId((linked || leads[0]).id);
  }, [leads, selectedLeadId, selectedVin]);

  useEffect(() => {
    if (!can('facebook.leads')) return undefined;
    const timer = window.setInterval(() => {
      if (leadSyncPollInFlight.current) return;
      leadSyncPollInFlight.current = true;
      void loadLeadInbox(true, false)
        .catch(() => undefined)
        .finally(() => {
          leadSyncPollInFlight.current = false;
        });
    }, 180000);
    return () => window.clearInterval(timer);
  }, [me]);

  useEffect(() => {
    setCaption(defaultCaption(selected, selectedAssets));
  }, [selected, selectedAssets]);

  useEffect(() => {
    const shouldSkipThumbnailSlots = selectedPhotos.length > 10;
    const defaults = selectedPhotos
      .map((_, index) => index)
      .filter((index) => !shouldSkipThumbnailSlots || !THUMBNAIL_SKIP.includes(index));
    setSelectedPhotoIndexes(defaults.length ? defaults : selectedPhotos.length ? [0] : []);
    setPhotoOrder(selectedPhotos.map((_, index) => index));
  }, [selectedPhotos]);

  useEffect(() => {
    if (!selected) return;
    const parsed = num(selected.price);
    const structuredSale = parsed !== null ? Math.round(parsed + FACEBOOK_PRICE_BUMP) : null;
    const condition = vehicleCondition(selected);
    setStructureForm((previous) => ({
      ...previous,
      salePrice: structuredSale !== null ? String(structuredSale) : previous.salePrice,
      taxes: structuredSale !== null ? String(Math.round(structuredSale * 0.06)) : previous.taxes,
      fees: previous.fees && previous.fees !== '0' ? previous.fees : String(selected.default_bank_fees ?? DEFAULT_BANK_FEES),
    }));
    setRouteOneForm((previous) => ({
      ...previous,
      saleCondition: condition === 'unknown' ? previous.saleCondition : condition === 'new' ? 'New' : 'Used',
      stockNumber: selected.stock_number !== null && selected.stock_number !== undefined ? String(selected.stock_number) : previous.stockNumber,
      fuelType: selected.fuel_type || previous.fuelType,
      wholesaleInvoice: selected.jd_power_trade_in !== null && selected.jd_power_trade_in !== undefined ? String(selected.jd_power_trade_in) : previous.wholesaleInvoice,
      retail: selected.msrp !== null && selected.msrp !== undefined ? String(selected.msrp) : previous.retail,
      msrp: selected.msrp !== null && selected.msrp !== undefined ? String(selected.msrp) : previous.msrp,
    }));
    if (parsed !== null && !dealCost) {
      setDealCost(String(Math.max(0, Math.round(parsed * 0.86))));
    }
  }, [selected]);

  const selectedPosted = isVehicleMarketplaceLive(selected);
  const selectedInCredit = selected ? Boolean(inCreditByVin[vin(selected.vin)]) : false;
  const selectedSubmitted = selected ? Boolean(submittedByVin[vin(selected.vin)]) : false;
  const approvalProbability = bestBank
    ? `${bestBank.confidence.toFixed(1)}%`
    : vehicleBestBank
      ? `${vehicleBestBank.confidence.toFixed(1)}%`
      : 'n/a';
  const selectedTitleParts = useMemo(() => parseVehicleTitleParts(selected), [selected]);
  const selectedPhotosResolved = useMemo(() => resolveVehiclePhotos(selected, selectedAssets), [selected, selectedAssets]);

  function activateVehicle(targetVin: string, nextTab: 'overview' | 'assets' | 'marketing' | 'intelligence' | 'finance' = 'overview') {
    const clean = vin(targetVin);
    if (!clean) return;
    setSelectedVin(clean);
    setMode('vehicle');
    setTab(nextTab);
    void loadAssets(clean);
  }

  const inventoryStats = useMemo(() => {
    const activeInventory = inventory.filter(isActiveInventoryVehicle);
    const total = activeInventory.length;
    const postedCount = activeInventory.filter(isVehicleMarketplaceLive).length;
    const readyToMarketCount = activeInventory.filter((item) => {
      const clean = vin(item.vin);
      const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
      return !isVehicleMarketplaceLive(item) && photos.length >= 2;
    }).length;
    const docsCachedCount = activeInventory.filter((item) => {
      const asset = assetsByVin[vin(item.vin)];
      return Boolean(asset?.sticker_url && asset?.carfax_url);
    }).length;
    const financeLiveCount = Object.values(inCreditByVin).filter(Boolean).length;
    const inTransitCount = inventory.length - total;
    const averagePrice =
      total > 0
        ? Math.round(
            activeInventory.reduce((sum, item) => sum + (num(item.price) ?? 0), 0) / total,
          )
        : 0;

    return {
      total,
      postedCount,
      readyToMarketCount,
      docsCachedCount,
      financeLiveCount,
      inTransitCount,
      averagePrice,
    };
  }, [assetsByVin, inCreditByVin, inventory]);

  const makeOptions = useMemo(() => {
    const byNormalized = new Map<string, string>();
    for (const item of inventory) {
      if (!isActiveInventoryVehicle(item)) continue;
      const make = vehicleMake(item);
      const normalized = make.toLowerCase();
      if (make && !byNormalized.has(normalized)) byNormalized.set(normalized, make);
    }
    return Array.from(byNormalized.values()).sort((left, right) => left.localeCompare(right));
  }, [inventory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<InventoryFilter, number> = {
      all: inventoryStats.total,
      ready: 0,
      'needs-assets': 0,
      unposted: 0,
      posted: 0,
      used: 0,
      new: 0,
    };

    for (const item of inventory) {
      if (!isActiveInventoryVehicle(item)) continue;
      const clean = vin(item.vin);
      const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
      const posted = isVehicleMarketplaceLive(item);
      const condition = vehicleCondition(item);
      if (!posted && photos.length >= 2) counts.ready += 1;
      if (photos.length < 2) counts['needs-assets'] += 1;
      if (posted) counts.posted += 1;
      if (!posted) counts.unposted += 1;
      if (condition === 'used') counts.used += 1;
      if (condition === 'new') counts.new += 1;
    }
    return counts;
  }, [assetsByVin, inventory, inventoryStats.total]);

  const readyToPostVehicles = useMemo(
    () =>
      inventory
        .filter(isActiveInventoryVehicle)
        .filter((item) => {
          const clean = vin(item.vin);
          const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
          return !isVehicleMarketplaceLive(item) && photos.length >= 2;
        })
        .sort((left, right) => (num(right.price) ?? 0) - (num(left.price) ?? 0)),
    [assetsByVin, inventory],
  );

  const needsAssetsVehicles = useMemo(
    () =>
      inventory
        .filter(isActiveInventoryVehicle)
        .filter((item) => {
          const clean = vin(item.vin);
          const photos = resolveVehiclePhotos(item, assetsByVin[clean]);
          const asset = assetsByVin[clean];
          return photos.length < 2 || !asset?.sticker_url || !asset?.carfax_url;
        }),
    [assetsByVin, inventory],
  );

  const selectedIntelligence = useMemo(() => {
    const photosCount = selectedPhotosResolved.length;
    const hasSticker = Boolean(selectedAssetData?.sticker_url);
    const hasCarfax = Boolean(selectedAssetData?.carfax_url);
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
    selectedAssetData?.carfax_url,
    selectedAssetData?.sticker_url,
    selectedInCredit,
    selectedPhotosResolved,
    selectedPosted,
    selectedSubmitted,
    structure?.structure?.estimated_payment,
  ]);

  const canEditInventory = can('inventory.edit');
  const canPostFacebook = can('facebook.post');
  const canViewBankBrain = can('bankbrain.view');
  const canManageDealerships = can('dealerships.manage');
  const canViewAssets = can('assets.view');
  const canViewStickers = can('stickers.view');
  const canViewCarfax = can('carfax.view');
  const selectedStickerHighlights = textList(selectedAssetData?.sticker_highlights);
  const selectedCarfaxHighlights = textList(selectedAssetData?.carfax_summary?.highlights);
  const selectedMarketingSummary = textList(selectedAssetData?.marketing_summary);
  const selectedBuyerText = buyerProfileText(selected, selectedAssets);
  const selectedCarfaxSummary = selectedAssetData?.carfax_summary?.summary || '';
  const selectedCarfaxFacts = selectedAssetData?.carfax_summary?.facts || {};
  const carfaxFactRows = [
    ['Owners', selectedCarfaxFacts.owner_count || 'Not parsed'],
    ['Value', selectedCarfaxFacts.value_badge || 'Not parsed'],
    ['Accidents', selectedCarfaxFacts.accident_damage || 'Open report'],
    ['Service', selectedCarfaxFacts.service_history || 'Open report'],
    ['Market', [selectedCarfaxFacts.market_position, selectedCarfaxFacts.market_delta].filter(Boolean).join(' / ') || selectedCarfaxFacts.carfax_value || 'Not parsed'],
    ['Title', selectedCarfaxFacts.title_brand || 'Open report'],
  ];
  const bankBrainPointers = [
    ...(vehicleBrain?.recommendation?.collateral_flags || []),
    ...(vehicleBrain?.packet_guidance || []),
    ...suggestions,
  ].filter(Boolean).slice(0, 4);
  const brainStructure = structure?.structure || vehicleBrain?.default_structure;
  const structureVin = vin(brainStructure?.vin || '');
  const selectedCleanVin = vin(selected?.vin || '');
  const structureBelongsToSelected = Boolean(brainStructure && (!structureVin || structureVin === selectedCleanVin));
  const selectedBookValue = selected?.jd_power_trade_in ?? brainStructure?.jd_power_trade_in ?? brainStructure?.book_value ?? null;
  const structureHasSelectedBook =
    !selected?.jd_power_trade_in ||
    brainStructure?.jd_power_trade_in === selected.jd_power_trade_in ||
    brainStructure?.book_value === selected.jd_power_trade_in;
  const selectedLtv =
    structureBelongsToSelected && structureHasSelectedBook && brainStructure?.ltv !== null && brainStructure?.ltv !== undefined
      ? brainStructure.ltv
      : selected?.jd_power_ltv ?? null;
  const selectedPayment = structureBelongsToSelected && structureHasSelectedBook ? brainStructure?.estimated_payment ?? null : null;
  const selectedFinanced = structureBelongsToSelected && structureHasSelectedBook ? brainStructure?.financed_amount ?? null : null;
  const selectedFees = optionalNumber(structureForm.fees) ?? brainStructure?.fees ?? selected?.default_bank_fees ?? DEFAULT_BANK_FEES;
  const routeOneSalePrice = optionalNumber(structureForm.salePrice) ?? (num(selected?.price) !== null ? Math.round((num(selected?.price) || 0) + FACEBOOK_PRICE_BUMP) : 0);
  const routeOneTaxes = optionalNumber(structureForm.taxes) ?? Math.round(routeOneSalePrice * 0.06);
  const routeOneDown = optionalNumber(structureForm.down) ?? 0;
  const routeOneTradeAllowance = optionalNumber(structureForm.trade) ?? 0;
  const routeOneTradeOwed = optionalNumber(routeOneForm.tradeOwed) ?? 0;
  const routeOneRebate = optionalNumber(routeOneForm.rebate) ?? 0;
  const routeOneTitleRegFees = optionalNumber(routeOneForm.titleRegFees) ?? 0;
  const routeOneBackend = optionalNumber(structureForm.backend) ?? 0;
  const routeOneNetTrade = routeOneTradeAllowance - routeOneTradeOwed;
  const routeOneTotalDown = routeOneDown + Math.max(0, routeOneNetTrade) + routeOneRebate;
  const routeOneTotalCashSellingPrice = routeOneSalePrice + routeOneTaxes + selectedFees + routeOneTitleRegFees;
  const routeOneFinancedAmount = selectedFinanced ?? Math.max(0, routeOneTotalCashSellingPrice + routeOneBackend - routeOneTotalDown);
  const visibleBankRecommendations = useMemo(() => {
    const sourceBanks = [
      ...rankedBanks,
      bestBank,
      vehicleBestBank,
      backupBank,
      vehicleBackupBank,
    ].filter((bank): bank is BankRank => Boolean(bank?.bank_name));
    const seen = new Set<string>();
    const deduped: BankRank[] = [];
    for (const bank of sourceBanks) {
      const key = (bank.bank_code || bank.bank_name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(bank);
    }
    if (deduped.length) return deduped.slice(0, 6);
    return bankProfiles.slice(0, 6).map((profile) => ({
      bank_code: profile.code,
      bank_name: profile.name,
      confidence: 0,
      reasons: ['Upload a credit report and run structure to score this lender.'],
    }));
  }, [backupBank, bankProfiles, bestBank, rankedBanks, vehicleBackupBank, vehicleBestBank]);
  const creditReportAdvice = useMemo(() => {
    const metrics = analysis?.metrics || {};
    const score = optionalNumber(structureForm.score) ?? metrics.score ?? null;
    const income = optionalNumber(structureForm.monthlyIncome) ?? metrics.monthly_income ?? null;
    const dti = optionalNumber(structureForm.currentDti) ?? metrics.current_dti ?? metrics.dti ?? null;
    const tradelines = optionalNumber(structureForm.tradelines) ?? metrics.tradelines ?? null;
    const derogatories = optionalNumber(structureForm.derogatories) ?? metrics.derogatories ?? null;
    const utilization = optionalNumber(structureForm.utilization) ?? metrics.utilization ?? null;
    const advice = [
      ...bankBrainPointers,
      ...suggestions,
      ...riskFlags.map((item) => `Watch: ${item}`),
    ];
    if (!analysis && !score && !income) advice.push('Upload a bureau or credit app to rank lenders from the actual customer file.');
    if (score !== null && score < 620) advice.push('Start with flexible/subprime lenders, keep backend light, and use more cash down before trying prime banks.');
    if (score !== null && score >= 680) advice.push('Prime lane is realistic if LTV, PTI, collateral, and funding docs stay clean.');
    if (selectedLtv !== null && selectedLtv !== undefined && selectedLtv > 115) advice.push('LTV is stretched; lower price, add cash/trade equity, shorten term, or reduce backend before submission.');
    if (dti !== null && dti > 45) advice.push('Current DTI is heavy; solve payment first and document income before sending to tighter lenders.');
    if (income !== null && selectedPayment !== null && income > 0 && selectedPayment / income > 0.16) advice.push('PTI is high; reduce payment with down, term, or cheaper collateral before expecting a clean call.');
    if (tradelines !== null && tradelines < 3) advice.push('Thin file: use lenders that tolerate limited bureau depth and send proof of residence, income, and stability up front.');
    if (derogatories !== null && derogatories > 3) advice.push('Derogatory history is visible; lead with explainable stability, verified income, and conservative advance.');
    if (utilization !== null && utilization > 70) advice.push('High revolving utilization can hurt scorecard strength; expect more proof and avoid max-advance structure.');
    return Array.from(new Set(advice.filter(Boolean))).slice(0, 9);
  }, [
    analysis,
    bankBrainPointers,
    riskFlags,
    selectedLtv,
    selectedPayment,
    structureForm.currentDti,
    structureForm.derogatories,
    structureForm.monthlyIncome,
    structureForm.score,
    structureForm.tradelines,
    structureForm.utilization,
    suggestions,
  ]);
  const creditMetricRows = [
    ['Score', structureForm.score || analysis?.metrics?.score || 'Need upload'],
    ['Monthly Income', structureForm.monthlyIncome ? money(structureForm.monthlyIncome) : money(analysis?.metrics?.monthly_income)],
    ['Current DTI', structureForm.currentDti || analysis?.metrics?.current_dti || analysis?.metrics?.dti || 'n/a'],
    ['Tradelines', structureForm.tradelines || analysis?.metrics?.tradelines || 'n/a'],
    ['Derogs', structureForm.derogatories || analysis?.metrics?.derogatories || 'n/a'],
    ['Utilization', structureForm.utilization || analysis?.metrics?.utilization || 'n/a'],
  ];
  const saleVehicleRows = [
    ['Select Asset Type', routeOneForm.saleAssetType],
    ['Intended Use', routeOneForm.intendedUse],
    ['New/Used', routeOneForm.saleCondition || (vehicleCondition(selected) === 'unknown' ? 'Select' : vehicleCondition(selected))],
    ['Stock Number', routeOneForm.stockNumber || ''],
    ['VIN', vin(selected?.vin)],
    ['Year', selectedTitleParts.year],
    ['Make', selectedTitleParts.make],
    ['Model', selectedTitleParts.model],
    ['Style', selectedTitleParts.trim],
    ['Inception Miles', miles(selected?.mileage)],
    ['Fuel Type', routeOneForm.fuelType || selected?.fuel_type || vinDecode?.fields?.engine || ''],
  ];
  const postStatusLabel = postBusy
    ? 'Posting now'
    : postResult?.post_result?.live_success
      ? 'Posted live'
      : postResult?.post_result
        ? postResult.post_result.mode === 'draft'
          ? 'Draft ready'
          : titleCaseStatus(postResult.post_result.marketplace_status || 'Needs Review')
        : selectedPosted
          ? vehicleMarketplaceLabel(selected)
          : stackStatus?.stack_readiness?.ready_for_live_facebook_posting
            ? 'Ready'
            : 'Needs setup';
  const assetModalUrl =
    assetModal && selected
      ? apiUrl(`/api/vehicles/${encodeURIComponent(vin(selected.vin))}/asset-view/${assetModal}`)
      : '';
  const deployment = stackStatus?.deployment;
  const deploymentShort =
    deployment?.deployment_id
      ? deployment.deployment_id.slice(0, 8)
      : deployment?.release || 'local';
  const showStatusLine = Boolean(statusText && !/^Inventory\s+\d+/i.test(statusText.trim()));
  const overviewPhotoIndexes = orderedPhotoIndexes
    .filter((index) => !THUMBNAIL_SKIP.includes(index))
    .slice(0, 12);
  const hiddenOverviewPhotos = Math.max(
    0,
    orderedPhotoIndexes.filter((index) => !THUMBNAIL_SKIP.includes(index)).length - overviewPhotoIndexes.length,
  );
  const batchSelectedCount = Object.values(batchSelectedVins).filter(Boolean).length;
  const facebookStatusText = batchBusy
    ? `Facebook batch ${batchProgress.current}/${batchProgress.total} | posted ${batchProgress.success} | failed ${batchProgress.failed}${liveStatus?.stage ? ` | ${liveStatus.stage}` : ''}`
    : postBusy && liveStatus?.stage
      ? `Facebook live: ${liveStatus.vin || vin(selectedVin)} | ${liveStatus.stage}`
      : '';

  const activeLead =
    leads.filter(isVisibleLead).find((lead) => lead.id === selectedLeadId)
    || leads.filter(isVisibleLead).find((lead) => vin(lead.vehicle_vin) === vin(selectedVin))
    || leads.filter(isVisibleLead)[0];
  const activeLeadThread = normalizeLeadThread(activeLead?.thread);
  const activeLeadDraft = activeLead ? leadDrafts[activeLead.id] || '' : '';
  const orderedLeads = useMemo(() => {
    const selectedVehicleVin = vin(selectedVin);
    return leads.filter(isVisibleLead).sort((left, right) => {
      const leftSelected = vin(left.vehicle_vin) === selectedVehicleVin ? 1 : 0;
      const rightSelected = vin(right.vehicle_vin) === selectedVehicleVin ? 1 : 0;
      if (leftSelected !== rightSelected) return rightSelected - leftSelected;
      return String(right.last_message_at || '').localeCompare(String(left.last_message_at || ''));
    });
  }, [leads, selectedVin]);
  const selectedLeadCount = leads.filter((lead) => isVisibleLead(lead) && vin(lead.vehicle_vin) === vin(selectedVin)).length;
  const nextAction = (() => {
    if (activeLead && /payment|month|down|finance|approval/i.test(activeLead.message || '')) {
      return {
        title: 'Send Finance Application',
        context: `${activeLead.customer_name || 'Customer'} is payment focused and should get a clear next step.`,
        primary: () => void simulateStructure(),
      };
    }
    if (selected && !selectedPosted) {
      return {
        title: 'Post This Vehicle',
        context: 'The vehicle is selected, priced, and ready for Marketplace exposure.',
        primary: () => void post('live'),
      };
    }
    if (selected && !selectedIntelligence.hasCarfax) {
      return {
        title: 'Refresh CARFAX',
        context: 'The buyer and marketing panels need the full vehicle history before outreach.',
        primary: () => openAssetModal('carfax'),
      };
    }
    return {
      title: 'Follow Up',
      context: activeLead ? 'A lead is active. Send a short helpful reply with one next step.' : 'No urgent blocker. Keep inventory moving.',
      primary: () => activeLead && void respondToLead(activeLead),
    };
  })();

  const commandSuggestions = [
    activeLead ? `Lead: ${activeLead.customer_name || 'Buyer'} -> ${activeLead.message || 'new message'}` : 'Lead: no active conversation',
    selected ? `Vehicle: ${selected.title || selected.vin} -> LTV ${selectedLtv ?? 'n/a'}%` : 'Vehicle: select inventory',
    selected && !selectedPosted ? 'Action: post this car' : 'Action: follow up with buyer',
  ];

  const leadIntent = activeLead && /payment|month|down|finance|approval/i.test(activeLead.message || '')
    ? 'Payment focused'
    : activeLead && /available|still|see|test/i.test(activeLead.message || '')
      ? 'Availability check'
      : activeLead
        ? 'General interest'
        : 'No active lead';
  const leadSyncGuidance = Array.isArray(leadSyncMeta?.guidance) ? (leadSyncMeta?.guidance as string[]) : [];
  const leadSyncWarnings = Array.isArray(leadSyncMeta?.warnings) ? (leadSyncMeta?.warnings as string[]) : [];
  const leadSyncTokenDiagnostics = Array.isArray((leadSyncMeta?.pagination as { token_diagnostics?: unknown[] } | undefined)?.token_diagnostics)
    ? (((leadSyncMeta?.pagination as { token_diagnostics?: unknown[] }).token_diagnostics) as Array<Record<string, unknown>>)
    : [];

  return (
    <main className="xos-root">
      <header className="xos-command">
        <div className="xos-brand">
          <strong>Xconsole</strong>
          <span>{UI_BUILD_LABEL}</span>
        </div>
        <label className="xos-spotlight">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search anything... or tell the system what to do"
          />
          <span>Search</span>
          <span>Command</span>
          <span>Voice</span>
        </label>
        <div className="xos-system">
          <button className="tv2-btn" type="button" onClick={() => void refresh()} disabled={refreshBusy}>
            {refreshBusy ? 'Refreshing' : 'Refresh'}
          </button>
          <button className="tv2-btn" type="button" onClick={() => setToolsOpen((value) => !value)}>
            Admin
          </button>
        </div>
      </header>

      {showStatusLine || facebookStatusText ? (
        <section className="xos-status">
          <strong>{facebookStatusText || 'System status'}</strong>
          <span>{readableFacebookStatus(statusText || 'Ready')}</span>
        </section>
      ) : null}

      {toolsOpen ? (
        <section className="xos-admin-overlay" onClick={() => setToolsOpen(false)}>
          <article className="xos-admin-panel" onClick={(event) => event.stopPropagation()}>
            <header className="xos-admin-head">
              <div>
                <h2>Admin Console</h2>
                <p>Users, Messenger sync diagnostics, and finance controls live here.</p>
              </div>
              <button className="tv2-btn" type="button" onClick={() => setToolsOpen(false)}>
                Close
              </button>
            </header>

            <div className="xos-admin-grid">
              <article className="xos-admin-card">
                <div className="tv2-card-head">
                  <div>
                    <h3>Access Control</h3>
                    <p>Manage operator permissions without leaving the dashboard.</p>
                  </div>
                  <span className={`tv2-badge${can('users.manage') ? ' ok' : ' warn'}`}>
                    {can('users.manage') ? 'Admin' : 'Limited'}
                  </span>
                </div>
                {can('users.manage') ? (
                  <>
                    <div className="tv2-user-list">
                      {users.slice(0, 6).map((user) => (
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
                          key={`xos-new-${permission.id}`}
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

              <article className="xos-admin-card">
                <div className="tv2-card-head">
                  <div>
                    <h3>Messenger Sync</h3>
                    <p>Live inbox pull, token status, and conversation coverage.</p>
                  </div>
                  <button className="tv2-btn" type="button" onClick={() => void syncFacebookLeads()} disabled={leadBusy || !can('facebook.leads')}>
                    {leadBusy ? 'Working...' : 'Sync FB'}
                  </button>
                </div>
                <div className="xos-admin-stack">
                  <div className="xos-admin-stat-row">
                    <strong>Loaded chats</strong>
                    <span>{leads.length}</span>
                  </div>
                  {(leadSyncGuidance.length ? leadSyncGuidance : ['Run Sync FB to load the latest Messenger diagnostics.']).map((item, index) => (
                    <p className="xos-admin-note" key={`guide-${index}`}>{item}</p>
                  ))}
                  {leadSyncWarnings.map((item, index) => (
                    <p className="xos-admin-warning" key={`warn-${index}`}>{item}</p>
                  ))}
                  {leadSyncTokenDiagnostics.slice(0, 4).map((item, index) => {
                    const scope = String(item.scope || 'page');
                    const conversationMeta = (item.conversations as Record<string, unknown> | undefined) || {};
                    return (
                      <div className="xos-admin-token" key={`token-${scope}-${index}`}>
                        <strong>{scope === 'personal' ? 'Personal Messenger token' : 'Page Messenger token'}</strong>
                        <span>{String(conversationMeta.mode || 'unknown')} | chats {String(conversationMeta.count ?? 0)}</span>
                      </div>
                    );
                  })}
                  <div className="tv2-lead-list">
                    {leads.slice(0, 8).map((lead) => (
                      <article className="tv2-lead-item" key={`xos-${lead.id}`}>
                        <div>
                          <strong>{lead.customer_name || 'Unknown Lead'}</strong>
                          <span>{lead.channel || 'facebook'} | {lead.vehicle_vin || 'no VIN'} | {lead.status || 'new'}</span>
                          <p>{lead.message || 'No message text captured.'}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </article>

              <article className="xos-admin-card">
                <div className="tv2-card-head">
                  <div>
                    <h3>Bank Brain Admin</h3>
                    <p>Collateral-aware lender guidance and finance workbench access.</p>
                  </div>
                  <button className="tv2-btn" type="button" onClick={() => selectedVin && void loadVehicleIntel(selectedVin)} disabled={intelBusy || !selectedVin}>
                    {intelBusy ? 'Reading...' : 'Reload VIN'}
                  </button>
                </div>
                <div className="tv2-intel-grid">
                  <div>
                    <span>Decoded</span>
                    <strong>{[vinDecode?.fields?.year, vinDecode?.fields?.make, vinDecode?.fields?.model].filter(Boolean).join(' ') || selected?.title || 'n/a'}</strong>
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
                    <strong>{selectedLtv ?? 'n/a'}%</strong>
                  </div>
                  <div>
                    <span>RouteOne Docs</span>
                    <strong>{routeoneDocs?.doc_count ?? 'n/a'}</strong>
                  </div>
                </div>
                <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => { setTab('finance'); setToolsOpen(false); }} disabled={!canViewBankBrain}>
                  Open Finance Workbench
                </button>
              </article>
            </div>
          </article>
        </section>
      ) : null}

      <section className={`xos-grid${tab === 'finance' ? ' is-finance-mode' : ''}`}>
        <aside className="xos-panel xos-inventory">
          <div className="xos-panel-head">
            <div>
              <h2>Inventory</h2>
              <p>{filtered.length} active / {inventory.length} website</p>
            </div>
            <strong>{inventoryStats.total}</strong>
          </div>
          <input
            className="xos-local-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="VIN / model"
          />
          <div className="xos-chip-row">
            {([
              ['all', 'All'],
              ['needs-assets', 'Needs Attention'],
              ['ready', 'Ready'],
              ['posted', 'Live'],
              ['unposted', 'Hot'],
            ] as Array<[InventoryFilter, string]>).map(([id, label]) => (
              <button
                key={id}
                className={`xos-chip${inventoryFilter === id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setInventoryFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <select className="xos-select" value={inventorySort} onChange={(event) => setInventorySort(event.target.value as InventorySort)}>
            <option value="ltv-low">LTV low to high</option>
            <option value="price-low">Price low to high</option>
            <option value="price-high">Price high to low</option>
            <option value="title">Title A-Z</option>
          </select>
          <div className="xos-price-filter">
            <div className="xos-price-filter-head">
              <strong>Price Range</strong>
              <span>{priceFilterDirty ? `${money(priceFloor ?? inventoryPriceBounds.min)} - ${money(priceCeiling ?? inventoryPriceBounds.max)}` : 'All prices'}</span>
            </div>
            <label className="xos-price-filter-row">
              <span>Min</span>
              <input
                type="range"
                min={inventoryPriceBounds.min}
                max={inventoryPriceBounds.max}
                step={inventoryPriceBounds.step}
                value={priceFloor ?? inventoryPriceBounds.min}
                onChange={(event) => {
                  setPriceFilterDirty(true);
                  const next = Number(event.target.value);
                  setPriceFloor(next);
                  setPriceCeiling((current) => current === null ? inventoryPriceBounds.max : Math.max(current, next));
                }}
              />
            </label>
            <label className="xos-price-filter-row">
              <span>Max</span>
              <input
                type="range"
                min={inventoryPriceBounds.min}
                max={inventoryPriceBounds.max}
                step={inventoryPriceBounds.step}
                value={priceCeiling ?? inventoryPriceBounds.max}
                onChange={(event) => {
                  setPriceFilterDirty(true);
                  const next = Number(event.target.value);
                  setPriceCeiling(next);
                  setPriceFloor((current) => current === null ? inventoryPriceBounds.min : Math.min(current, next));
                }}
              />
            </label>
            <button
              type="button"
              className="xos-secondary-action"
              onClick={() => {
                setPriceFilterDirty(false);
                setPriceFloor(inventoryPriceBounds.min);
                setPriceCeiling(inventoryPriceBounds.max);
              }}
            >
              Reset Price
            </button>
          </div>
          <div className="xos-batch">
            <span>{batchSelectedCount ? `${batchSelectedCount} selected` : 'Batch ready'}</span>
            <button type="button" onClick={() => selectVisibleUnpostedForBatch(5)} disabled={batchBusy || !canPostFacebook}>Select 5</button>
            <button type="button" onClick={() => void postSelectedBatch()} disabled={batchBusy || postBusy || !batchSelectedCount || !canPostFacebook}>
              {batchBusy ? `${batchProgress.current}/${batchProgress.total}` : 'Post'}
            </button>
          </div>
          <div className="xos-inventory-list">
            {filtered.map((vehicle, index) => {
              const clean = vin(vehicle.vin);
              const photos = resolveVehiclePhotos(vehicle, assetsByVin[clean]);
              const rowPhoto = photos[0] || null;
              const active = clean === vin(selectedVin);
              const rowPosted = isVehicleMarketplaceLive(vehicle);
              const aged = index > 30;
              const rowAssets = assetsByVin[clean];
              const rowFacts = rowAssets?.carfax_summary?.facts || {};
              const ownerText = String(rowFacts.owner_count || '').trim();
              const accidentText = String(rowFacts.accident_damage || rowFacts.accident_count || '').trim();
              return (
                <article
                  key={`${clean}-${index}`}
                  className={`xos-vehicle-card${active ? ' is-active' : ''}`}
                  onClick={() => activateVehicle(clean)}
                >
                  <div className="xos-thumb">{rowPhoto ? <img src={rowPhoto} alt={vehicle.title || clean} loading="lazy" /> : <span>No Photo</span>}</div>
                  <div className="xos-card-main">
                    <h3>{vehicle.title || clean}</h3>
                    <p>{money(vehicle.price)} - {miles(vehicle.mileage)}</p>
                    <p className="xos-card-summary">
                      {downPaymentMoney(vehicle)} down
                      {vehicle.jd_power_ltv ? ` - LTV ${vehicle.jd_power_ltv}%` : ''}
                      {ownerText ? ` - ${ownerText}` : ''}
                      {accidentText ? ` - ${accidentText}` : ''}
                    </p>
                    <div className="xos-pills">
                      {photos.length < 2 ? <span>Needs Photos</span> : null}
                      {selectedLeadCount && active ? <span>Hot Lead</span> : null}
                      {aged ? <span>Aged 30d</span> : null}
                      {rowPosted ? <span>Live</span> : null}
                      {!rowPosted && vehicle.marketplace_status ? <span>{vehicleMarketplaceLabel(vehicle)}</span> : null}
                    </div>
                    {canPostFacebook ? (
                      <button
                        className="xos-card-post"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void post('live', clean);
                        }}
                        disabled={postBusy}
                      >
                        {postBusy && active ? 'Posting' : 'Post'}
                      </button>
                    ) : null}
                  </div>
                  {canPostFacebook ? (
                    <label className="xos-card-check" onClick={(event) => event.stopPropagation()}>
                      <input checked={Boolean(batchSelectedVins[clean])} type="checkbox" onChange={() => toggleBatchVin(clean)} />
                    </label>
                  ) : null}
                </article>
              );
            })}
          </div>
        </aside>

        <section className="xos-panel xos-vehicle">
          <div className="xos-vehicle-head">
            <div>
              <h1>{selected?.title || 'Select a vehicle'}</h1>
              <p>{selected ? `${vin(selected.vin)} - ${miles(selected.mileage)} - ${money(selected.price)}` : 'Inventory loads the entire system.'}</p>
            </div>
            <div className="xos-icon-actions">
              <button type="button">Favorite</button>
              <button type="button" onClick={() => selected && void loadAssets(vin(selected.vin), true)}>Refresh Data</button>
              <button type="button" onClick={() => void post('draft')}>Share</button>
            </div>
          </div>
          <div className="xos-carousel">
            {selectedPhotos[overviewPhotoIndexes[0] || 0] ? (
              <img src={selectedPhotos[overviewPhotoIndexes[0] || 0]} alt={selected?.title || 'vehicle'} />
            ) : (
              <div>No photos loaded</div>
            )}
            <div className="xos-photo-overlay">
              <span>{selectedPhotos.length} photos</span>
              <button type="button" onClick={() => setTab('assets')}>View All</button>
              <button type="button" onClick={() => setTab('marketing')}>Add Photos</button>
            </div>
          </div>
          <nav className="xos-tabs">
            {(['overview', 'assets', 'marketing', 'intelligence', 'finance'] as const).map((item) => (
              <button className={tab === item ? 'is-active' : ''} type="button" key={item} onClick={() => setTab(item)}>
                {item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </nav>

          {tab === 'overview' ? (
            <div className="xos-scroll">
              <section className="xos-spec-grid">
                <div><span>Engine</span><strong>{selected?.engine || 'n/a'}</strong></div>
                <div><span>Drive</span><strong>{selected?.drivetrain || 'n/a'}</strong></div>
                <div><span>Transmission</span><strong>{selected?.transmission || 'n/a'}</strong></div>
                <div><span>MPG</span><strong>{(selected as Record<string, unknown> | undefined)?.mpg as string || 'n/a'}</strong></div>
              </section>
              <article className="xos-ai-block"><h3>Ideal Buyer</h3><p>{selectedBuyerText}</p><ul><li>Matches payment-sensitive shoppers when structured correctly.</li><li>Use CARFAX and service history to build trust fast.</li></ul></article>
              <article className="xos-ai-block"><h3>Why This Car Sells</h3><ul>{(selectedMarketingSummary.length ? selectedMarketingSummary : ['Strong visual package', 'Relevant equipment', 'Financeable inventory']).slice(0, 5).map((item, idx) => <li key={idx}>{item}</li>)}</ul></article>
              <article className="xos-ai-block"><h3>Objection Handling</h3><p>Customer worried about mileage: highlight service history, inspection, and available financing path.</p></article>
              <article className="xos-ai-block"><h3>CARFAX Summary</h3><div className="xos-spec-grid">{carfaxFactRows.slice(0, 4).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><button type="button" onClick={() => openAssetModal('carfax')}>View Full Report</button></article>
              <article className="xos-ai-block"><h3>Sticker Highlights</h3><ul>{(selectedStickerHighlights.length ? selectedStickerHighlights : ['Refresh sticker to populate equipment.']).slice(0, 6).map((item, idx) => <li key={idx}>{item}</li>)}</ul></article>
            </div>
          ) : null}

          {tab === 'assets' ? (
            <div className="xos-photo-grid">
              {selectedPhotos.map((photo, index) => <figure key={photo}><img src={photo} alt={`${selected?.title} ${index + 1}`} /><figcaption>Image {index + 1}</figcaption></figure>)}
            </div>
          ) : null}

          {tab === 'marketing' ? (
            <div className="xos-scroll">
              <article className="xos-ai-block"><h3>AI Marketing Generator</h3><textarea value={enhancedCaption} onChange={(event) => setCaption(event.target.value)} /><button type="button" onClick={() => void post('live')} disabled={postBusy || !canPostFacebook}>{postBusy ? 'Posting' : 'Post This Car'}</button></article>
              <article className="xos-ai-block"><h3>Photo Rules</h3><p>{selectedPhotos.length > 10 ? 'Image 1 and Image 3 are skipped by default; choose real exterior/interior angles first.' : 'Fewer than 10 photos: all photos are selected.'}</p></article>
            </div>
          ) : null}

          {tab === 'intelligence' ? (
            <div className="xos-scroll">
              <article className="xos-health">
                <div className="xos-ring" style={{ ['--score' as string]: selectedIntelligence.xScore }}>{selectedIntelligence.xScore}</div>
                <div><h3>Vehicle Health Score</h3><p>{selectedIntelligence.label}</p></div>
              </article>
              <section className="xos-spec-grid">
                <div><span>Photos</span><strong>{selectedIntelligence.photosCount}</strong></div>
                <div><span>Pricing</span><strong>{selectedLtv ?? 'n/a'}% LTV</strong></div>
                <div><span>Description</span><strong>{enhancedCaption ? 'Ready' : 'Missing'}</strong></div>
                <div><span>Demand</span><strong>{selectedLeadCount ? 'Hot' : 'Normal'}</strong></div>
              </section>
              <article className="xos-ai-block"><h3>Deal Timeline</h3><ul>{selectedIntelligence.nextSteps.map((step, idx) => <li key={idx}>{step}</li>)}</ul></article>
            </div>
          ) : null}

          {tab === 'finance' ? (
            <div className="xos-scroll xos-routeone-workbench">
              <section className="xos-routeone-split">
                <article className="xos-routeone-card">
                  <header className="xos-routeone-bar">Applicant Information</header>
                  <div className="xos-routeone-form">
                    <label><span>Title</span><input value={routeOneForm.title} onChange={(event) => updateRouteOneField('title', event.target.value)} /></label>
                    <label><span>* Last</span><input value={routeOneForm.lastName} onChange={(event) => updateRouteOneField('lastName', event.target.value)} /></label>
                    <label><span>* First</span><input value={routeOneForm.firstName} onChange={(event) => updateRouteOneField('firstName', event.target.value)} /></label>
                    <label><span>Middle</span><input value={routeOneForm.middleName} onChange={(event) => updateRouteOneField('middleName', event.target.value)} /></label>
                    <label><span>Suffix</span><input value={routeOneForm.suffix} onChange={(event) => updateRouteOneField('suffix', event.target.value)} /></label>
                    <label className="xos-routeone-date"><span>DOB (MM/DD/YYYY)</span><div><input value={routeOneForm.dobMonth} onChange={(event) => updateRouteOneField('dobMonth', event.target.value)} /><input value={routeOneForm.dobDay} onChange={(event) => updateRouteOneField('dobDay', event.target.value)} /><input value={routeOneForm.dobYear} onChange={(event) => updateRouteOneField('dobYear', event.target.value)} /></div></label>
                    <label><span>* SSN</span><input value={routeOneForm.ssn} onChange={(event) => updateRouteOneField('ssn', event.target.value)} /></label>
                    <label><span>Home Phone No.</span><input value={routeOneForm.homePhone} onChange={(event) => updateRouteOneField('homePhone', event.target.value)} /></label>
                    <label><span>Cellular Phone No.</span><input value={routeOneForm.cellularPhone} onChange={(event) => updateRouteOneField('cellularPhone', event.target.value)} /></label>
                    <label><span>Preferred E-Mail</span><input value={routeOneForm.email} onChange={(event) => updateRouteOneField('email', event.target.value)} /></label>
                    <label className="xos-routeone-wide"><span>Address</span><input value={routeOneForm.address} onChange={(event) => updateRouteOneField('address', event.target.value)} /></label>
                    <label><span>* ZIP Code</span><input value={routeOneForm.zip} onChange={(event) => updateRouteOneField('zip', event.target.value)} /></label>
                    <label><span>City / State</span><input value={`${routeOneForm.city}${routeOneForm.city && routeOneForm.state ? ', ' : ''}${routeOneForm.state}`} onChange={(event) => {
                      const [city, state] = event.target.value.split(',').map((part) => part.trim());
                      updateRouteOneField('city', city || '');
                      updateRouteOneField('state', state || routeOneForm.state);
                    }} /></label>
                    <label><span>County</span><input value={routeOneForm.county} onChange={(event) => updateRouteOneField('county', event.target.value)} /></label>
                    <label className="xos-routeone-date"><span>Time at Address</span><div><input value={routeOneForm.timeAtAddressYears} placeholder={analysis?.metrics?.years_at_address ? String(analysis.metrics.years_at_address) : 'Yrs'} onChange={(event) => updateRouteOneField('timeAtAddressYears', event.target.value)} /><input value={routeOneForm.timeAtAddressMonths} placeholder="Mon" onChange={(event) => updateRouteOneField('timeAtAddressMonths', event.target.value)} /></div></label>
                    <label><span>Res. Type</span><input value={routeOneForm.residenceType} onChange={(event) => updateRouteOneField('residenceType', event.target.value)} /></label>
                    <label><span>Rent/Mortgage</span><input value={routeOneForm.rentMortgage} onChange={(event) => updateRouteOneField('rentMortgage', event.target.value)} /></label>
                    <label><span>Empl. Type</span><input value={routeOneForm.employmentType} onChange={(event) => updateRouteOneField('employmentType', event.target.value)} /></label>
                    <label><span>Empl. Status</span><input value={routeOneForm.employmentStatus} onChange={(event) => updateRouteOneField('employmentStatus', event.target.value)} /></label>
                    <label><span>Empl. Title</span><input value={routeOneForm.employmentTitle} onChange={(event) => updateRouteOneField('employmentTitle', event.target.value)} /></label>
                    <label><span>Employer</span><input value={routeOneForm.employer} onChange={(event) => updateRouteOneField('employer', event.target.value)} /></label>
                    <label><span>Phone No.</span><input value={routeOneForm.employerPhone} onChange={(event) => updateRouteOneField('employerPhone', event.target.value)} /></label>
                    <label className="xos-routeone-date"><span>Time at Job</span><div><input value={routeOneForm.timeAtJobYears} placeholder={analysis?.metrics?.years_at_job ? String(analysis.metrics.years_at_job) : 'Yrs'} onChange={(event) => updateRouteOneField('timeAtJobYears', event.target.value)} /><input value={routeOneForm.timeAtJobMonths} placeholder="Mon" onChange={(event) => updateRouteOneField('timeAtJobMonths', event.target.value)} /></div></label>
                    <label><span>Gross Income</span><input value={structureForm.monthlyIncome} onChange={(event) => setStructureForm((prev) => ({ ...prev, monthlyIncome: event.target.value }))} /></label>
                    <label><span>Income Interval</span><input value={routeOneForm.incomeInterval} onChange={(event) => updateRouteOneField('incomeInterval', event.target.value)} /></label>
                  </div>
                </article>

                <article className="xos-routeone-card">
                  <header className="xos-routeone-bar">Co-Applicant Information</header>
                  <div className="xos-routeone-empty">
                    <strong>Visible when needed</strong>
                    <p>Keep this side clean unless the file needs a co-buyer. Use the credit upload and lender ranking to decide whether a stronger co-applicant is actually needed.</p>
                  </div>
                  <div className="xos-routeone-metrics">
                    {creditMetricRows.map(([label, value]) => (
                      <div key={label}><span>{label}</span><strong>{value}</strong></div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="xos-routeone-split">
                <article className="xos-routeone-card">
                  <header className="xos-routeone-bar">Sale Vehicle</header>
                  <div className="xos-routeone-form xos-routeone-form-tight">
                    {saleVehicleRows.map(([label, value]) => (
                      <label key={label}><span>{label}</span><input value={String(value || '')} readOnly /></label>
                    ))}
                  </div>
                </article>
                <article className="xos-routeone-card">
                  <header className="xos-routeone-bar">Trade Vehicle</header>
                  <div className="xos-routeone-form xos-routeone-form-tight">
                    <label><span>Year</span><input value={routeOneForm.tradeYear} onChange={(event) => updateRouteOneField('tradeYear', event.target.value)} /></label>
                    <label><span>Make</span><input value={routeOneForm.tradeMake} onChange={(event) => updateRouteOneField('tradeMake', event.target.value)} /></label>
                    <label><span>Model</span><input value={routeOneForm.tradeModel} onChange={(event) => updateRouteOneField('tradeModel', event.target.value)} /></label>
                    <label><span>Style</span><input value={routeOneForm.tradeStyle} onChange={(event) => updateRouteOneField('tradeStyle', event.target.value)} /></label>
                    <label className="xos-routeone-wide"><span>Lien Holder Name</span><input value={routeOneForm.lienHolder} onChange={(event) => updateRouteOneField('lienHolder', event.target.value)} /></label>
                    <label><span>Trade Allowance</span><input value={structureForm.trade} onChange={(event) => setStructureForm((prev) => ({ ...prev, trade: event.target.value }))} /></label>
                    <label><span>Trade Owed</span><input value={routeOneForm.tradeOwed} onChange={(event) => updateRouteOneField('tradeOwed', event.target.value)} /></label>
                  </div>
                </article>
              </section>

              <article className="xos-routeone-card">
                <header className="xos-routeone-bar">Contract Information</header>
                <div className="xos-contract-grid">
                  <div className="xos-routeone-form xos-routeone-form-tight">
                    <label><span>Cash Price</span><input value={structureForm.salePrice} onChange={(event) => setStructureForm((prev) => ({ ...prev, salePrice: event.target.value, taxes: String(Math.round((optionalNumber(event.target.value) ?? 0) * 0.06)) }))} /></label>
                    <label><span>Taxes</span><input value={structureForm.taxes} onChange={(event) => setStructureForm((prev) => ({ ...prev, taxes: event.target.value }))} /></label>
                    <label><span>Doc Fees</span><input value={structureForm.fees} onChange={(event) => setStructureForm((prev) => ({ ...prev, fees: event.target.value }))} /></label>
                    <label><span>Title/Lic/Reg/Other Fees</span><input value={routeOneForm.titleRegFees} onChange={(event) => updateRouteOneField('titleRegFees', event.target.value)} /></label>
                    <label><span>Cash Down</span><input value={structureForm.down} onChange={(event) => setStructureForm((prev) => ({ ...prev, down: event.target.value }))} /></label>
                    <label><span>Rebate</span><input value={routeOneForm.rebate} onChange={(event) => updateRouteOneField('rebate', event.target.value)} /></label>
                    <label><span>GAP</span><input value={routeOneForm.gap} onChange={(event) => updateRouteOneField('gap', event.target.value)} /></label>
                    <label><span>Service Contract</span><input value={structureForm.backend} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend: event.target.value }))} /></label>
                    <label><span>Credit Life</span><input value={routeOneForm.creditLife} onChange={(event) => updateRouteOneField('creditLife', event.target.value)} /></label>
                    <label><span>Disability</span><input value={routeOneForm.disability} onChange={(event) => updateRouteOneField('disability', event.target.value)} /></label>
                    <label><span>Other Ins/Svc</span><input value={routeOneForm.otherInsSvc} onChange={(event) => updateRouteOneField('otherInsSvc', event.target.value)} /></label>
                  </div>
                  <div className="xos-routeone-totals">
                    <div><span>Net Trade</span><strong>{money(routeOneNetTrade)}</strong></div>
                    <div><span>Total Down</span><strong>{money(routeOneTotalDown)}</strong></div>
                    <div><span>Total Cash Selling Price</span><strong>{money(routeOneTotalCashSellingPrice)}</strong></div>
                    <div><span>Loan To Value (LTV)</span><strong>{selectedLtv ?? 'n/a'}%</strong></div>
                    <div><span>Applicant Payment To Income (PTI)</span><strong>{structure?.structure?.pti ?? 'n/a'}%</strong></div>
                    <div><span>Financed Amount</span><strong>{money(routeOneFinancedAmount)}</strong></div>
                  </div>
                  <div className="xos-routeone-form xos-routeone-form-tight">
                    <label><span>Term</span><input value={structureForm.term} onChange={(event) => setStructureForm((prev) => ({ ...prev, term: event.target.value }))} /></label>
                    <label><span>Cust. Rate</span><input value={structureForm.apr} onChange={(event) => setStructureForm((prev) => ({ ...prev, apr: event.target.value }))} /></label>
                    <label><span>Total Mo. Pmt. (Est)</span><input value={selectedPayment !== null ? String(Math.round(selectedPayment)) : ''} readOnly /></label>
                    <label><span>Wholesale/Invoice</span><input value={routeOneForm.wholesaleInvoice || String(selectedBookValue || '')} onChange={(event) => updateRouteOneField('wholesaleInvoice', event.target.value)} /></label>
                    <label><span>Retail</span><input value={routeOneForm.retail || String(selected?.msrp || '')} onChange={(event) => updateRouteOneField('retail', event.target.value)} /></label>
                    <label><span>MSRP</span><input value={routeOneForm.msrp || String(selected?.msrp || '')} onChange={(event) => updateRouteOneField('msrp', event.target.value)} /></label>
                    <button className="xos-primary-action" type="button" onClick={() => void simulateStructure()} disabled={structureBusy}>{structureBusy ? 'Calculating...' : 'Calculate / Rank Banks'}</button>
                  </div>
                </div>
              </article>

              <article className="xos-routeone-card">
                <header className="xos-routeone-bar">Comments / Credit Bureau</header>
                <div className="xos-routeone-comments">
                  <textarea value={routeOneForm.comments} onChange={(event) => updateRouteOneField('comments', event.target.value)} placeholder="Structure notes, stips attached, proof available, customer callback notes..." />
                  <label><span>Credit Bureau</span><input value={routeOneForm.creditBureau} onChange={(event) => updateRouteOneField('creditBureau', event.target.value)} /></label>
                  <label><span>Credit Score</span><input value={structureForm.score} onChange={(event) => setStructureForm((prev) => ({ ...prev, score: event.target.value }))} /></label>
                </div>
              </article>
            </div>
          ) : null}
        </section>

        <aside className="xos-panel xos-finance xos-finance-brain">
          <div className="xos-panel-head">
            <div><h2>Finance Intelligence</h2><p>Credit upload, bank fit, and deal structure stay visible.</p></div>
            <strong>{approvalProbability}</strong>
          </div>

          <article className="xos-finance-main">
            <span>Primary Lender</span><strong>{vehicleBestBank?.bank_name || bestBank?.bank_name || 'Run credit'}</strong>
            <span>Backup</span><strong>{vehicleBackupBank?.bank_name || backupBank?.bank_name || 'Run structure'}</strong>
            <span>Payment</span><strong>{money(selectedPayment)}</strong>
          </article>
          <div className="xos-approval"><span style={{ width: approvalProbability === 'n/a' ? '12%' : approvalProbability }} /></div>

          <article className="xos-ai-block xos-upload-card xos-credit-upload-always">
            <h3>Credit Report Upload</h3>
            <p>Upload the bureau, credit app, PDF, screenshot, Excel, CSV, or doc. Xconsole extracts score, income, DTI, tradelines, derogatories, then ranks lenders.</p>
            <input type="file" accept=".txt,.json,.pdf,.csv,.tsv,.xls,.xlsx,.xlsm,.docx,.png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(event) => setAnalysisFile(event.target.files?.[0] || null)} />
            <div className="xos-finance-actions">
              <button className="xos-primary-action" type="button" onClick={() => void analyzeUpload()} disabled={uploadBusy || !analysisFile}>
                {uploadBusy ? 'Reading File...' : 'Read + Recommend Banks'}
              </button>
              <button className="xos-secondary-action" type="button" onClick={() => {
                setTab('finance');
                void simulateStructure();
              }} disabled={structureBusy}>
                {structureBusy ? 'Structuring...' : 'Run Structure'}
              </button>
            </div>
            <textarea value={analysisText} onChange={(event) => setAnalysisText(event.target.value)} placeholder="Or paste credit report / buyer notes here..." />
            <button className="xos-secondary-action" type="button" onClick={() => void analyzeTextInput()} disabled={analyzeBusy || !analysisText.trim()}>
              {analyzeBusy ? 'Analyzing...' : 'Analyze Text'}
            </button>
          </article>

          <article className="xos-ai-block">
            <h3>Credit File Signals</h3>
            <div className="xos-spec-grid">
              {creditMetricRows.map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}{label === 'Current DTI' && value !== 'n/a' ? '%' : ''}</strong></div>
              ))}
            </div>
          </article>

          <article className="xos-ai-block">
            <h3>Best Banks Right Now</h3>
            <div className="xos-lender-list xos-lender-list-visible">
              {visibleBankRecommendations.map((bank, index) => (
                <div className="xos-lender-row" key={`${bank.bank_code || bank.bank_name}-${index}`}>
                  <strong>{index + 1}. {bank.bank_name || 'Lender'}</strong>
                  <span>{bank.confidence ? `${bank.confidence.toFixed(1)}%` : 'Needs file'}</span>
                  <p>{bank.reasons?.slice(0, 3).join(' | ') || 'Upload a credit report and calculate the structure to score this bank.'}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="xos-ai-block">
            <h3>Approval Levers</h3>
            <ul>{(creditReportAdvice.length ? creditReportAdvice : ['Upload the credit report, verify income, and run structure to get lender-specific guidance.']).map((item, idx) => <li key={idx}>{item}</li>)}</ul>
          </article>

          <article className="xos-ai-block">
            <h3>RouteOne Numbers</h3>
            <div className="xos-spec-grid">
              <div><span>LTV</span><strong>{selectedLtv ?? 'n/a'}%</strong></div>
              <div><span>PTI</span><strong>{structure?.structure?.pti ?? 'n/a'}%</strong></div>
              <div><span>DTI</span><strong>{structure?.structure?.dti ?? 'n/a'}%</strong></div>
              <div><span>Financed</span><strong>{money(routeOneFinancedAmount)}</strong></div>
            </div>
          </article>

          <button
            className="xos-primary-action"
            type="button"
            onClick={() => {
              setTab('finance');
              void simulateStructure();
            }}
          >
            Open RouteOne Deal Structure
          </button>
        </aside>

        <aside className="xos-panel xos-leads">
          <div className="xos-panel-head">
            <div><h2>{activeLead?.customer_name || 'Lead Inbox'}</h2><p>{leadIntent}</p></div>
            <button type="button" onClick={() => void syncFacebookLeads()} disabled={leadBusy || !can('facebook.leads')}>Sync FB</button>
          </div>
          <div className="xos-lead-shell">
            <div className="xos-lead-list">
              {orderedLeads.map((lead) => {
                const linked = vin(lead.vehicle_vin) === vin(selectedVin);
                const active = activeLead?.id === lead.id;
                return (
                  <button
                    className={`xos-lead-card${linked ? ' is-linked' : ''}${active ? ' is-active' : ''}`}
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                    <strong>{lead.customer_name || 'Buyer'}</strong>
                    <p>{leadPreviewText(lead)}</p>
                    <span>{linked ? 'Linked to selected vehicle' : lead.vehicle_vin ? `VIN ${vin(lead.vehicle_vin)}` : 'General conversation'} | {nowText(lead.last_message_at)}</span>
                  </button>
                );
              })}
              {!orderedLeads.length ? <p className="xos-empty">No captured leads yet.</p> : null}
            </div>

            <div className="xos-lead-conversation">
              <div className="xos-lead-conversation-head">
                <div>
                  <strong>{activeLead?.customer_name || 'No conversation selected'}</strong>
                  <span>{activeLead?.channel || 'messenger'}{activeLead?.vehicle_vin ? ` | VIN ${vin(activeLead.vehicle_vin)}` : ' | general interest'}</span>
                </div>
              </div>

              <div className="xos-chat">
                {activeLeadThread.length ? (
                  <div className="xos-thread">
                    {activeLeadThread.map((item, index) => (
                      <article className={`xos-message ${item.direction === 'outbound' ? 'outbound' : 'inbound'}`} key={`${activeLead?.id || 'lead'}-thread-${index}`}>
                        <strong>{item.direction === 'outbound' ? 'You' : (activeLead?.customer_name || 'Buyer')}</strong>
                        {item.text ? <p>{renderLinkedMessage(item.text)}</p> : null}
                        {Array.isArray(item.attachments) && item.attachments.length ? (
                          <div className="xos-message-attachments">
                            {item.attachments.map((attachment, attachmentIndex) => (
                              <div className="xos-attachment" key={`${attachment.url || attachment.title || attachmentIndex}`}>
                                {attachment.url && attachment.type === 'image' ? <img src={attachment.url} alt={attachment.title || 'attachment'} loading="lazy" /> : null}
                                {attachment.url ? <a href={attachment.url} target="_blank" rel="noreferrer">{attachment.title || attachment.url}</a> : <span>{attachment.title || attachment.type || 'attachment'}</span>}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <span>{item.direction === 'outbound' ? 'sent' : (item.delivery_status || 'received')} | {nowText(item.created_at)}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="xos-empty">Choose a conversation on the left to start chatting here.</p>
                )}
              </div>

              <div className="xos-suggest">
                <button type="button" onClick={() => activeLead && fillLeadDraft(`I can help make the payment work on ${selected?.title || 'this vehicle'}. Want me to send the quick finance app?`)}>Close Deal</button>
                <button type="button" onClick={() => activeLead && fillLeadDraft('Are you looking for the lowest monthly payment, lowest down payment, or fastest approval?')}>Ask Question</button>
                <button type="button" onClick={() => activeLead && fillLeadDraft(`I can send the CARFAX, photos, and finance application for ${selected?.title || 'this vehicle'} now.`)}>Send Info</button>
              </div>

              <div className="xos-quick-actions">
                <button type="button" onClick={() => void sendLeadAsset('carfax')} disabled={!activeLead}>Send Carfax</button>
                <button type="button" onClick={() => void sendLeadAsset('sticker')} disabled={!activeLead}>Send Sticker</button>
                <button type="button" onClick={() => void sendLeadAsset('photos')} disabled={!activeLead}>Send Photos</button>
                <button type="button" onClick={() => void sendLeadAsset('finance')} disabled={!activeLead}>Finance App</button>
              </div>

              <div className="xos-composer">
                <textarea
                  className="xos-reply"
                  value={activeLeadDraft}
                  onChange={(event) => activeLead && setLeadDrafts((prev) => ({ ...prev, [activeLead.id]: event.target.value }))}
                  placeholder="Type a reply, paste a link, or attach a photo/file..."
                />
                <div className="xos-composer-actions">
                  <label className="xos-attach-button">
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      onChange={(event) => setLeadAttachmentFile(event.target.files?.[0] || null)}
                    />
                    <span>{leadAttachmentFile ? `Attached: ${leadAttachmentFile.name}` : 'Attach Photo or File'}</span>
                  </label>
                  <button className="xos-primary-action" type="button" onClick={() => activeLead && void respondToLead(activeLead)} disabled={!activeLead || leadBusy}>
                    {leadBusy ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>

              <article className="xos-customer-memory">
                <h3>Customer Insight</h3>
                <p>Intent: {leadIntent}</p>
                <p>Close Probability: {activeLead ? '72%' : 'n/a'}</p>
                <p>Urgency: {activeLead ? 'High' : 'Low'}</p>
              </article>
            </div>
          </div>
        </aside>
      </section>

      <aside className="xos-next-action">
        <h2>What should you do next</h2>
        <button className="xos-primary-action" type="button" onClick={nextAction.primary}>{nextAction.title}</button>
        <p>{nextAction.context}</p>
        <button type="button" onClick={() => openAssetModal('carfax')}>Send Carfax</button>
        <button type="button" onClick={() => activeLead && void respondToLead(activeLead)}>Follow up</button>
        <button type="button">Call customer</button>
        <div className="xos-command-results">
          {commandSuggestions.map((item) => <span key={item}>{item}</span>)}
        </div>
      </aside>

      {assetModal ? (
        <section className="tv2-modal-overlay" onClick={() => setAssetModal(null)}>
          <article className="tv2-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{assetModal === 'sticker' ? 'Window Sticker' : 'CARFAX Summary'}</h3>
              <button className="tv2-btn" type="button" onClick={() => setAssetModal(null)}>Close</button>
            </header>
            {assetModalUrl ? <iframe title={assetModal === 'sticker' ? 'window sticker' : 'carfax summary'} src={assetModalUrl} /> : <p className="tv2-empty">Asset not available.</p>}
          </article>
        </section>
      ) : null}
    </main>
  );

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
          <span className="tv2-chip">Inventory {inventoryStats.total}</span>
          <span className="tv2-chip">Leads {leads.length}</span>
          <span className={`tv2-chip ${stackStatus?.stack_readiness?.ready_for_live_facebook_posting ? 'tv2-chip-good' : 'tv2-chip-warn'}`}>
            {stackStatus?.stack_readiness?.ready_for_live_facebook_posting ? 'FB Ready' : 'FB Setup'}
          </span>
          <span className="tv2-chip tv2-chip-release">{UI_BUILD_LABEL}</span>
          {canEditInventory ? (
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => openQuickEdit()}>
              Add Vehicle
            </button>
          ) : null}
          <button className="tv2-btn" type="button" onClick={() => setToolsOpen((value) => !value)}>
            {toolsOpen ? 'Close Admin' : 'Admin'}
          </button>
        </div>
      </header>

      <section className="tv2-controlbar tv2-controlbar-simple">
        <div className="tv2-source">
          <span>Source: {sourceStatus?.active_source || 'runtime'}</span>
          <span>Live cache: {sourceStatus?.live_cache_active_count ?? sourceStatus?.live_cache_count ?? 0}</span>
          {sourceStatus?.live_cache_in_transit_count ? <span>In transit: {sourceStatus.live_cache_in_transit_count}</span> : null}
          <span>Last sync: {nowText(sourceStatus?.last_synced_at)}</span>
          <span>Railway: {deployment?.service_name || 'Xconsole-Dealership-Tool'} - {deploymentShort}</span>
        </div>
        <div className="tv2-control-actions tv2-control-actions-simple">
          <button className="tv2-btn" type="button" onClick={() => setSourceOpen((value) => !value)}>
            {sourceOpen ? 'Hide Source' : 'Source'}
          </button>
          {canEditInventory ? (
            <button className="tv2-btn" type="button" onClick={() => void syncInventory()} disabled={syncBusy}>
              {syncBusy ? 'Syncing...' : 'Sync Inventory'}
            </button>
          ) : null}
          {canPostFacebook ? (
            <button className="tv2-btn" type="button" onClick={() => void syncMarketplaceStatuses(false)} disabled={refreshBusy || postBusy || batchBusy}>
              Sync Marketplace
            </button>
          ) : null}
          <button className="tv2-btn" type="button" onClick={() => void refresh()} disabled={refreshBusy}>
            {refreshBusy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </section>

      {facebookStatusText ? (
        <section className="tv2-live-status">
          <strong>{facebookStatusText}</strong>
          <span>Marketplace location: {MARKETPLACE_LOCATION}</span>
          <span>Queue runs one vehicle at a time so Facebook keeps the saved browser session stable.</span>
        </section>
      ) : null}

      {sourceOpen ? (
        <section className="tv2-source-editor tv2-dealer-editor">
          <article className="tv2-source-card">
            <div className="tv2-card-head">
              <div>
                <h3>Dealership Sources</h3>
                <p>Add the store once; Xconsole will sync new, used, and pre-owned inventory from the saved links.</p>
              </div>
              <span className={`tv2-badge${canManageDealerships ? ' ok' : ' warn'}`}>{canManageDealerships ? 'Editable' : 'View Only'}</span>
            </div>
            <div className="tv2-mini-form tv2-mini-form-dealer">
              <input value={dealerForm.name} onChange={(event) => setDealerForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Dealership name" disabled={!canManageDealerships} />
              <input value={dealerForm.preowned_url} onChange={(event) => setDealerForm((prev) => ({ ...prev, preowned_url: event.target.value }))} placeholder="Pre-owned inventory URL" disabled={!canManageDealerships} />
              <input value={dealerForm.used_url} onChange={(event) => setDealerForm((prev) => ({ ...prev, used_url: event.target.value }))} placeholder="Used inventory URL" disabled={!canManageDealerships} />
              <input value={dealerForm.new_url} onChange={(event) => setDealerForm((prev) => ({ ...prev, new_url: event.target.value }))} placeholder="New inventory URL" disabled={!canManageDealerships} />
            </div>
            <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void saveDealership()} disabled={dealerBusy || syncBusy || !canManageDealerships}>
              {dealerBusy || syncBusy ? 'Saving...' : 'Save Dealer + Sync'}
            </button>
          </article>

          <article className="tv2-source-card">
            <h3>Saved Stores</h3>
            <div className="tv2-dealer-list">
              {dealerships.map((dealer) => (
                <div className="tv2-dealer-row" key={dealer.id || dealer.name}>
                  <strong>{dealer.name}</strong>
                  <span>{[dealer.preowned_url ? 'pre-owned' : null, dealer.used_url ? 'used' : null, dealer.new_url ? 'new' : null].filter(Boolean).join(' | ') || 'no links'}</span>
                </div>
              ))}
              {!dealerships.length ? <p className="tv2-empty">No saved dealerships yet.</p> : null}
            </div>
          </article>

          <article className="tv2-source-card">
            <h3>Manual Sync / Facebook</h3>
            <input
              className="tv2-input"
              value={dealershipUrl}
              onChange={(event) => setDealershipUrl(event.target.value)}
              placeholder="Manual inventory URL(s), comma separated"
            />
            <select className="tv2-input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Default Facebook account</option>
              {accounts.map((item, index) => (
                <option key={`${item.id || item.email || 'acct'}-${index}`} value={item.id || ''}>
                  {item.name || item.email || item.id}
                </option>
              ))}
            </select>
          </article>
        </section>
      ) : null}

      {showStatusLine ? <p className="tv2-statusline">{statusText}</p> : null}

      {mode === 'pipeline' ? (
      <section className="tv2-mission-strip">
        <article className="tv2-kpi tv2-kpi-accent">
          <h3>Inventory</h3>
          <p>{inventoryStats.total}</p>
          <small>{inventoryStats.inTransitCount ? `${inventoryStats.inTransitCount} in transit excluded` : 'live Taverna units'}</small>
        </article>
        <article className="tv2-kpi">
          <h3>Ready To Market</h3>
          <p>{inventoryStats.readyToMarketCount}</p>
          <small>photos ready, not posted</small>
        </article>
        <article className="tv2-kpi">
          <h3>Leads</h3>
          <p>{leads.length}</p>
          <small>buyer conversations</small>
        </article>
        <article className="tv2-kpi">
          <h3>Best Bank</h3>
          <p>{vehicleBestBank?.bank_name || bestBank?.bank_name || 'n/a'}</p>
          <small>{approvalProbability} approval signal</small>
        </article>
      </section>
      ) : null}

      {toolsOpen ? (
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
                        {leads.map((lead) => (
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
              <h3>Bank Brain Admin</h3>
              <p>Collateral-aware lender suggestion and RouteOne profile controls.</p>
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
              <strong>{selectedLtv ?? 'n/a'}%</strong>
            </div>
            <div>
              <span>Backup</span>
              <strong>{vehicleBackupBank?.bank_name || backupBank?.bank_name || 'n/a'}</strong>
            </div>
            <div>
              <span>Profiles</span>
              <strong>{bankProfiles.length || routeoneDocs?.generated_profiles_count || 'n/a'}</strong>
            </div>
            <div>
              <span>RouteOne Docs</span>
              <strong>{routeoneDocs?.doc_count ?? 'n/a'}</strong>
            </div>
          </div>
          <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => { setTab('finance'); setToolsOpen(false); }} disabled={!canViewBankBrain}>
            Open Finance Workbench
          </button>
          <div className="tv2-pill-wrap">
            {(vehicleBrain?.recommendation?.collateral_flags?.length ? vehicleBrain.recommendation.collateral_flags : vehicleBrain?.packet_guidance || ['Upload credit report for bureau-specific recommendation.'])
              .slice(0, 3)
              .map((item, index) => <span className="tv2-pill" key={`intel-${index}`}>{item}</span>)}
          </div>
        </article>
      </section>
      ) : null}

      <section className="tv2-layout">
        <aside className="tv2-inventory-pane">
          <div className="tv2-pane-head">
            <div>
              <h2>Inventory Stream</h2>
              <p>{filtered.length} shown of {inventoryStats.total} active / {inventory.length} website listings</p>
            </div>
            <span>{sourceStatus?.live_cache_active_count ?? inventoryStats.total}</span>
          </div>

          <div className="tv2-inventory-filters">
            {([
              ['all', 'All'],
              ['ready', 'Ready'],
              ['needs-assets', 'Needs Assets'],
              ['unposted', 'Unposted'],
              ['posted', 'Posted'],
              ['used', 'Used'],
              ['new', 'New'],
            ] as Array<[InventoryFilter, string]>).map(([id, label]) => (
              <button
                key={id}
                className={`tv2-filter-chip${inventoryFilter === id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setInventoryFilter(id)}
              >
                {label} {categoryCounts[id]}
              </button>
            ))}
            <select className="tv2-filter-select" value={makeFilter} onChange={(event) => setMakeFilter(event.target.value)}>
              <option value="all">All makes</option>
              {makeOptions.map((make) => (
                <option key={make} value={make.toLowerCase()}>{make}</option>
              ))}
            </select>
            <select className="tv2-filter-select" value={inventorySort} onChange={(event) => setInventorySort(event.target.value as InventorySort)}>
              <option value="ltv-low">LTV low to high</option>
              <option value="price-low">Price low to high</option>
              <option value="price-high">Price high to low</option>
              <option value="title">Title A-Z</option>
            </select>
              <div className="tv2-price-filter">
              <div className="tv2-price-filter-head">
                <strong>Price Range</strong>
                <span>{priceFilterDirty ? `${money(priceFloor ?? inventoryPriceBounds.min)} - ${money(priceCeiling ?? inventoryPriceBounds.max)}` : 'All prices'}</span>
              </div>
              <div className="tv2-price-filter-sliders">
                <label>
                  <span>Min</span>
                  <input
                    type="range"
                    min={inventoryPriceBounds.min}
                    max={inventoryPriceBounds.max}
                    step={inventoryPriceBounds.step}
                    value={priceFloor ?? inventoryPriceBounds.min}
                    onChange={(event) => {
                      setPriceFilterDirty(true);
                      const next = Number(event.target.value);
                      setPriceFloor(next);
                      setPriceCeiling((current) => current === null ? inventoryPriceBounds.max : Math.max(current, next));
                    }}
                  />
                </label>
                <label>
                  <span>Max</span>
                  <input
                    type="range"
                    min={inventoryPriceBounds.min}
                    max={inventoryPriceBounds.max}
                    step={inventoryPriceBounds.step}
                    value={priceCeiling ?? inventoryPriceBounds.max}
                    onChange={(event) => {
                      setPriceFilterDirty(true);
                      const next = Number(event.target.value);
                      setPriceCeiling(next);
                      setPriceFloor((current) => current === null ? inventoryPriceBounds.min : Math.min(current, next));
                    }}
                  />
                </label>
              </div>
              <button
                className="tv2-btn tv2-btn-xs"
                type="button"
                onClick={() => {
                  setPriceFilterDirty(false);
                  setPriceFloor(inventoryPriceBounds.min);
                  setPriceCeiling(inventoryPriceBounds.max);
                }}
              >
                Reset Price
              </button>
            </div>
          </div>

          <section className="tv2-batch-queue">
            <div>
              <strong>Facebook Batch Queue</strong>
              <span>
                Select vehicles below, then post them one at a time. Marketplace location: {MARKETPLACE_LOCATION}.
              </span>
            </div>
            <div className="tv2-batch-tools">
              <button className="tv2-btn tv2-btn-xs" type="button" onClick={() => selectVisibleUnpostedForBatch(10)} disabled={batchBusy || !canPostFacebook}>
                Select 10
              </button>
              <button className="tv2-btn tv2-btn-xs" type="button" onClick={() => setBatchSelectedVins({})} disabled={batchBusy || !batchSelectedCount}>
                Clear
              </button>
              <button className="tv2-btn tv2-btn-primary tv2-btn-xs" type="button" onClick={() => void postSelectedBatch()} disabled={batchBusy || postBusy || !batchSelectedCount || !canPostFacebook}>
                {batchBusy ? `Posting ${batchProgress.current}/${batchProgress.total}` : `Post Selected (${batchSelectedCount})`}
              </button>
            </div>
          </section>

          <div className="tv2-inventory-list">
            {filtered.map((vehicle, idx) => {
              const clean = vin(vehicle.vin);
              const rowPhoto = normalizePhotos(vehicle.photos)[0] || null;
              const rowPosted = isVehicleMarketplaceLive(vehicle);
              const condition = vehicleCondition(vehicle);
              const active = clean === vin(selectedVin);

              return (
                <article
                  key={`${clean || vehicle.title || 'vehicle'}-${idx}`}
                  className={`tv2-vehicle-row${canPostFacebook ? ' has-batch' : ''}${active ? ' is-active' : ''}${batchSelectedVins[clean] ? ' is-batch-selected' : ''}`}
                  onClick={() => activateVehicle(clean)}
                >
                  {canPostFacebook ? (
                    <label className="tv2-batch-check" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(batchSelectedVins[clean])}
                        onChange={() => toggleBatchVin(clean)}
                        disabled={batchBusy}
                      />
                      <span>Batch</span>
                    </label>
                  ) : null}
                  <div className="tv2-row-photo">
                    {rowPhoto ? <img src={rowPhoto} alt={vehicle.title || clean} loading="lazy" /> : <span>No Photo</span>}
                  </div>
                  <div className="tv2-row-main">
                    <h3>{vehicle.title || clean}</h3>
                    <p><strong className="tv2-fb-price">{downPaymentMoney(vehicle)}</strong> down / {money(vehicle.price)} site</p>
                    <p>{miles(vehicle.mileage)}</p>
                    <p>{[vehicle.drivetrain, vehicle.engine].filter(Boolean).join(' | ') || vehicle.status_label || 'In Stock'}</p>
                    <p className="tv2-row-tags">
                      <span>{condition === 'unknown' ? 'inventory' : condition}</span>
                      <span>{vehicleMake(vehicle)}</span>
                      {vehicle.jd_power_trade_in ? <span>JD {money(vehicle.jd_power_trade_in)}</span> : null}
                      {vehicle.jd_power_ltv ? <span>LTV {vehicle.jd_power_ltv}%</span> : null}
                      <span>{resolveVehiclePhotos(vehicle, assetsByVin[clean]).length} photos</span>
                    </p>
                    <p className="tv2-row-status">
                      Status: <strong className={rowPosted ? 'is-yes' : 'is-no'}>{vehicleMarketplaceLabel(vehicle).toUpperCase()}</strong>
                    </p>
                  </div>
                  <div className="tv2-row-actions">
                    {canPostFacebook ? (
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
                    ) : null}
                    {canViewBankBrain ? (
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
                    ) : null}
                    {canEditInventory ? (
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
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!filtered.length ? <p className="tv2-empty">No inventory found.</p> : null}
          </div>
        </aside>

        <section className="tv2-workspace-pane">
          <div className="tv2-workspace-map">
            <span>Left: Inventory</span>
            <span>Middle: Vehicle Info</span>
            <span>Side: Bank Brain + Finance</span>
            <span>Right: Lead Inbox</span>
          </div>
          <div className="tv2-workspace-head">
            <div>
              <h2>{selected?.title || 'Select a vehicle'}</h2>
              <p>
                {selected
                  ? `FB down ${downPaymentMoney(selected)} | site ${money(selected.price)} | ${miles(selected.mileage)} | VIN ${vin(selected.vin)} | ${selectedTitleParts.make} ${selectedTitleParts.model}`
                  : 'Select a vehicle from the left stream.'}
              </p>
            </div>
            <div className="tv2-head-rail">
              <div className="tv2-head-actions">
                {canPostFacebook ? (
                  <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void post('live')} disabled={!selected || postBusy}>
                    {postBusy ? 'Posting...' : 'Post to Facebook'}
                  </button>
                ) : null}
                {canViewAssets ? (
                  <button className="tv2-btn" type="button" onClick={() => selected && void loadAssets(vin(selected.vin), true)} disabled={!selected}>
                    Refresh Assets
                  </button>
                ) : null}
                {canViewStickers ? (
                  <button className="tv2-btn" type="button" onClick={() => void openAssetModal('sticker')} disabled={!selected}>
                    Sticker
                  </button>
                ) : null}
                {canViewCarfax ? (
                  <button className="tv2-btn" type="button" onClick={() => void openAssetModal('carfax')} disabled={!selected}>
                    Carfax
                  </button>
                ) : null}
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
                {canViewBankBrain ? (
                  <button className={`tv2-tab${tab === 'finance' ? ' is-active' : ''}`} type="button" onClick={() => setTab('finance')}>
                    Finance
                  </button>
                ) : null}
              </div>

              {!selected ? <div className="tv2-empty tv2-empty-workspace">Select a vehicle to activate the workspace.</div> : null}

              {selected && tab === 'overview' ? (
                <div className="tv2-tab-panel">
                  <section className="tv2-deal-command-grid">
                    <article className="tv2-card tv2-command-card tv2-command-card-facebook">
                      <div className="tv2-card-head">
                        <h3>Facebook Posting</h3>
                        <span className={`tv2-badge${postStatusLabel === 'Posted live' || postStatusLabel === 'Posted' || postStatusLabel === 'Live' || postStatusLabel === 'Ready' ? ' ok' : ' warn'}`}>{postStatusLabel}</span>
                      </div>
                      <div className="tv2-command-metrics">
                        <div><span>Down Payment</span><strong>{downPaymentMoney(selected)}</strong></div>
                        <div><span>Photos</span><strong>{selectedPhotoIndexes.length || selectedIntelligence.photosCount}</strong></div>
                        <div><span>Account</span><strong>{accountId || 'default'}</strong></div>
                      </div>
                      <p>{postResult?.post_result?.live_detail || selected?.post_detail || (selectedPosted ? 'Marketplace listing has been verified live.' : 'Ready means account, browser, images, and caption are staged.')}</p>
                      {canPostFacebook ? (
                        <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void post('live')} disabled={!selected || postBusy}>
                          {postBusy ? 'Posting...' : selectedPosted ? 'Post Again' : 'Post Live'}
                        </button>
                      ) : null}
                    </article>

                    {canViewCarfax ? (
                      <article className="tv2-card tv2-command-card tv2-command-card-carfax">
                        <div className="tv2-card-head">
                          <h3>CARFAX Facts</h3>
                          <span className={`tv2-badge${selectedCarfaxFacts.owner_count || selectedCarfaxFacts.value_badge ? ' ok' : ' warn'}`}>
                            {selectedCarfaxFacts.owner_count || selectedCarfaxFacts.value_badge ? 'Parsed' : 'Needs Report'}
                          </span>
                        </div>
                        <div className="tv2-command-metrics">
                          {carfaxFactRows.map(([label, value]) => (
                            <div key={`carfax-fact-${label}`}><span>{label}</span><strong>{value}</strong></div>
                          ))}
                        </div>
                        <p>{selectedCarfaxSummary || 'Refresh assets to read dealer-page CARFAX facts.'}</p>
                        <button className="tv2-btn" type="button" onClick={() => void openAssetModal('carfax')} disabled={!selected}>
                          Open CARFAX Panel
                        </button>
                      </article>
                    ) : null}

                    {canViewBankBrain ? (
                      <article className="tv2-card tv2-command-card tv2-command-card-bank">
                        <div className="tv2-card-head">
                          <h3>Bank Brain</h3>
                          <span className={`tv2-badge${vehicleBestBank || bestBank ? ' ok' : ' warn'}`}>{vehicleBestBank || bestBank ? 'Live' : 'Run'}</span>
                        </div>
                        <div className="tv2-command-metrics">
                          <div><span>Primary</span><strong>{vehicleBestBank?.bank_name || bestBank?.bank_name || 'Run structure'}</strong></div>
                          <div><span>Backup</span><strong>{vehicleBackupBank?.bank_name || backupBank?.bank_name || 'n/a'}</strong></div>
                          <div><span>LTV</span><strong>{selectedLtv ?? 'n/a'}%</strong></div>
                          <div><span>Payment</span><strong>{money(selectedPayment)}</strong></div>
                        </div>
                        <ul className="tv2-action-list">
                          {(bankBrainPointers.length ? bankBrainPointers : ['Bank Brain is loaded; run a structure for payment and lender-specific calls.']).map((item, index) => (
                            <li key={`brain-pointer-${index}`}>{item}</li>
                          ))}
                        </ul>
                        <button className="tv2-btn" type="button" onClick={() => setTab('finance')}>
                          Open Bank Brain
                        </button>
                      </article>
                    ) : null}

                    <article className="tv2-card tv2-command-card tv2-command-card-leads">
                      <div className="tv2-card-head">
                        <h3>Lead Inbox</h3>
                        <button className="tv2-btn tv2-btn-xs" type="button" onClick={() => void syncFacebookLeads()} disabled={leadBusy || !can('facebook.leads')}>
                          {leadBusy ? 'Syncing...' : 'Sync FB'}
                        </button>
                      </div>
                      <div className="tv2-mini-form tv2-mini-form-leads tv2-mini-form-leads-compact">
                        <input value={manualLead.customer_name} onChange={(event) => setManualLead((prev) => ({ ...prev, customer_name: event.target.value }))} placeholder="lead name" />
                        <input value={manualLead.message} onChange={(event) => setManualLead((prev) => ({ ...prev, message: event.target.value, vehicle_vin: prev.vehicle_vin || vin(selectedVin) }))} placeholder="message from buyer" />
                        <button className="tv2-btn tv2-btn-primary" type="button" onClick={() => void addManualLead()} disabled={leadBusy || !can('facebook.leads')}>
                          Add
                        </button>
                      </div>
                      <div className="tv2-lead-rail-list">
                        {leads
                          .slice(0, 5)
                          .map((lead) => {
                            const linked = vin(lead.vehicle_vin) === vin(selectedVin);
                            return (
                              <div className={`tv2-lead-rail-item${linked ? ' is-linked' : ''}`} key={`overview-${lead.id}`}>
                                <strong>{lead.customer_name || 'Unknown Lead'}</strong>
                                <span>{lead.message || 'No message text captured.'}</span>
                                <em>{linked ? 'Selected vehicle' : lead.vehicle_vin ? `VIN ${vin(lead.vehicle_vin)}` : 'All conversations'}</em>
                              </div>
                            );
                          })}
                        {!leads.length ? <p className="tv2-empty">No captured leads yet.</p> : null}
                      </div>
                    </article>
                  </section>

                  <section className="tv2-overview-hero">
                    <article className="tv2-card tv2-card-photo-showcase">
                      <div className="tv2-card-head">
                        <h3>Inventory Visuals</h3>
                        <span className="tv2-chip tv2-chip-soft">{selectedIntelligence.photosCount} photos cached</span>
                      </div>
                      <div className="tv2-photo-grid">
                        {overviewPhotoIndexes.map((index) => (
                            <figure key={`overview-photo-${index}`}>
                              <img src={selectedPhotos[index]} alt={`${selected.title} ${index + 1}`} loading="lazy" />
                              <figcaption>Image {index + 1}</figcaption>
                            </figure>
                          ))}
                      </div>
                      {hiddenOverviewPhotos > 0 ? (
                        <button className="tv2-btn tv2-photo-more" type="button" onClick={() => setTab('marketing')}>
                          View all photos in Marketing ({hiddenOverviewPhotos} more)
                        </button>
                      ) : null}
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
                    <article className="tv2-kpi tv2-kpi-large"><h3>Facebook Down</h3><p>{downPaymentMoney(selected)}</p><small>LTV-based, min $750 / max $2,999</small></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Mileage</h3><p>{miles(selected.mileage)}</p></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Cost</h3><input className="tv2-input" value={dealCost} onChange={(event) => setDealCost(event.target.value)} /></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Front / Back Gross</h3><p>{money(frontGross)} / {money(backGross)}</p></article>
                    <article className="tv2-kpi tv2-kpi-large"><h3>Powertrain</h3><p>{selected.drivetrain || 'n/a'} / {selected.transmission || 'n/a'}</p></article>
                  </section>

                  {canViewAssets ? (
                    <section className="tv2-summary-grid">
                      <article className="tv2-card tv2-summary-card">
                        <h3>Ideal Buyer</h3>
                        <p>{selectedBuyerText || 'Refresh assets to build a buyer profile.'}</p>
                        <ul className="tv2-action-list">
                          {(selectedMarketingSummary.length ? selectedMarketingSummary.slice(0, 3) : ['Target customer and selling hooks will appear here.']).map((item, index) => (
                            <li key={`buyer-summary-${index}`}>{item}</li>
                          ))}
                        </ul>
                      </article>
                      {canViewStickers ? (
                        <article className="tv2-card tv2-summary-card">
                          <h3>Sticker Highlights</h3>
                          <ul className="tv2-action-list">
                            {(selectedStickerHighlights.length ? selectedStickerHighlights.slice(0, 6) : ['Refresh assets to cache sticker highlights.']).map((item, index) => (
                              <li key={`sticker-summary-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                      {canViewCarfax ? (
                        <article className="tv2-card tv2-summary-card">
                          <h3>Carfax Summary</h3>
                          <p>{selectedCarfaxSummary || 'Refresh assets to show the in-app CARFAX summary.'}</p>
                          <ul className="tv2-action-list">
                            {selectedCarfaxHighlights.slice(0, 4).map((item, index) => (
                              <li key={`carfax-summary-${index}`}>{item}</li>
                            ))}
                          </ul>
                        </article>
                      ) : null}
                    </section>
                  ) : null}

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
                        {canViewStickers ? <div><span>Sticker</span><strong>{selectedIntelligence.hasSticker ? 'Ready' : 'Missing'}</strong></div> : null}
                        {canViewCarfax ? <div><span>Carfax</span><strong>{selectedIntelligence.hasCarfax ? 'Ready' : 'Missing'}</strong></div> : null}
                        <div><span>Listing URL</span><strong>{selected.detail_url ? 'Ready' : 'Missing'}</strong></div>
                      </div>
                    </article>

                    <label className="tv2-card tv2-notes-card">
                      <span>Deal Notes</span>
                      <textarea value={dealNotes} onChange={(event) => setDealNotes(event.target.value)} />
                    </label>
                  </section>

                  <section className="tv2-status-badges">
                    <span className={`tv2-badge${selectedPosted ? ' ok' : ' warn'}`}>{vehicleMarketplaceLabel(selected)}</span>
                    <span className={`tv2-badge${selected?.listing_url ? ' ok' : ' warn'}`}>{selected?.listing_url ? 'Verified URL' : 'No Live URL'}</span>
                    <span className={`tv2-badge${selectedInCredit ? ' ok' : ' warn'}`}>In Credit App</span>
                    <span className={`tv2-badge${selectedSubmitted ? ' ok' : ' warn'}`}>Bank Submitted</span>
                    {canViewStickers ? <span className={`tv2-badge${selectedIntelligence.hasSticker ? ' ok' : ' warn'}`}>Sticker Cached</span> : null}
                    {canViewCarfax ? <span className={`tv2-badge${selectedIntelligence.hasCarfax ? ' ok' : ' warn'}`}>Carfax Cached</span> : null}
                  </section>
                </div>
              ) : null}

              {selected && tab === 'marketing' ? (
                <div className="tv2-tab-panel tv2-marketing">
                  <article className="tv2-card">
                    <h3>Photo Selection</h3>
                    <p>{selectedPhotos.length > 10 ? 'Drag to reorder. Image 1 and Image 3 are unchecked by default so the listing starts with real angles, not thumbnails.' : 'Fewer than 10 photos: all photos are selected by default.'}</p>
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
                    <button className="tv2-btn tv2-btn-primary tv2-btn-post" type="button" onClick={() => void post('live')} disabled={postBusy || !canPostFacebook}>
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

              {selected && tab === 'finance' && canViewBankBrain ? (
                <div className="tv2-tab-panel">
                  <div className="tv2-finance-workbench">
                    <div className="tv2-finance-column">
                      <article className="tv2-card tv2-vehicle-brief">
                        <div className="tv2-card-head">
                          <h3>Vehicle Context</h3>
                          <span className={`tv2-badge${selectedPosted ? ' ok' : ' warn'}`}>{vehicleMarketplaceLabel(selected)}</span>
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
                          <div>
                            <span>JD Trade / LTV</span>
                            <strong>{money(selectedBookValue)} / {selectedLtv ?? 'n/a'}%</strong>
                          </div>
                          <div>
                            <span>Fees</span>
                            <strong>{money(selectedFees)}</strong>
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
                          <label><span>Bank Sale Price</span><input value={structureForm.salePrice} onChange={(event) => setStructureForm((prev) => ({ ...prev, salePrice: event.target.value, taxes: String(Math.round((optionalNumber(event.target.value) ?? 0) * 0.06)) }))} /></label>
                          <label><span>Down</span><input value={structureForm.down} onChange={(event) => setStructureForm((prev) => ({ ...prev, down: event.target.value }))} /></label>
                          <label><span>Trade / Equity</span><input value={structureForm.trade} onChange={(event) => setStructureForm((prev) => ({ ...prev, trade: event.target.value }))} /></label>
                          <label><span>Tax 6%</span><input value={structureForm.taxes} onChange={(event) => setStructureForm((prev) => ({ ...prev, taxes: event.target.value }))} /></label>
                          <label><span>Fees</span><input value={structureForm.fees} onChange={(event) => setStructureForm((prev) => ({ ...prev, fees: event.target.value }))} /></label>
                          <label><span>Backend</span><input value={structureForm.backend} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend: event.target.value }))} /></label>
                          <label><span>Term</span><input value={structureForm.term} onChange={(event) => setStructureForm((prev) => ({ ...prev, term: event.target.value }))} /></label>
                          <label><span>APR</span><input value={structureForm.apr} onChange={(event) => setStructureForm((prev) => ({ ...prev, apr: event.target.value }))} /></label>
                          <label><span>Monthly Income</span><input value={structureForm.monthlyIncome} onChange={(event) => setStructureForm((prev) => ({ ...prev, monthlyIncome: event.target.value }))} /></label>
                          <label><span>Current DTI</span><input value={structureForm.currentDti} onChange={(event) => setStructureForm((prev) => ({ ...prev, currentDti: event.target.value }))} /></label>
                        </div>
                        <div className="tv2-metric-strip">
                          <article><h4>Payment</h4><p>{money(selectedPayment)}</p></article>
                          <article><h4>LTV</h4><p>{selectedLtv ?? 'n/a'}%</p></article>
                          <article><h4>JD Trade</h4><p>{money(selectedBookValue)}</p></article>
                          <article><h4>Fees</h4><p>{money(selectedFees)}</p></article>
                          <article><h4>PTI</h4><p>{structure?.structure?.pti ?? 'n/a'}%</p></article>
                          <article><h4>DTI</h4><p>{structure?.structure?.dti ?? 'n/a'}%</p></article>
                        </div>
                        <small>LTV uses amount financed divided by JD Power Trade In when a valuation exists.</small>
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
                        <div className="tv2-inline-actions">
                          <input type="file" accept=".xls,.xlsx" onChange={(event) => setValuationFile(event.target.files?.[0] || null)} />
                          <button className="tv2-btn" type="button" onClick={() => void uploadValuations()} disabled={routeoneBusy}>
                            Load JD Power
                          </button>
                        </div>
                        <small>JD Power book loaded: {valuationStatus?.count ?? 0} units{valuationStatus?.source_file ? ` from ${valuationStatus.source_file}` : ''}.</small>
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
                          <label><span>Trade / Equity</span><input value={structureForm.trade} onChange={(event) => setStructureForm((prev) => ({ ...prev, trade: event.target.value }))} /></label>
                          <label><span>Fees</span><input value={structureForm.fees} onChange={(event) => setStructureForm((prev) => ({ ...prev, fees: event.target.value }))} /></label>
                          <label><span>Backend</span><input value={structureForm.backend} onChange={(event) => setStructureForm((prev) => ({ ...prev, backend: event.target.value }))} /></label>
                          <label><span>Term</span><input value={structureForm.term} onChange={(event) => setStructureForm((prev) => ({ ...prev, term: event.target.value }))} /></label>
                        </div>
                        <div className="tv2-metric-strip tv2-structuring-strip">
                          <article><h4>Best Bank</h4><p>{bestBank?.bank_name || vehicleBestBank?.bank_name || 'n/a'}</p></article>
                          <article><h4>Backup</h4><p>{backupBank?.bank_name || vehicleBackupBank?.bank_name || 'n/a'}</p></article>
                          <article><h4>Financed</h4><p>{money(selectedFinanced)}</p></article>
                          <article><h4>Payment</h4><p>{money(selectedPayment)}</p></article>
                          <article><h4>LTV</h4><p>{selectedLtv ?? 'n/a'}%</p></article>
                          <article><h4>JD Value</h4><p>{money(selectedBookValue)}</p></article>
                        </div>
                      </article>

                      <article className="tv2-card">
                        <div className="tv2-card-head">
                          <h3>Suggested Cars</h3>
                          <button className="tv2-btn" type="button" onClick={() => void recommendVehicles()} disabled={structureBusy}>
                            Refresh
                          </button>
                        </div>
                        <div className="tv2-dealer-list">
                          {vehicleRecommendations.slice(0, 5).map((item) => (
                            <button className="tv2-dealer-row" key={item.vin} type="button" onClick={() => activateVehicle(item.vin, 'finance')}>
                              <strong>{item.title || item.vin}</strong>
                              <span>{item.best_bank?.bank_name || 'bank n/a'} | LTV {item.ltv ?? 'n/a'}% | Basis {money(item.ltv_basis ?? null)} | JD {money(item.jd_power_trade_in ?? null)}</span>
                            </button>
                          ))}
                          {!vehicleRecommendations.length ? <p className="tv2-empty">Enter score/income/down, then refresh suggestions.</p> : null}
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

      {assetModal ? (
        <section className="tv2-modal-overlay" onClick={() => setAssetModal(null)}>
          <article className="tv2-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header>
              <h3>{assetModal === 'sticker' ? 'Window Sticker' : 'CARFAX Summary'}</h3>
              <button className="tv2-btn" type="button" onClick={() => setAssetModal(null)}>Close</button>
            </header>
            {assetModalUrl ? <iframe title={assetModal === 'sticker' ? 'window sticker' : 'carfax summary'} src={assetModalUrl} /> : <p className="tv2-empty">Asset not available.</p>}
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
