import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import {
  newReviewState,
  recordAsk,
  shouldAskForReview,
  type ReviewState,
  MINUTE,
  OCCASIONS,
  TIER_TITLES,
  addressKey,
  addressesToLookUp,
  applyFreeLimits,
  freeOccasion,
  type ProFeature,
  buildNagSchedule,
  celebrateMessage,
  computeLeavePlan,
  destinationFor,
  detectOccasion,
  distanceMeters,
  migrateSettings,
  parseIcs,
  pendingNags,
  phaseAt,
  updateTrip,
  upcomingShifts,
  type CalendarEvent,
  type Destination,
  type Geocoded,
  type LatLng,
  type LeavePlan,
  type Occasion,
  type Phase,
  type ScheduledNag,
  type Settings,
  type Shift,
  type TravelEstimate,
  type TripState,
} from '../core';
import { platform, type PermissionState, type ProOption, type TripEvent } from '../platform';

const { storage, notifications, location, trip: tripPort, reviews, deviceCalendar, purchases } = platform;

interface Trip extends TripState {
  /** Where you were when Shoo started watching for this plan. */
  origin?: LatLng;
  updatedAt?: number;
}

interface RouteCache {
  estimate: TravelEstimate;
  from: LatLng;
  to: LatLng;
  mode: Settings['travelMode'];
  fetchedAt: number;
}

interface CalendarCache {
  url: string;
  events: CalendarEvent[];
  fetchedAt: number;
}

/** A plan plus where it is and what kind of thing it is. */
export interface Planned {
  shift: Shift;
  destination: Destination | null;
  occasion: Occasion;
}

/** Re-check traffic this often when the leave time is close, and when it isn't. */
const ROUTE_FRESH_SOON = 5 * MINUTE;
const ROUTE_FRESH_LATER = 30 * MINUTE;
const CALENDAR_FRESH = 30 * MINUTE;
const DEVICE_CALENDAR_FRESH = 10 * MINUTE;
/** Keep showing "made it" this long after arriving. */
const CELEBRATE_FOR = 30 * MINUTE;
/** iOS allows 64 pending notifications. Leave room. */
const MAX_PENDING = 60;
/** Plans that get nags scheduled ahead. */
const NAG_AHEAD = 4;
/** After an on-time arrival, offer Pro at most this often. */
const PAYWALL_EVERY = 14 * 86_400_000;

/** Why the paywall is open: a Pro feature they reached for, or a happy arrival. */
export type PaywallReason = ProFeature | 'arrival';

export interface ShooState {
  now: number;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  plans: Planned[];
  active: Planned | null;
  plan: LeavePlan | null;
  phase: Phase | null;
  trip: Trip;
  estimate: TravelEstimate | null;
  origin: LatLng | null;
  originIsLive: boolean;
  nags: ScheduledNag[];
  location: LatLng | null;
  locationError: string;
  notificationPermission: PermissionState;
  enableNotifications: () => Promise<void>;
  testNag: () => Promise<void>;
  markLeft: () => void;
  markArrived: () => void;
  resetTrip: () => void;
  refreshRoute: () => void;
  routeError: string;
  /** Per linked calendar. */
  calendars: Record<string, { fetchedAt: number | null; error: string; syncing: boolean; count: number }>;
  syncCalendar: (id: string) => void;
  device: {
    available: boolean;
    reminders: boolean;
    calendar: PermissionState;
    remindersPermission: PermissionState;
    count: number;
    request: (which: 'calendar' | 'reminders') => Promise<void>;
  };
  serverWaking: boolean;
  passcodeRequired: boolean;
  passcodeOk: boolean;
  submitPasscode: (value: string) => Promise<string | null>;
  firesWhenClosed: boolean;
  /** Phone apps only: "granted" means Shoo can tell you left even when it's closed. */
  backgroundLocation: PermissionState | 'when-in-use';
  requestBackgroundLocation: () => Promise<void>;
  openSettings: () => Promise<void>;
  /** On-time arrivals so far, for the "Rate Shoo" nudge. */
  onTimeArrivals: number;
  storeUrl: string | null;
  platformName: 'web' | 'ios' | 'android';
  pro: {
    /** Pro features usable right now (bought, or no store set up yet). */
    unlocked: boolean;
    /** The store is set up, so there's something to buy. */
    forSale: boolean;
    paywall: PaywallReason | null;
    /** Opens the paywall if the feature is locked. Returns true if it's free to use. */
    gate: (feature: ProFeature) => boolean;
    close: () => void;
    options: () => Promise<ProOption[]>;
    buy: (id: string) => Promise<boolean>;
    restore: () => Promise<boolean>;
  };
}

