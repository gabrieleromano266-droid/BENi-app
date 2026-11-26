import { fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DatePickerModal } from 'react-native-paper-dates';
import { useTheme } from '@/theme/ThemeContext';

type Props = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  /** Shown when empty. Defaults to "Due date (optional)". */
  placeholder?: string;
};

export function DateInput({ value, onChange, placeholder = 'Due date (optional)' }: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={[styles.trigger, {
          borderColor: colors.inputBorder,
          backgroundColor: colors.inputBackground,
        }]}
      >
        <MaterialIcons name="calendar-today" size={14} color={colors.textMuted} />
        <Text style={[styles.dateText, { color: value ? colors.textPrimary : colors.inputPlaceholder }]}>
          {value ? value.toISOString().split('T')[0] : placeholder}
        </Text>
        {value && (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8}>
            <MaterialIcons name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      <DatePickerModal
        locale="en"
        mode="single"
        visible={visible}
        date={value || new Date()}
        onDismiss={() => setVisible(false)}
        onConfirm={(params) => {
          setVisible(false);
          onChange(params.date ?? null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
  },
  dateText: {
    fontSize: fontSize.sm,
    flex: 1,
  },
});
