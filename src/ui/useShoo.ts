import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api';
import {
  DEFAULT_SETTINGS,
  LATE_ARRIVAL,
  MESSAGES,
  MINUTE,
  TIER_TITLES,
  buildNagSchedule,
  computeLeavePlan,
  distanceMeters,
  parseIcs,
  pendingNags,
  phaseAt,
  updateTrip,
  upcomingShifts,
  type CalendarEvent,
  type LatLng,
  type LeavePlan,
  type Phase,
  type ScheduledNag,
  type Settings,
  type Shift,
  type TravelEstimate,
  type TripState,
} from '../core';
import { platform, type PermissionState, type TripEvent } from '../platform';

const { storage, notifications, location, trip: tripPort } = platform;

interface Trip extends TripState {
  /** Where you were when Shoo started watching for this shift. */
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

/** Re-check traffic this often when the leave time is close, and when it isn't. */
const ROUTE_FRESH_SOON = 5 * MINUTE;
const ROUTE_FRESH_LATER = 30 * MINUTE;
const CALENDAR_FRESH = 30 * MINUTE;
/** Keep showing "made it" this long after arriving. */
const CELEBRATE_FOR = 30 * MINUTE;
/** iOS allows 64 pending notifications. Leave room. */
const MAX_PENDING = 60;

export interface ShooState {
  now: number;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  shifts: Shift[];
  active: Shift | null;
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
  calendar: { fetchedAt: number | null; error: string; syncing: boolean; count: number };
  syncCalendar: () => void;
  serverWaking: boolean;
  passcodeRequired: boolean;
  passcodeOk: boolean;
  submitPasscode: (value: string) => Promise<string | null>;
  firesWhenClosed: boolean;
  /** Phone apps only: "granted" means Shoo can tell you left even when it's closed. */
  backgroundLocation: PermissionState | 'when-in-use';
  requestBackgroundLocation: () => Promise<void>;
  openSettings: () => Promise<void>;
}

export function useShoo(): ShooState {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...storage.load<Partial<Settings>>('settings', {}),
  }));
  const [now, setNow] = useState(Date.now());
  const [trips, setTrips] = useState<Record<string, Trip>>(() => storage.load('trips', {}));
  const [route, setRoute] = useState<RouteCache | null>(() => storage.load('route', null));
  const [routeError, setRouteError] = useState('');
  const [calendar, setCalendar] = useState<CalendarCache | null>(() => storage.load('calendar', null));
  const [calendarError, setCalendarError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [fix, setFix] = useState<LatLng | null>(null);
  const [locationError, setLocationError] = useState('');
  const [permission, setPermission] = useState<PermissionState>('prompt');
  const [backgroundLocation, setBackgroundLocation] = useState<PermissionState | 'when-in-use'>('unsupported');
  const [serverWaking, setServerWaking] = useState(false);
  const [passcodeRequired, setPasscodeRequired] = useState(false);
  const [passcodeOk, setPasscodeOk] = useState(true);

  useEffect(() => storage.save('settings', settings), [settings]);
  useEffect(() => storage.save('trips', pruneTrips(trips, now)), [trips]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => storage.save('route', route), [route]);
  useEffect(() => storage.save('calendar', calendar), [calendar]);

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
  }, []);
  const requestBackgroundLocation = useCallback(async () => {
    setBackgroundLocation(await tripPort.requestBackground());
  }, []);
  const openSettings = useCallback(() => tripPort.openSettings(), []);
  const enableNotifications = useCallback(async () => {
    setPermission(await notifications.request());
  }, []);
  const testNag = useCallback(async () => {
    const lines = MESSAGES.serious;
    await notifications.showNow(TIER_TITLES.serious, lines[Math.floor(Math.random() * lines.length)].text);
  }, []);

  // Location: only once there's a job to measure against.
  const hasJob = settings.job !== null;
  useEffect(() => {
    if (!hasJob) return;
    return location.watch(
      (f) => {
        setFix(f);
        setLocationError('');
      },
      setLocationError,
    );
  }, [hasJob]);

  // Calendar.
  const syncCalendar = useCallback(() => {
    const url = settings.calendarUrl.trim();
    if (!url) {
      setCalendar(null);
      return;
    }
    setSyncing(true);
    setCalendarError('');
    api
      .fetchCalendar(url)
      .then((text) => {
        const t = Date.now();
        setCalendar({ url, events: parseIcs(text, t - 86_400_000, t + 14 * 86_400_000), fetchedAt: t });
      })
      .catch((e: Error) => setCalendarError(e.message))
      .finally(() => setSyncing(false));
  }, [settings.calendarUrl]);

  useEffect(() => setCalendarError(''), [settings.calendarUrl]);
  useEffect(() => {
    if (!settings.calendarUrl || !passcodeOk) return;
    if (calendar?.url === settings.calendarUrl && now - calendar.fetchedAt < CALENDAR_FRESH) return;
    if (syncing || calendarError) return;
    syncCalendar();
  }, [settings.calendarUrl, calendar, now, syncing, calendarError, passcodeOk, syncCalendar]);

  // Which shift are we getting you to?
  const events = calendar?.url === settings.calendarUrl ? calendar.events : [];
  const shifts = useMemo(() => upcomingShifts(settings, events, now), [settings, events, now]);
  const active =
    shifts.find((s) => {
      const arrivedAt = trips[s.id]?.arrivedAt;
      return arrivedAt === undefined || now - arrivedAt < CELEBRATE_FOR;
    }) ?? null;
  const trip: Trip = (active && trips[active.id]) || {};

  const originIsLive = !trip.origin && fix !== null;
  const origin = trip.origin ?? fix ?? settings.home?.location ?? null;
  const job = settings.job?.location ?? null;

  const routeMatches =
    route !== null && job !== null && origin !== null &&
    route.mode === settings.travelMode &&
    distanceMeters(route.to, job) < 50 &&
    distanceMeters(route.from, origin) < 300;
  const estimate = routeMatches ? route.estimate : null;

  const plan = useMemo(
    () =>
      active && estimate
        ? computeLeavePlan({
            shiftStart: active.start,
            travelMinutes: estimate.minutes,
            prepMinutes: settings.prepMinutes,
            arriveEarlyMinutes: settings.arriveEarlyMinutes,
          })
        : null,
    [active, estimate, settings.prepMinutes, settings.arriveEarlyMinutes],
  );
  const phase = plan ? phaseAt(now, plan, trip) : null;

  // Traffic: refresh when stale, more often as the leave time gets close.
  const routing = useRef(false);
  const lastAttempt = useRef(0);
  const refreshRoute = useCallback(() => {
    if (!origin || !job || routing.current || !passcodeOk) return;
    routing.current = true;
    lastAttempt.current = Date.now();
    setRouteError('');
    const departAt = plan && plan.leaveAt > Date.now() ? plan.leaveAt : undefined;
    api
      .travelTime(origin, job, settings.travelMode, departAt)
      .then((estimate) =>
        setRoute({ estimate, from: origin, to: job, mode: settings.travelMode, fetchedAt: Date.now() }),
      )
      .catch((e: Error) => setRouteError(e.message))
      .finally(() => {
        routing.current = false;
      });
  }, [origin, job, settings.travelMode, plan, passcodeOk]);

  useEffect(() => {
    if (!active || !origin || !job || trip.leftAt !== undefined) return;
    const soon = plan ? now > plan.getReadyAt - 2 * 60 * MINUTE : false;
    const maxAge = soon ? ROUTE_FRESH_SOON : ROUTE_FRESH_LATER;
    const stale = !routeMatches || now - route!.fetchedAt > maxAge;
    if (stale && Date.now() - lastAttempt.current > 60_000) refreshRoute();
  }, [active, origin, job, trip.leftAt, plan, now, routeMatches, route, refreshRoute]);

  // Did you leave? Did you make it?
  const setTrip = useCallback(
    (id: string, next: Trip) => setTrips((t) => ({ ...t, [id]: { ...next, updatedAt: Date.now() } })),
    [],
  );
  useEffect(() => {
    if (!active || !plan || !job || !fix) return;
    const current = trips[active.id] ?? {};
    const watchedOrigin = current.origin ?? fix;
    const { trip: next, event } = updateTrip(current, plan, watchedOrigin, job, fix, Date.now());
    const withOrigin: Trip = { ...next, origin: watchedOrigin };
    if (event || (!current.origin && Date.now() >= plan.getReadyAt - 30 * MINUTE)) setTrip(active.id, withOrigin);
    if (event === 'left') void tripPort.markLeft();
    // On phones the work geofence sends the celebration itself.
    if (event === 'arrived' && !tripPort.native) celebrate(next, plan);
  }, [fix]); // eslint-disable-line react-hooks/exhaustive-deps

  const markLeft = useCallback(() => {
    if (!active) return;
    setTrip(active.id, { ...trip, leftAt: Date.now() });
    void tripPort.markLeft();
  }, [active, trip, setTrip]);
  const markArrived = useCallback(() => {
    if (!active) return;
    const next = { ...trip, leftAt: trip.leftAt ?? Date.now(), arrivedAt: Date.now() };
    setTrip(active.id, next);
    void tripPort.clear();
    if (plan) celebrate(next, plan);
  }, [active, trip, plan, setTrip]);
  const resetTrip = useCallback(() => {
    if (!active) return;
    setTrip(active.id, {});
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

  // Phone apps: hand the native side the geofences for the shift we're watching.
  const watchKey =
    active && plan && job && origin && trip.arrivedAt === undefined
      ? `${active.id}|${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}|${trip.leftAt ?? ''}|${plan.getReadyAt}`
      : '';
  useEffect(() => {
    if (!tripPort.native || !watchKey || !active || !plan || !job || !origin) return;
    void tripPort.watch({
      shiftId: active.id,
      shiftStart: active.start,
      watchFrom: plan.getReadyAt - 30 * MINUTE,
      origin,
      job,
      radius: 150,
      celebrateTitle: TIER_TITLES.celebrate,
      onTimeBody: MESSAGES.celebrate[0].text,
      lateBody: LATE_ARRIVAL,
    });
  }, [watchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The nags for the next few shifts, as if you never get off the couch.
  const nags = useMemo(() => {
    if (!estimate) return [];
    const out: ScheduledNag[] = [];
    for (const s of shifts.slice(0, 4)) {
      if (trips[s.id]?.leftAt !== undefined) continue;
      const p = computeLeavePlan({
        shiftStart: s.start,
        travelMinutes: estimate.minutes,
        prepMinutes: settings.prepMinutes,
        arriveEarlyMinutes: settings.arriveEarlyMinutes,
      });
      out.push(...pendingNags(buildNagSchedule(s.id, p, { trafficAware: estimate.trafficAware }), now));
    }
    return out.slice(0, MAX_PENDING);
  }, [shifts, trips, estimate, settings.prepMinutes, settings.arriveEarlyMinutes, now]);

  // Only hand the device a new list when something actually changed.
  const nagKey = nags.map((n) => `${n.id}@${n.at}`).join('|');
  useEffect(() => {
    void notifications.schedule(nags);
  }, [nagKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    now,
    settings,
    update,
    shifts,
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
    calendar: {
      fetchedAt: calendar?.url === settings.calendarUrl ? calendar.fetchedAt : null,
      error: calendarError,
      syncing,
      count: events.length,
    },
    syncCalendar,
    serverWaking,
    passcodeRequired,
    passcodeOk,
    submitPasscode,
    firesWhenClosed: notifications.firesWhenClosed,
    backgroundLocation,
    requestBackgroundLocation,
    openSettings,
  };
}

function celebrate(trip: TripState, plan: LeavePlan) {
  const onTime = trip.arrivedAt !== undefined && trip.arrivedAt <= plan.shiftStart;
  void notifications.showNow(TIER_TITLES.celebrate, onTime ? MESSAGES.celebrate[0].text : LATE_ARRIVAL);
}

/** Forget trips older than two days. */
function pruneTrips(trips: Record<string, Trip>, now: number): Record<string, Trip> {
  return Object.fromEntries(
    Object.entries(trips).filter(([, t]) => (t.updatedAt ?? 0) > now - 2 * 86_400_000),
  );
}