interface StoredReviews extends ReviewState {
  /** Plans already counted, so one arrival isn't counted twice. */
  counted: string[];
}

const routeKey = (to: LatLng, mode: Settings['travelMode']) => `${mode}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

export function useShoo(): ShooState {
  const [settings, setSettings] = useState<Settings>(() => migrateSettings(storage.load('settings', {})));
  const [now, setNow] = useState(Date.now());
  const [trips, setTrips] = useState<Record<string, Trip>>(() => storage.load('trips', {}));
  const [routes, setRoutes] = useState<Record<string, RouteCache>>(() => storage.load('routes', {}));
  const [routeError, setRouteError] = useState('');
  const [calendars, setCalendars] = useState<Record<string, CalendarCache>>(() => storage.load('calendars', {}));
  const [calendarErrors, setCalendarErrors] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [deviceEvents, setDeviceEvents] = useState<{ events: CalendarEvent[]; fetchedAt: number }>(() =>
    storage.load('deviceEvents', { events: [], fetchedAt: 0 }),
  );
  const [devicePermission, setDevicePermission] = useState<{ calendar: PermissionState; reminders: PermissionState }>({
    calendar: 'unsupported',
    reminders: 'unsupported',
  });
  const [geocoded, setGeocoded] = useState<Geocoded>(() => storage.load('geocoded', {}));
  const [fix, setFix] = useState<LatLng | null>(null);
  const [locationError, setLocationError] = useState('');
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [backgroundLocation, setBackgroundLocation] = useState<PermissionState | 'when-in-use'>('unsupported');
  const [serverWaking, setServerWaking] = useState(false);
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [passcodeOk, setPasscodeOk] = useState(true);
  const [pro, setPro] = useState<boolean>(() => storage.load('pro', false));
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const unlocked = !purchases.available || pro;

  const [reviewState, setReviewState] = useState<StoredReviews>(() => {
    const saved = storage.load<StoredReviews | null>('reviews', null);
    const base = saved ?? { ...newReviewState(Date.now()), counted: [] };
    return { ...base, sessions: base.sessions + 1 }; // this launch
  });

  useEffect(() => storage.save('settings', settings), [settings]);
  useEffect(() => storage.save('reviews', reviewState), [reviewState]);
  useEffect(() => storage.save('trips', pruneTrips(trips, now)), [trips]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => storage.save('routes', pruneRoutes(routes)), [routes]);
  useEffect(() => storage.save('calendars', calendars), [calendars]);
  useEffect(() => storage.save('deviceEvents', deviceEvents), [deviceEvents]);
  useEffect(() => storage.save('geocoded', geocoded), [geocoded]);
  useEffect(() => storage.save('pro', pro), [pro]);

  // Shoo Pro: ask the store once at launch and listen for changes (renewals, refunds).
  useEffect(() => {
    if (!purchases.available) return;
    purchases.isPro().then(setPro).catch(() => {});
    return purchases.onChange(setPro);
  }, []);
  const gate = useCallback(
    (feature: ProFeature) => {
      if (unlocked) return true;
      setPaywall(feature);
      return false;
    },
    [unlocked],
  );
  const buy = useCallback(async (id: string) => {
    const ok = await purchases.buy(id);
    if (ok) {
      setPro(true);
      setPaywall(null);
    }
    return ok;
  }, []);
  const restore = useCallback(async () => {
    const ok = await purchases.restore();
    setPro(ok);
    if (ok) setPaywall(null);
    return ok;
  }, []);

  // Free accounts plan with one place and typed-in plans. Nothing saved is lost.
  const effective = useMemo(() => (unlocked ? settings : applyFreeLimits(settings)), [unlocked, settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);

  // Clock.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    const wake = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  // Server: wake it up early and learn whether it wants a passcode.
  useEffect(() => api.onServerWaking(setServerWaking), []);
  useEffect(() => {
    const saved = storage.load('passcode', '');
    api.setPasscode(saved);
    api
      .health()
      .then(async (h) => {
        setPasscodeRequired(h.passcodeRequired);
        if (!h.passcodeRequired) return;
        try {
          await api.checkPasscode();
          setPasscodeOk(true);
        } catch {
          setPasscodeOk(false);
        }
      })
      .catch(() => {});
  }, []);

  const submitPasscode = useCallback(async (value: string) => {
    api.setPasscode(value);
    try {
      await api.checkPasscode();
      storage.save('passcode', value);
      setPasscodeOk(true);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  // Permissions.
  useEffect(() => {
    notifications.permission().then(setPermission);
    tripPort.backgroundPermission().then(setBackgroundLocation);
    if (deviceCalendar.available) deviceCalendar.permission().then(setDevicePermission).catch(() => {});
  }, []);
  const requestBackgroundLocation = useCallback(async () => {
    setBackgroundLocation(await tripPort.requestBackground());
  }, []);
  const openSettings = useCallback(() => tripPort.openSettings(), []);
  const enableNotifications = useCallback(async () => {
    setPermission(await notifications.request());
  }, []);
  const testNag = useCallback(async () => {
    const all = Object.values(OCCASIONS).flatMap((o) => [...o.serious, ...o.panic]).filter((l) => !l.includes('{'));
    await notifications.showNow(TIER_TITLES.serious, all[Math.floor(Math.random() * all.length)]);
  }, []);

  // Location: only once there's somewhere to measure against.
  const wantsLocation = effective.places.length > 0 || effective.calendars.length > 0 || effective.deviceCalendar;
  useEffect(() => {
    if (!wantsLocation) return;
    return location.watch(
      (f) => {
        setFix(f);
        setLocationError('');
      },
      setLocationError,
    );
  }, [wantsLocation]);

  // Linked calendars (Google, Outlook, iCloud, Homebase, When I Work…).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const syncCalendar = useCallback((id: string) => {
    const feed = settingsRef.current.calendars.find((c) => c.id === id);
    const url = feed?.url.trim();
    if (!feed || !url) return;
    setSyncing((s) => ({ ...s, [id]: true }));
    setCalendarErrors((e) => ({ ...e, [id]: '' }));
    api
      .fetchCalendar(url)
      .then((text) => {
        const t = Date.now();
        setCalendars((c) => ({ ...c, [id]: { url, events: parseIcs(text, t - 86_400_000, t + 14 * 86_400_000), fetchedAt: t } }));
      })
      .catch((e: Error) => setCalendarErrors((errs) => ({ ...errs, [id]: e.message })))
      .finally(() => setSyncing((s) => ({ ...s, [id]: false })));
  }, []);

  useEffect(() => {
    if (!passcodeOk) return;
    for (const feed of effective.calendars) {
      const cache = calendars[feed.id];
      if (cache?.url === feed.url && now - cache.fetchedAt < CALENDAR_FRESH) continue;
      if (syncing[feed.id] || calendarErrors[feed.id]) continue;
      syncCalendar(feed.id);
    }
  }, [effective.calendars, calendars, now, syncing, calendarErrors, passcodeOk, syncCalendar]);

  // The phone's own calendar and Reminders.
  const deviceOn =
    deviceCalendar.available &&
    effective.deviceCalendar &&
    (devicePermission.calendar === 'granted' || devicePermission.reminders === 'granted');
  const readDevice = useCallback(() => {
    const t = Date.now();
    deviceCalendar
      .events(t - 86_400_000, t + 8 * 86_400_000)
      .then((events) => setDeviceEvents({ events, fetchedAt: t }))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!deviceOn) return;
    if (now - deviceEvents.fetchedAt > DEVICE_CALENDAR_FRESH) readDevice();
  }, [deviceOn, now, deviceEvents.fetchedAt, readDevice]);
  useEffect(() => {
    if (!deviceOn) return;
    const onVisible = () => document.visibilityState === 'visible' && readDevice();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [deviceOn, readDevice]);
  const requestDevice = useCallback(
    async (which: 'calendar' | 'reminders') => {
      const state = await deviceCalendar.request(which);
      setDevicePermission((p) => ({ ...p, [which]: state }));
      if (state === 'granted') {
        update({ deviceCalendar: true });
        readDevice();
      }
    },
    [update, readDevice],
  );

  // What's coming up, and where.
  const feedEvents = useMemo(
    () =>
      Object.fromEntries(
        effective.calendars.map((f) => [f.id, calendars[f.id]?.url === f.url ? calendars[f.id].events : []]),
      ),
    [effective.calendars, calendars],
  );
  const shifts = useMemo(
    () => upcomingShifts(effective, feedEvents, deviceOn ? deviceEvents.events : [], now),
    [effective, feedEvents, deviceOn, deviceEvents.events, now],
  );
  const plans: Planned[] = useMemo(
    () =>
      shifts.map((shift) => {
        const destination = destinationFor(shift, effective, geocoded);
        const place = effective.places.find((p) => p.id === destination?.placeId);
        const kind = place?.kind ?? destination?.kind;
        return {
          shift,
          destination,
          occasion: unlocked ? detectOccasion(shift.title, destination?.name ?? '', kind) : freeOccasion(kind),
        };
      }),
    [shifts, effective, geocoded, unlocked],
  );

  // Look up calendar addresses, one at a time (OpenStreetMap asks for one a second).
  const geocoding = useRef(false);
  // Lookups that failed (offline, say): try again next launch, not every second.
  const failedLookups = useRef(new Set<string>());
  const toLookUp = useMemo(
    () => addressesToLookUp(shifts, effective, geocoded).filter((a) => !failedLookups.current.has(a)),
    [shifts, effective, geocoded, now], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (geocoding.current || toLookUp.length === 0 || !passcodeOk) return;
    const address = toLookUp[0];
    geocoding.current = true;
    api
      .searchPlaces(address)
      .then((found) => setGeocoded((g) => ({ ...g, [addressKey(address)]: found[0] ?? null })))
      .catch(() => failedLookups.current.add(address))
      .finally(() => {
        window.setTimeout(() => {
          geocoding.current = false;
          setNow(Date.now());
        }, 1100);
      });
  }, [toLookUp, passcodeOk]);

  const active =
    plans.find(({ shift, destination }) => {
      if (!destination) return false;
      const arrivedAt = trips[shift.id]?.arrivedAt;
      return arrivedAt === undefined || now - arrivedAt < CELEBRATE_FOR;
    }) ?? null;
  const trip: Trip = (active && trips[active.shift.id]) || {};

  const originIsLive = !trip.origin && fix !== null;
  const origin = trip.origin ?? fix ?? settings.home?.location ?? null;
  const dest = active?.destination?.location ?? null;

  const estimateFor = useCallback(
    (to: LatLng): RouteCache | null => {
      const r = routes[routeKey(to, settings.travelMode)];
      if (!r || !origin || distanceMeters(r.from, origin) > 300) return null;
      return r;
    },
    [routes, settings.travelMode, origin],
  );
  const activeRoute = dest ? estimateFor(dest) : null;
  const estimate = activeRoute?.estimate ?? null;

  const planFor = useCallback(
    (p: Planned, travelMinutes: number) =>
      computeLeavePlan({
        shiftStart: p.shift.start,
        travelMinutes,
        prepMinutes: settings.prepMinutes,
        arriveEarlyMinutes: p.destination?.arriveEarlyMinutes ?? settings.arriveEarlyMinutes,
      }),
    [settings.prepMinutes, settings.arriveEarlyMinutes],
  );
  const plan = useMemo(() => (active && estimate ? planFor(active, estimate.minutes) : null), [active, estimate, planFor]);
  const phase = plan ? phaseAt(now, plan, trip) : null;

  // Traffic: refresh when stale, more often as the leave time gets close.
  const routing = useRef(false);
  const lastAttempt = useRef<Record<string, number>>({});
  const fetchRoute = useCallback(
    (to: LatLng, departAt?: number) => {
      if (!origin || routing.current || !passcodeOk) return;
      const key = routeKey(to, settings.travelMode);
      routing.current = true;
      lastAttempt.current[key] = Date.now();
      setRouteError('');
      const from = origin;
      const mode = settings.travelMode;
      api
        .travelTime(from, to, mode, departAt)
        .then((estimate) => setRoutes((r) => ({ ...r, [key]: { estimate, from, to, mode, fetchedAt: Date.now() } })))
        .catch((e: Error) => setRouteError(e.message))
        .finally(() => {
          routing.current = false;
          setNow(Date.now());
        });
    },
    [origin, settings.travelMode, passcodeOk],
  );
  const refreshRoute = useCallback(() => {
    if (dest) fetchRoute(dest, plan && plan.leaveAt > Date.now() ? plan.leaveAt : undefined);
  }, [dest, plan, fetchRoute]);

  useEffect(() => {
    if (!origin || routing.current) return;
    // The plan you're getting ready for first, then the next few so their nags are ready too.
    const upcoming = plans.filter((p) => p.destination && trips[p.shift.id]?.leftAt === undefined).slice(0, NAG_AHEAD);
    for (const p of upcoming) {
      const to = p.destination!.location;
      const cached = estimateFor(to);
      const isActive = p.shift.id === active?.shift.id;
      const soon = isActive && plan ? now > plan.getReadyAt - 2 * 60 * MINUTE : false;
      const maxAge = soon ? ROUTE_FRESH_SOON : ROUTE_FRESH_LATER;
      const stale = !cached || now - cached.fetchedAt > maxAge;
      const key = routeKey(to, settings.travelMode);
      if (stale && Date.now() - (lastAttempt.current[key] ?? 0) > 60_000) {
        fetchRoute(to, isActive && plan && plan.leaveAt > Date.now() ? plan.leaveAt : undefined);
        return;
      }
    }
  }, [plans, trips, origin, active, plan, now, estimateFor, fetchRoute, settings.travelMode]);

  // Did you leave? Did you make it?
  const setTrip = useCallback(
    (id: string, next: Trip) => setTrips((t) => ({ ...t, [id]: { ...next, updatedAt: Date.now() } })),
    [],
  );
  useEffect(() => {
    if (!active || !plan || !dest || !fix) return;
    const current = trips[active.shift.id] ?? {};
    const watchedOrigin = current.origin ?? fix;
    const { trip: next, event } = updateTrip(current, plan, watchedOrigin, dest, fix, Date.now());
    const withOrigin: Trip = { ...next, origin: watchedOrigin };
    if (event || (!current.origin && Date.now() >= plan.getReadyAt - 30 * MINUTE)) setTrip(active.shift.id, withOrigin);
    if (event === 'left') void tripPort.markLeft();
    // On phones the destination geofence sends the celebration itself.
    if (event === 'arrived' && !tripPort.native) celebrate(next, plan, active.occasion);
  }, [fix]); // eslint-disable-line react-hooks/exhaustive-deps

  const markLeft = useCallback(() => {
    if (!active) return;
    setTrip(active.shift.id, { ...trip, leftAt: Date.now() });
    void tripPort.markLeft();
  }, [active, trip, setTrip]);
  const markArrived = useCallback(() => {
    if (!active) return;
    const next = { ...trip, leftAt: trip.leftAt ?? Date.now(), arrivedAt: Date.now() };
    setTrip(active.shift.id, next);
    void tripPort.clear();
    if (plan) celebrate(next, plan, active.occasion);
  }, [active, trip, plan, setTrip]);
  const resetTrip = useCallback(() => {
    if (!active) return;
    setTrip(active.shift.id, {});
    void tripPort.clear();
  }, [active, setTrip]);

  // Phone apps: the native side notices leaving and arriving even while Shoo is closed.
  useEffect(() => {
    if (!tripPort.native) return;
    const apply = (e: TripEvent) =>
      setTrips((all) => {
        const t = all[e.shiftId] ?? {};
        const next: Trip =
          e.type === 'left'
            ? { ...t, leftAt: t.leftAt ?? e.at }
            : { ...t, leftAt: t.leftAt ?? e.at, arrivedAt: t.arrivedAt ?? e.at };
        return { ...all, [e.shiftId]: { ...next, updatedAt: Date.now() } };
      });
    const drain = () => void tripPort.takeEvents().then((events) => events.forEach(apply));
    drain();
    const stop = tripPort.onEvent(apply);
    const onVisible = () => document.visibilityState === 'visible' && drain();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Phone apps: hand the native side the geofences for the plan we're watching.
  const watchKey =
    active && plan && dest && origin && trip.arrivedAt === undefined
      ? `${active.shift.id}|${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}|${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}|${trip.leftAt ?? ''}|${plan.getReadyAt}`
      : '';
  useEffect(() => {
    if (!tripPort.native || !watchKey || !active || !plan || !dest || !origin) return;
    void tripPort.watch({
      shiftId: active.shift.id,
      shiftStart: active.shift.start,
      watchFrom: plan.getReadyAt - 30 * MINUTE,
      origin,
      job: dest,
      radius: 150,
      celebrateTitle: TIER_TITLES.celebrate,
      onTimeBody: celebrateMessage(active.occasion, true),
      lateBody: celebrateMessage(active.occasion, false),
    });
  }, [watchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ask for a store review right after an on-time arrival, when the rules allow.
  const activeId = active?.shift.id;
  useEffect(() => {
    if (!active || !trip.arrivedAt || trip.arrivedAt > active.shift.start) return;
    if (reviewState.counted.includes(active.shift.id)) return;
    const counted: StoredReviews = {
      ...reviewState,
      onTimeArrivals: reviewState.onTimeArrivals + 1,
      counted: [...reviewState.counted, active.shift.id].slice(-20),
    };
    const now = Date.now();
    const ask = reviews.available && shouldAskForReview(counted, now, trip.arrivedAt);
    setReviewState(ask ? { ...recordAsk(counted, now), counted: counted.counted } : counted);
    // Never both on one arrival: a review ask wins, otherwise maybe offer Pro.
    const lastOffer = storage.load('paywallAt', 0);
    const offer =
      !ask && purchases.available && !pro && counted.onTimeArrivals >= 2 && now - lastOffer > PAYWALL_EVERY;
    if (!ask && !offer) return;
    if (offer) storage.save('paywallAt', now);
    // Let the "Made it" screen land first.
    const id = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (ask) void reviews.request().catch(() => {});
      else setPaywall('arrival');
    }, 2500);
    return () => window.clearTimeout(id);
  }, [activeId, trip.arrivedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The nags for the next few plans, as if you never get off the couch.
  const nags = useMemo(() => {
    const out: ScheduledNag[] = [];
    for (const p of plans.filter((p) => p.destination).slice(0, NAG_AHEAD)) {
      if (trips[p.shift.id]?.leftAt !== undefined) continue;
      const route = estimateFor(p.destination!.location);
      if (!route) continue;
      const leave = planFor(p, route.estimate.minutes);
      const schedule = buildNagSchedule(p.shift.id, leave, {
        trafficAware: route.estimate.trafficAware,
        where: p.destination!.name,
        occasion: p.occasion,
        panic: unlocked,
      });
      out.push(...pendingNags(schedule, now));
    }
    return out.sort((a, b) => a.at - b.at).slice(0, MAX_PENDING);
  }, [plans, trips, estimateFor, planFor, now, unlocked]);

  // Only hand the device a new list when something actually changed.
  const nagKey = nags.map((n) => `${n.id}@${n.at}`).join('|');
  useEffect(() => {
    void notifications.schedule(nags);
  }, [nagKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    now,
    settings,
    update,
    plans,
    active,
    plan,
    phase,
    trip,
    estimate,
    origin,
    originIsLive,
    nags,
    location: fix,
    locationError,
    notificationPermission: permission,
    enableNotifications,
    testNag,
    markLeft,
    markArrived,
    resetTrip,
    refreshRoute,
    routeError,
    calendars: Object.fromEntries(
      settings.calendars.map((f) => {
        const cache = calendars[f.id]?.url === f.url ? calendars[f.id] : null;
        return [
          f.id,
          {
            fetchedAt: cache?.fetchedAt ?? null,
            error: calendarErrors[f.id] ?? '',
            syncing: syncing[f.id] ?? false,
            count: cache?.events.length ?? 0,
          },
        ];
      }),
    ),
    syncCalendar,
    device: {
      available: deviceCalendar.available,
      reminders: deviceCalendar.reminders,
      calendar: devicePermission.calendar,
      remindersPermission: devicePermission.reminders,
      count: deviceOn ? deviceEvents.events.length : 0,
      request: requestDevice,
    },
    serverWaking,
    passcodeRequired,
    passcodeOk,
    submitPasscode,
    firesWhenClosed: notifications.firesWhenClosed,
    backgroundLocation,
    requestBackgroundLocation,
    openSettings,
    onTimeArrivals: reviewState.onTimeArrivals,
    storeUrl: reviews.storeUrl,
    platformName: platform.name,
    pro: {
      unlocked,
      forSale: purchases.available,
      paywall,
      gate,
      close: () => setPaywall(null),
      options: () => purchases.options(),
      buy,
      restore,
    },
  };
}

function celebrate(trip: TripState, plan: LeavePlan, occasion: Occasion) {
  const onTime = trip.arrivedAt !== undefined && trip.arrivedAt <= plan.shiftStart;
  void notifications.showNow(TIER_TITLES.celebrate, celebrateMessage(occasion, onTime));
}

/** Forget trips older than two days. */
function pruneTrips(trips: Record<string, Trip>, now: number): Record<string, Trip> {
  return Object.fromEntries(
    Object.entries(trips).filter(([, t]) => (t.updatedAt ?? 0) > now - 2 * 86_400_000),
  );
}

/** Keep the 30 most recent routes. */
function pruneRoutes(routes: Record<string, RouteCache>): Record<string, RouteCache> {
  return Object.fromEntries(
    Object.entries(routes)
      .sort(([, a], [, b]) => b.fetchedAt - a.fetchedAt)
      .slice(0, 30),
  );
}
