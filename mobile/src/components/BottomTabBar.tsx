import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {colors} from '../theme';
import {Glyph, type GlyphName} from './Glyph';

export type TabId = 'results' | 'leagues' | 'play' | 'boost' | 'profile';

type Props = {
  active: TabId;
  boostCount?: number;
  onChange: (tab: TabId) => void;
};

const TABS: {id: TabId; label: string; glyph: GlyphName}[] = [
  {id: 'results', label: 'Results', glyph: 'trophy'},
  {id: 'leagues', label: 'Leagues', glyph: 'crown'},
  {id: 'play', label: 'Play', glyph: 'gamepad'},
  {id: 'boost', label: 'Boost', glyph: 'rocket'},
  {id: 'profile', label: 'Profile', glyph: 'user'},
];

export function BottomTabBar({
  active,
  boostCount = 0,
  onChange,
}: Props): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {TABS.map(tab => {
        const on = tab.id === active;
        const color = on ? colors.textPrimary : colors.textTertiary;
        return (
          <Pressable
            key={tab.id}
            style={styles.item}
            onPress={() => onChange(tab.id)}>
            <View>
              <Glyph name={tab.glyph} size={18} color={color} />
              {tab.id === 'boost' && boostCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{boostCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, {color}]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    paddingBottom: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textPrimary,
    fontSize: 9,
    fontWeight: '800',
  },
});
