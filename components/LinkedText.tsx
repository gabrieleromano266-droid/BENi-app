/**
 * Text with its web addresses made tappable.
 *
 * Inspectors put links in their findings — the founder's report points to
 * Health Canada's asbestos page — and that link is exactly what a worried
 * homeowner wants. Shown as plain text it was useless.
 */
import { Linking, StyleProp, Text, TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';

const URL_RE = /(https?:\/\/[^\s)]+[^\s).,;])/g;

export default function LinkedText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  const parts = text.split(URL_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <Text
            key={i}
            style={{ color: colors.info, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL(part).catch(() => {})}
          >
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        ),
      )}
    </Text>
  );
}
