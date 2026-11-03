import { Capacitor } from '@capacitor/core';
import { PACKAGE_TYPE, Purchases, type CustomerInfo, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import type { ProOption, PurchasesPort } from '../ports';

/** RevenueCat's public SDK keys (Project settings → API keys). Safe to ship; they can't change anything. */
const KEY =
  Capacitor.getPlatform() === 'ios'
    ? (import.meta.env.VITE_REVENUECAT_IOS_KEY ?? '')
    : (import.meta.env.VITE_REVENUECAT_ANDROID_KEY ?? '');

/** The entitlement set up in RevenueCat that every Pro product unlocks. */
const ENTITLEMENT = 'pro';

const isPro = (info: CustomerInfo) => info.entitlements.active[ENTITLEMENT] !== undefined;

let ready: Promise<void> | null = null;
const configure = () => (ready ??= Purchases.configure({ apiKey: KEY }));

const packages = new Map<string, PurchasesPackage>();

const KIND: Partial<Record<PACKAGE_TYPE, ProOption['kind']>> = {
  [PACKAGE_TYPE.MONTHLY]: 'monthly',
  [PACKAGE_TYPE.ANNUAL]: 'annual',
  [PACKAGE_TYPE.LIFETIME]: 'lifetime',
};

function introText(p: PurchasesPackage): string | null {
  const unitName = (unit: string, n: number) => `${unit.toLowerCase().replace(/s$/, '')}${n === 1 ? '' : 's'}`;
  const intro = p.product.introPrice;
  if (intro) {
    if (intro.price === 0) return `${intro.periodNumberOfUnits}-${unitName(intro.periodUnit, 1)} free trial`;
    return `${intro.priceString}/${unitName(intro.periodUnit, 1)} for ${intro.cycles} ${unitName(intro.periodUnit, intro.cycles)}`;
  }
  // Google Play keeps intro prices on the subscription option instead.
  const option = p.product.defaultOption;
  if (option?.freePhase) {
    const period = option.freePhase.billingPeriod;
    return `${period.value}-${unitName(period.unit, 1)} free trial`;
  }
  if (option?.introPhase) {
    const phase = option.introPhase;
    const cycles = phase.billingCycleCount ?? 1;
    return `${phase.price.formatted}/${unitName(phase.billingPeriod.unit, 1)} for ${cycles} ${unitName(phase.billingPeriod.unit, cycles)}`;
  }
  return null;
}

export const nativePurchases: PurchasesPort = {
  available: KEY !== '',
  async isPro() {
    await configure();
    return isPro((await Purchases.getCustomerInfo()).customerInfo);
  },
  async options() {
    await configure();
    const current = (await Purchases.getOfferings()).current;
    const out: ProOption[] = [];
    for (const p of current?.availablePackages ?? []) {
      const kind = KIND[p.packageType];
      if (!kind) continue;
      packages.set(p.identifier, p);
      out.push({ id: p.identifier, kind, price: p.product.priceString, intro: introText(p) });
    }
    return out;
  },
  async buy(id) {
    await configure();
    const aPackage = packages.get(id);
    if (!aPackage) throw new Error('That option is gone. Close this and try again.');
    try {
      return isPro((await Purchases.purchasePackage({ aPackage })).customerInfo);
    } catch (e) {
      if ((e as { userCancelled?: boolean }).userCancelled) return false;
      throw e;
    }
  },
  async restore() {
    await configure();
    return isPro((await Purchases.restorePurchases()).customerInfo);
  },
  onChange(fn) {
    let id: string | null = null;
    let stopped = false;
    void configure()
      .then(() => Purchases.addCustomerInfoUpdateListener((info) => fn(isPro(info))))
      .then((callbackId) => {
        id = callbackId;
        if (stopped) void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id });
      });
    return () => {
      stopped = true;
      if (id) void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: id });
    };
  },
};
