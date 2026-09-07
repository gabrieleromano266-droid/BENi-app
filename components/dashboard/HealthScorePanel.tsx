/**
 * Home Health Score — a circular ring showing the overall score; tapping it
 * expands a per-system breakdown (bar + score per home system) plus a "start
 * here" callout naming the lowest-scoring system's top open issue.
 *
 * Adapted from demo.html's hover tooltip: rather than an absolutely-positioned
 * floating popover (fragile across phone/web/desktop widths in React Native),
 * the breakdown expands inline beneath the ring within the same card.
 */
import Card from '@/components/Card';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { SystemScore } from '@/utils/healthScore';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 168;
const STROKE_WIDTH = 14;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Props = {
  overall: number;
  bySystem: SystemScore[];
  startHere: { title: string; systemLabel: string } | null;
};

/** Per-system breakdown bar color (unchanged thresholds). */
function scoreColor(score: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (score >= 85) return colors.success;
  if (score >= 65) return colors.warning;
  return colors.danger;
}

/** Overall ring color: 80–100 green / 50–79 amber / 0–49 red. */
function ringColor(score: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (score >= 80) return colors.success;
  if (score >= 50) return colors.warning;
  return colors.danger;
}

export default function HealthScorePanel({ overall, bySystem, startHere }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    Animated.timing(anim, {
      toValue: overall,
      duration: 900,
      useNativeDriver: false,
    }).start();
    const id = anim.addListener(({ value }) => setDisplayScore(Math.round(value)));
    return () => anim.removeListener(id);
  }, [overall]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRCUMFERENCE, 0],
  });

  return (
    <Card style={styles.card}>
      <TouchableOpacity
        style={styles.ringWrap}
        activeOpacity={0.85}
        onPress={() => setExpanded((v) => !v)}
      >
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={colors.borderLight}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <AnimatedCircle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke={ringColor(overall, colors)}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            fill="none"
            rotation={-90}
            origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.ringNum, { color: colors.textPrimary }]}>{displayScore}</Text>
          <Text style={[styles.ringLabel, { color: colors.textMuted }]}>HEALTH</Text>
        </View>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.textPrimary }]}>Overall Home Health</Text>
      <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.capRow}>
        <Text style={[styles.cap, { color: colors.textMuted }]}>
          {expanded ? 'Hide breakdown' : 'Tap to see where you can improve'}
        </Text>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={18}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={[styles.breakdown, { borderTopColor: colors.borderLight }]}>
          {bySystem.map((s) => (
            <View key={s.system} style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {s.label}
              </Text>
              <View style={[styles.track, { backgroundColor: colors.borderLight }]}>
                <View
                  style={[
                    styles.fill,
                    { width: `${s.score}%`, backgroundColor: scoreColor(s.score, colors) },
                  ]}
                />
              </View>
              <Text style={[styles.rowScore, { color: scoreColor(s.score, colors) }]}>{s.score}</Text>
            </View>
          ))}

          {startHere && (
            <View style={[styles.startHere, { backgroundColor: colors.primary }]}>
              <Text style={[styles.startHereLabel, { color: colors.primaryLight }]}>
                Start here to raise your score fastest:
              </Text>
              <Text style={[styles.startHereTitle, { color: colors.textInverse }]} numberOfLines={2}>
                {startHere.title} · {startHere.systemLabel}
              </Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  ringSvg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
  },
  ringNum: {
    fontFamily: fonts.display,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 44,
  },
  ringLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xxl,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.xs,
  },
  cap: {
    fontSize: fontSize.sm,
  },
  breakdown: {
    width: '100%',
    borderTopWidth: 1,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm + 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    width: 84,
    fontSize: fontSize.sm,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  rowScore: {
    width: 28,
    textAlign: 'right',
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  startHere: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  startHereLabel: {
    fontSize: fontSize.xs,
  },
  startHereTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 4,
  },
});
