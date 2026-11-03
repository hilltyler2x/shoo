import type { NagTier, PlaceKind } from './types';

export type Occasion =
  | 'work'
  | 'school'
  | 'gym'
  | 'doctor'
  | 'dentist'
  | 'flight'
  | 'date'
  | 'dinner'
  | 'party'
  | 'interview'
  | 'church'
  | 'pickup'
  | 'other';

/** Numbers a message can drop in. Every value is in whole minutes. */
export interface MessageContext {
  /** Travel time there. */
  travel: number;
  /** Minutes until it starts. */
  untilStart: number;
  /** Minutes until you should leave (0 once it's time). */
  leaveIn: number;
  trafficAware: boolean;
  /** Where you're going, as you named it ("Work", "Planet Fitness"). */
  where: string;
  occasion: Occasion;
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

interface OccasionLines {
  label: string;
  icon: string;
  /** Two each, mixed in between the lines every occasion shares. */
  gentle: [string, string];
  serious: [string, string];
  panic: [string, string];
  celebrate: string;
  late: string;
}

const ON_TIME = 'Look at you, on time like a responsible adult 🏆';
const LATE = "You made it. Not on time, but you made it. Next time we try again. 🫠";

export const OCCASIONS: Record<Occasion, OccasionLines> = {
  work: {
    label: 'Work',
    icon: '💼',
    gentle: ["Your job called. Okay, they didn't. But they will if you're late.", 'Badge, keys, lunch. Clock-in time is closer than you think ⏰'],
    serious: ['That couch is not your coworker. Get up.', "Your coworkers are already there. Don't make them cover for you."],
    panic: ["Your manager is about to say 'nice of you to join us.' Don't let that happen.", 'Clocking in late is a whole conversation. Skip the conversation.'],
    celebrate: ON_TIME,
    late: "You made it. Not on time, but you made it. Tomorrow we try again. 🫠",
  },
  school: {
    label: 'School',
    icon: '🎓',
    gentle: ['Backpack. Shoes. Brain. Grab at least two of those 🎒', 'Class starts soon. The good seats go first.'],
    serious: ["The bell doesn't care about your excuses. Move.", 'Your attendance record is watching you.'],
    panic: ['Walking in late means everyone turns around and stares. EVERYONE. 👀', "Pop quiz: what happens if you don't leave right now? Wrong answer. GO."],
    celebrate: "On time for class. Teacher's pet energy 🍎",
    late: 'You made it. Slide in quietly and act like you were always there. 🫠',
  },
  gym: {
    label: 'Gym',
    icon: '🏋️',
    gentle: ['Gym bag packed? Water bottle? Your excuses are not invited 💪', 'Warm-up starts at the front door.'],
    serious: ["Those gains aren't going to make themselves. Up.", 'Skipping leg day starts with skipping the drive.'],
    panic: ["At this rate the only thing you're lifting is the remote. GO.", 'Your workout buddy is doing your reps AND judging you.'],
    celebrate: 'Made it to the gym. That counts as a rep 🏋️',
    late: 'Late to the gym is still at the gym. Proud of you. 🫠',
  },
  doctor: {
    label: 'Doctor',
    icon: '🩺',
    gentle: ['Find your insurance card now so you\'re not digging for it later 🩺', "Write down the thing you'll forget to ask. Then shoes."],
    serious: ["Doctors run late. You don't get to. Go.", "There's paperwork. There's always paperwork. Leave now."],
    panic: ["Miss this and you're rebooking for sometime next spring. MOVE.", "The front desk is about to say 'we may have to reschedule.' RUN."],
    celebrate: "On time for the doctor. Rarest thing they'll see all day 🏆",
    late: "You made it. Smile at the front desk like nothing happened. 🫠",
  },
  dentist: {
    label: 'Dentist',
    icon: '🦷',
    gentle: ["Brush your teeth now. They'll know if you didn't 🦷", 'Floss once so you can honestly say you floss.'],
    serious: ['The dentist chair is waiting. So is the tiny mirror.', 'Leave now or the drill starts without you. Okay, it doesn\'t. Still, go.'],
    panic: ['Late to the dentist is how you get lectured about flossing AND punctuality.', 'Your hygienist is sharpening the scraper. Slowly. GO.'],
    celebrate: 'On time and fresh breath. Flawless 🦷',
    late: "You made it. Open wide and don't mention the time. 🫠",
  },
  flight: {
    label: 'Flight',
    icon: '✈️',
    gentle: ['Passport. ID. Charger. Pat your pockets ✈️', 'Check in on your phone now. Future you says thanks.'],
    serious: ["Security lines don't care that you're 'basically there.' Leave.", "Your bag isn't going to check itself."],
    panic: ['The plane leaves with or without you. Currently: without you. 🏃', "You're about to hear your name on the airport speakers. Not in a good way."],
    celebrate: 'Made it. Go buy that overpriced airport coffee ✈️',
    late: 'You made it. Hope the gate agent is in a good mood. 🫠',
  },
  date: {
    label: 'Date',
    icon: '❤️',
    gentle: ['Start getting cute 💅', 'Mints. Charger. Confidence. In that order.'],
    serious: ['Being fashionably late is a myth. Go.', "First impressions don't wait in traffic."],
    panic: ["Your date is staring at the door. Every time it opens, it's not you. 💔", "They're about to text 'here!' and you're still home. LEAVE."],
    celebrate: 'On time for the date. Already winning ❤️',
    late: 'You made it. Lead with a sorry and a compliment. 🫠',
  },
  dinner: {
    label: 'Dinner',
    icon: '🍽️',
    gentle: ['Your table is not going to hold itself forever 🍽️', 'Wear the stretchy pants. Then leave.'],
    serious: ["Restaurants give away tables. Don't be the reason.", 'Everyone else is already looking at the menu.'],
    panic: ["They're about to give your table to people who showed up. LEAVE.", "The appetizers are getting eaten. Without you. Think about that."],
    celebrate: 'On time for dinner. Order dessert, you earned it 🍰',
    late: "You made it. Order fast and act like it's on purpose. 🫠",
  },
  party: {
    label: 'Party',
    icon: '🎉',
    gentle: ['Outfit check. Then shoes 🎉', 'Did you get a gift? A card? A bag of chips counts.'],
    serious: ["Fashionably late is cute. After the cake isn't.", 'The playlist is getting good without you.'],
    panic: ["They're cutting the cake without you. I'm not kidding. 🎂", "Everyone's going to ask 'where were you?' all night. GO."],
    celebrate: "You made it! Party's officially started 🎉",
    late: "You made it. The party's still going. Probably. 🫠",
  },
  interview: {
    label: 'Interview',
    icon: '👔',
    gentle: ['Resume, nice shirt, practice your "greatest weakness" 👔', 'Look up the parking now, not in the parking lot.'],
    serious: ["Being late is a terrible answer to 'tell me about yourself.' Go.", 'Ten minutes early is on time. On time is late. Leave.'],
    panic: ["Your greatest weakness is about to be 'showing up.' MOVE.", 'Another candidate is shaking their hand right now. RUN.'],
    celebrate: 'On time for the interview. Already better than half the candidates 💼',
    late: "You made it. Smile, sit up, don't mention the traffic. 🫠",
  },
  church: {
    label: 'Church',
    icon: '🙏',
    gentle: ['Sunday best on. Shoes too 🙏', 'Find the good parking before everyone else does.'],
    serious: ["Thou shalt not be late. Pretty sure that's in there somewhere.", 'The front pews fill up. Then the middle. Go.'],
    panic: ['Only a miracle gets you there on time now. Start walking toward one. 🙏', "Grandma's saving you a seat and losing patience. LEAVE."],
    celebrate: 'On time for church. Blessed and punctual 🙏',
    late: 'You made it. Slip into the back row, nobody saw. 🫠',
  },
  pickup: {
    label: 'Pickup',
    icon: '🚸',
    gentle: ['Little humans are waiting soon. Find your keys 🚸', 'Snacks in the car? Snacks fix everything.'],
    serious: ['Your kid is about to be the last one standing at pickup. Go.', 'The pickup line is forming without you.'],
    panic: ['The teacher is giving you THE look from here. LEAVE. 🚸', "Your kid is telling everyone you forgot them. You didn't. Prove it."],
    celebrate: 'On time for pickup. Parent of the year 🏆',
    late: 'You made it. Snacks fix everything. 🫠',
  },
  other: {
    label: 'Plan',
    icon: '📍',
    gentle: ["{where} called. Okay, they didn't. But they will if you're late.", "Phone, keys, wallet. You know the drill."],
    serious: ['That couch is not coming with you. Get up.', "Whatever you're doing right now can wait. Go."],
    panic: ["Somebody's about to say 'nice of you to join us.' Don't let that happen.", "This is the part where you grab your keys and RUN."],
    celebrate: ON_TIME,
    late: LATE,
  },
};

/** "You start in" for things you're on the schedule for, "it starts in" for everything else. */
const YOU_START: Occasion[] = ['work', 'school', 'interview'];

/** Where the occasion's own first or second line goes. */
interface Slot {
  slot: 0 | 1;
}

type LadderTier = 'gentle' | 'serious' | 'panic';

/**
 * Every tier mixes the lines everyone gets with two that fit the occasion.
 * The order is the order they're used in.
 */
const LADDER: Record<LadderTier, (Message | Slot)[]> = {
  gentle: [
    { text: 'Hey, you might wanna start putting your shoes on 👟' },
    {
      text: "Traffic's looking a little spicy. Leave in {leaveIn} and you're golden.",
      when: (c) => c.trafficAware && c.leaveIn > 0,
    },
    { text: "Leave in {leaveIn} and you're golden.", when: (c) => !c.trafficAware && c.leaveIn > 0 },
    { slot: 0 },
    { slot: 1 },
  ],
  serious: [
    { text: 'Shoo. Shoo. SHOO. 🚪' },
    {
      text: "You're {travel} minutes away and you start in {untilStart}. Do the math, superstar.",
      when: (c) => c.untilStart > 0 && YOU_START.includes(c.occasion),
    },
    {
      text: "You're {travel} minutes away and it starts in {untilStart}. Do the math, superstar.",
      when: (c) => c.untilStart > 0 && !YOU_START.includes(c.occasion),
    },
    { slot: 0 },
    { text: 'If you leave right now, nobody ever has to know.' },
    { slot: 1 },
  ],
  panic: [
    { text: "Okay we're in 'run to the car' territory now 🏃" },
    { slot: 0 },
    { text: 'Last chance before I start texting your mama.' },
    { slot: 1 },
    { text: "I've been asking nicely. This is me not asking nicely anymore. LEAVE." },
  ],
};

export function fill(text: string, ctx: MessageContext): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in ctx ? String(ctx[key as keyof MessageContext]) : whole,
  );
}

