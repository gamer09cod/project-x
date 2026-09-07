import type {ScorePayload, SubmitScoreResponse} from '@project-x/shared';

export type ResultEntry = {
  submit: SubmitScoreResponse;
  payload: ScorePayload;
  recordedAtMs: number;
};

export function isPendingResult(submit: SubmitScoreResponse): boolean {
  return (
    submit.outcome === 'scored_open' ||
    submit.outcome === 'scored_waiting_opponent' ||
    submit.outcome === 'streak_leg_cleared'
  );
}

export function acceptedScoreOf(submit: SubmitScoreResponse): number | null {
  if (submit.outcome === 'ignored_deadline') {
    return null;
  }
  return submit.acceptedScore;
}

export function resultTitle(submit: SubmitScoreResponse): string {
  switch (submit.outcome) {
    case 'scored_open':
      return 'Waiting for opponent';
    case 'scored_waiting_opponent':
      return 'Opponent playing';
    case 'streak_leg_cleared':
      return `Leg ${submit.legCleared} cleared`;
    case 'settled':
      if (submit.result === 'win') {
        return 'Win';
      }
      if (submit.result === 'loss') {
        return 'Loss';
      }
      return 'Draw';
    case 'streak_resolved':
      return submit.streakStatus === 'won' ? 'Streak won' : 'Streak ended';
    case 'ignored_deadline':
      return 'Late submit';
    default:
      return 'Result';
  }
}

export function prependResult(
  list: ResultEntry[],
  entry: ResultEntry,
): ResultEntry[] {
  const id = entry.submit.matchId;
  const rest = list.filter(item => item.submit.matchId !== id);
  return [entry, ...rest].slice(0, 40);
}
