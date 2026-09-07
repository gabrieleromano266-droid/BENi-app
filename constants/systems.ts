import { HomeSystem } from '@/types';
import { ComponentProps } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** The 6 home systems the maintenance plan and Home Health Score are grouped by */
export const SYSTEMS: { value: HomeSystem; label: string; icon: IconName }[] = [
  { value: 'roof_attic', label: 'Roof & Attic', icon: 'roofing' },
  { value: 'electrical', label: 'Electrical', icon: 'bolt' },
  { value: 'plumbing', label: 'Plumbing', icon: 'plumbing' },
  { value: 'hvac', label: 'HVAC', icon: 'ac-unit' },
  { value: 'exterior', label: 'Exterior', icon: 'yard' },
  { value: 'interior', label: 'Interior', icon: 'chair' },
];

export const SYSTEM_LABELS: Record<HomeSystem, string> = Object.fromEntries(
  SYSTEMS.map((s) => [s.value, s.label]),
) as Record<HomeSystem, string>;

export const SYSTEM_ICONS: Record<HomeSystem, IconName> = Object.fromEntries(
  SYSTEMS.map((s) => [s.value, s.icon]),
) as Record<HomeSystem, IconName>;

/** Options for ChipSelector/Dropdown-style pickers */
export const SYSTEM_OPTIONS = SYSTEMS.map((s) => ({ label: s.label, value: s.value as string }));