/** Lines of a tier that make sense right now, in order. */
export function usableMessages(tier: NagTier, ctx: MessageContext): string[] {
  if (tier === 'celebrate') return [fill(OCCASIONS[ctx.occasion].celebrate, ctx)];
  return LADDER[tier]
    .map((m): Message => ('slot' in m ? { text: OCCASIONS[ctx.occasion][tier][m.slot] } : m))
    .filter((m) => !m.when || m.when(ctx))
    .map((m) => fill(m.text, ctx));
}

export function celebrateMessage(occasion: Occasion, onTime: boolean): string {
  return onTime ? OCCASIONS[occasion].celebrate : OCCASIONS[occasion].late;
}

/** Kept for code that doesn't know the occasion. */
export const LATE_ARRIVAL = LATE;

const OCCASION_WORDS: [Occasion, RegExp][] = [
  ['interview', /\binterview/],
  ['flight', /\b(flight|flights|fly|flying|airport|boarding|airlines?|layover)\b|✈/],
  ['dentist', /\b(dentist|dental|orthodont\w*|teeth|tooth)\b/],
  ['pickup', /\b(pick ?up|drop ?off|daycare|carpool|school run)\b/],
  ['doctor', /\b(doctor|dr\.?|appointment|appt|clinic|hospital|check ?up|physical|therap\w*|pharmacy|vet|optometrist|eye exam)\b/],
  ['school', /\b(class|classes|school|lecture|exam|campus|tutor\w*|seminar|college|university)\b/],
  ['church', /\b(church|mass|worship|temple|mosque|synagogue|bible study|sermon)\b/],
  ['date', /\b(date night|date|anniversary)\b|❤|💕/],
  ['dinner', /\b(dinner|lunch|brunch|breakfast|reservation|restaurant|coffee|drinks|happy hour)\b/],
  ['party', /\b(party|birthday|bday|wedding|shower|celebration|bbq|cookout|game night|concert|show)\b|🎉|🎂/],
  ['gym', /\b(gym|workout|work out|yoga|pilates|crossfit|spin|run club|lifting|training|practice|fitness)\b/],
  ['work', /\b(work|shift|job|office|meeting|standup|clock ?in)\b/],
];

const KIND_OCCASION: Record<PlaceKind, Occasion> = {
  work: 'work',
  school: 'school',
  gym: 'gym',
  doctor: 'doctor',
  airport: 'flight',
  social: 'party',
  other: 'other',
};

/** What kind of thing this is, from its name and where it is. Words in the title win. */
export function detectOccasion(title: string, placeName = '', kind: PlaceKind = 'other'): Occasion {
  for (const text of [title, placeName]) {
    const t = text.toLowerCase();
    for (const [occasion, words] of OCCASION_WORDS) if (words.test(t)) return occasion;
  }
  return KIND_OCCASION[kind];
}
