import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {colors, radii} from '../../theme';
import {formatCentsDisplay} from '../../lib/formatMoney';
import {
  acceptedScoreOf,
  isPendingResult,
  resultTitle,
  type ResultEntry,
} from './resultHistory';

type Props = {
  entries: ResultEntry[];
  onOpen: (entry: ResultEntry) => void;
};

export function ResultsTabScreen({entries, onOpen}: Props): React.JSX.Element {
  const pending = entries.filter(e => isPendingResult(e.submit));
  const submitted = entries.filter(e => !isPendingResult(e.submit));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Results</Text>
      <Text style={styles.hint}>Scores from this session · server accepted score is final</Text>

      <Text style={styles.section}>Pending</Text>
      {pending.length === 0 ? (
        <Text style={styles.empty}>No open matches waiting.</Text>
      ) : (
        pending.map(entry => (
          <ResultRow key={`${entry.submit.matchId}-p`} entry={entry} onOpen={onOpen} />
        ))
      )}

      <Text style={styles.section}>Submitted</Text>
      {submitted.length === 0 ? (
        <Text style={styles.empty}>Play a match to see settled scores here.</Text>
      ) : (
        submitted.map(entry => (
          <ResultRow key={`${entry.submit.matchId}-s`} entry={entry} onOpen={onOpen} />
        ))
      )}
    </ScrollView>
  );
}

function ResultRow({
  entry,
  onOpen,
}: {
  entry: ResultEntry;
  onOpen: (entry: ResultEntry) => void;
}): React.JSX.Element {
  const accepted = acceptedScoreOf(entry.submit);
  const claimed = entry.payload.score;
  const payout =
    entry.submit.outcome === 'settled' || entry.submit.outcome === 'streak_resolved'
      ? formatCentsDisplay(entry.submit.payoutCents)
      : null;

  return (
    <Pressable style={styles.card} onPress={() => onOpen(entry)}>
      <Text style={styles.cardTitle}>{resultTitle(entry.submit)}</Text>
      <Text style={styles.cardMeta}>
        Claimed {claimed}
        {accepted != null ? ` · Accepted ${accepted}` : ''}
      </Text>
      {payout ? <Text style={styles.payout}>{payout}</Text> : null}
      <Text style={styles.id}>
        {entry.submit.matchId.slice(0, 8)} ·{' '}
        {new Date(entry.recordedAtMs).toLocaleTimeString()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.bg},
  content: {paddingHorizontal: 16, paddingBottom: 24, gap: 8},
  title: {color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 4},
  hint: {color: colors.textTertiary, fontSize: 12, marginBottom: 8},
  section: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  empty: {color: colors.textMuted, fontSize: 13, marginBottom: 4},
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  cardTitle: {color: colors.textPrimary, fontWeight: '800', fontSize: 16},
  cardMeta: {color: colors.textMuted, fontSize: 13},
  payout: {color: colors.cash, fontWeight: '700', fontSize: 15},
  id: {color: colors.textTertiary, fontSize: 11, marginTop: 2},
});
