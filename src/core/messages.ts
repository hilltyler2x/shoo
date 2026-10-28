import type { NagTier } from './types';

/** Numbers a message can drop in. Every value is in whole minutes. */
export interface MessageContext {
  /** Travel time to work. */
  travel: number;
  /** Minutes until the shift starts. */
  untilStart: number;
  /** Minutes until you should leave (0 once it's time). */
  leaveIn: number;
  trafficAware: boolean;
}

interface Message {
  text: string;
  /** Only use this line when it would be true. */
  when?: (ctx: MessageContext) => boolean;
}

export const TIER_TITLES: Record<NagTier, string> = {
  gentle: 'Shoo 👟',
  serious: 'Shoo. Seriously.',
  panic: '🚨 SHOO 🚨',
  celebrate: 'Made it 🏆',
};

export const MESSAGES: Record<NagTier, Message[]> = {
  gentle: [
    { text: 'Hey, you might wanna start putting your shoes on 👟' },
    {
      text: "Traffic's looking a little spicy. Leave in {leaveIn} and you're golden.",
      when: (c) => c.trafficAware && c.leaveIn > 0,
    },
    { text: "Leave in {leaveIn} and you're golden.", when: (c) => !c.trafficAware && c.leaveIn > 0 },
    { text: "Your job called. Okay, they didn't. But they will if you're late." },
  ],
  serious: [
    { text: 'Shoo. Shoo. SHOO. 🚪' },
    {
      text: "You're {travel} minutes away and you start in {untilStart}. Do the math, superstar.",
      when: (c) => c.untilStart > 0,
    },
    { text: 'That couch is not your coworker. Get up.' },
    { text: 'If you leave right now, nobody ever has to know.' },
  ],
  panic: [
    { text: "Okay we're in 'run to the car' territory now 🏃" },
    { text: "Your manager is about to say 'nice of you to join us.' Don't let that happen." },
    { text: 'Last chance before I start texting your mama.' },
    { text: "I've been asking nicely. This is me not asking nicely anymore. LEAVE." },
  ],
  celebrate: [{ text: 'Look at you, on time like a responsible adult 🏆' }],
};

/** Shown when you get there, but after the shift started. */
export const LATE_ARRIVAL = "You made it. Not on time, but you made it. Tomorrow we try again. 🫠";

export function fill(text: string, ctx: MessageContext): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in ctx ? String(ctx[key as keyof MessageContext]) : whole,
  );
}

/** Lines of a tier that make sense right now, in order. */
export function usableMessages(tier: NagTier, ctx: MessageContext): string[] {
  return MESSAGES[tier].filter((m) => !m.when || m.when(ctx)).map((m) => fill(m.text, ctx));
}
