import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { TouchableOpacity, ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { ButtonVariant } from './Button';
import { Colors } from '@/theme/colors';

type Props = {
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  variant?: ButtonVariant;
  /** Button box size in px (default 32) */
  size?: number;
  /** Icon size in px (default: size * 0.6) */
  iconSize?: number;
  disabled?: boolean;
  style?: ViewStyle;
  /** Override the resolved icon color */
  iconColor?: string;
};

function resolveBg(variant: ButtonVariant, colors: Colors, disabled: boolean): string {
  if (disabled) return colors.border;
  switch (variant) {
    case 'primary': return colors.primary;
    case 'success': return colors.success;
    case 'danger': return colors.danger;
    case 'danger-outline': return 'transparent';
    case 'warning': return colors.warning;
    case 'info': return colors.info;
    case 'secondary': return colors.surface;
    case 'outline': return 'transparent';
  }
  // Fallback so the function always returns, even if a new ButtonVariant is
  // added later without updating this switch.
  return colors.primary;
}

function resolveIconColor(variant: ButtonVariant, colors: Colors, disabled: boolean): string {
  if (disabled) return colors.textDisabled;
  if (variant === 'secondary') return colors.textSecondary;
  if (variant === 'outline') return colors.info;
  if (variant === 'danger-outline') return colors.danger;
  return '#fff';
}

export default function IconButton({
  icon,
  onPress,
  variant = 'primary',
  size = 32,
  iconSize,
  disabled = false,
  style,
  iconColor: iconColorProp,
}: Props) {
  const { colors } = useTheme();
  const bg = resolveBg(variant, colors, disabled);
  const iconColor = iconColorProp ?? resolveIconColor(variant, colors, disabled);
  const resolvedIconSize = iconSize ?? Math.round(size * 0.6);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 8,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <MaterialIcons name={icon} size={resolvedIconSize} color={iconColor} />
    </TouchableOpacity>
  );
}
