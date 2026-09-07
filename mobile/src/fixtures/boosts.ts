export type BoostMode = '1v1' | 'blitz';

export type BoostFixture = {
  id: string;
  title: string;
  gameName: string;
  percentLabel: string;
  mode: BoostMode;
  maxWagerLabel: string;
  timerLabel: string;
  gamesLabel: string;
};

export type OfferFixture = {
  id: string;
  title: string;
  body: string;
  code: string;
};

export const OFFER_FIXTURES: OfferFixture[] = [
  {
    id: 'invite',
    title: 'Invite a friend, both get…',
    body: 'Get up to $50 when your friend installs. No deposit necessary.',
    code: 'CWQMKPA',
  },
  {
    id: 'weekend',
    title: 'Weekend prize boosts',
    body: 'Activate a boost before you play. Payouts are always decided on the server.',
    code: 'WEEKEND',
  },
  {
    id: 'any',
    title: 'Any-game preview',
    body: 'Catalog chrome only. Paid matches still use basketball_v1.',
    code: 'HOOPS',
  },
];

export const BOOST_FIXTURES: BoostFixture[] = [
  {
    id: 'b1',
    title: '200% Prize Boost',
    gameName: 'Basketball',
    percentLabel: '200%',
    mode: '1v1',
    maxWagerLabel: '$1 Max Wager',
    timerLabel: '10h 23m 59s',
    gamesLabel: '1 Game',
  },
  {
    id: 'b2',
    title: '200% Prize Boost',
    gameName: 'Basketball',
    percentLabel: '200%',
    mode: 'blitz',
    maxWagerLabel: '$1 Max Wager',
    timerLabel: '10h 23m 59s',
    gamesLabel: '1 Game',
  },
  {
    id: 'b3',
    title: '50% Prize Boost',
    gameName: 'Any Game',
    percentLabel: '50%',
    mode: '1v1',
    maxWagerLabel: '$1 Max Wager',
    timerLabel: '10h 23m 20s',
    gamesLabel: '1 Game',
  },
];

export const PRIZE_BOOST_BODY =
  'When active, a boost will automatically apply the next time you play a game. It can only be used to play the game shown, and only for the specified game mode.\n\nWhen you activate a "Prize Boost", your payout if you win will be increased by the percentage shown in the boost.';
