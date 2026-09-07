/**
 * App navigation panel, styled after the concept design's sidebar.
 *
 * - Web / wide screens (>= BREAKPOINT): always-visible left sidebar.
 * - Phone: slim top bar with a hamburger that slides the same panel over the content.
 *
 * Items: Dashboard, My Properties, Maintenance, Documents, Upload Report
 * (Upload Report opens the existing UploadExtractPopup rather than a page).
 * Bottom: user card (→ Profile), Sign Out, theme toggle.
 */
import IconButton from '@/components/IconButton';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/theme/layout';
import { fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

const TOPBAR_HEIGHT = 56;

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// "My Properties" was removed from the nav: property switching now lives solely
// in the dashboard header dropdown. The /(tabs)/properties route still exists but
// is no longer linked here.
const NAV_ITEMS: { label: string; icon: IconName; path: string }[] = [
  { label: 'Dashboard', icon: 'space-dashboard', path: '/(tabs)/dashboard' },
  { label: 'Maintenance', icon: 'assignment', path: '/(tabs)/maintenance' },
  { label: 'Documents', icon: 'description', path: '/(tabs)/documents' },
];

export default function SideNav() {
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const router = useRouter();
  const pathname = usePathname();
  const { colors, isDark, toggleTheme } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uploadVisible, setUploadVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? '');
    });
  }, []);

  // Close the drawer when the window grows past the breakpoint, so it isn't
  // left open the next time the window shrinks
  useEffect(() => {
    if (isWide) setDrawerOpen(false);
  }, [isWide]);

  const navigate = (path: string) => {
    router.push(path as any);
    setDrawerOpen(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
    setDrawerOpen(false);
  };

  const isActive = (path: string) => {
    const clean = path.replace('/(tabs)', '');
    return pathname === clean || pathname === path;
  };

  // Sidebar background is dark navy in both app themes, so the cream mark is
  // the one that actually reads against it — the navy mark is confirmed
  // near-invisible there (checked against both themes' headerBg).
  const logoSource = require('@/assets/images/beni-logo-cream.png');

  const panel = (
    <View style={[styles.panel, { backgroundColor: colors.headerBg }]}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <TouchableOpacity style={styles.logoBlock} onPress={() => navigate('/(tabs)/dashboard')}>
          <Image source={logoSource} style={styles.logoImage} resizeMode="contain" />
        </TouchableOpacity>
        {!isWide && (
          <IconButton
            icon="close"
            onPress={() => setDrawerOpen(false)}
            iconColor={colors.headerTextMuted}
            style={{ backgroundColor: 'transparent' }}
          />
        )}
      </View>

      {/* Role badge */}
      <View style={[styles.badge, { backgroundColor: colors.headerActiveBg }]}>
        <Text style={[styles.badgeText, { color: colors.headerText }]}>Homeowner</Text>
      </View>

      {/* Navigation */}
      <View style={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            active={isActive(item.path)}
            onPress={() => navigate(item.path)}
          />
        ))}
        <NavItem
          icon="upload"
          label="Upload Report"
          active={false}
          onPress={() => { setUploadVisible(true); setDrawerOpen(false); }}
        />
      </View>

      {/* User / footer */}
      <View style={[styles.footer, { borderTopColor: colors.headerBorder }]}>
        <TouchableOpacity style={styles.userRow} onPress={() => navigate('/(tabs)/profile')}>
          <View style={[styles.avatar, { backgroundColor: colors.headerActiveBg }]}>
            <Text style={[styles.avatarText, { color: colors.headerAccent }]}>
              {(email[0] ?? 'U').toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.headerText }]} numberOfLines={1}>Profile</Text>
            <Text style={[styles.userEmail, { color: colors.headerTextMuted }]} numberOfLines={1}>{email}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.footerActions}>
          <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut}>
            <MaterialIcons name="logout" size={16} color={colors.headerTextMuted} />
            <Text style={[styles.signOutText, { color: colors.headerTextMuted }]}>Sign Out</Text>
          </TouchableOpacity>
          <IconButton
            icon={isDark ? 'light-mode' : 'dark-mode'}
            onPress={toggleTheme}
            iconColor={colors.headerTextMuted}
            style={{ backgroundColor: 'transparent' }}
          />
        </View>
      </View>
    </View>
  );

  return (
    <>
      {isWide ? (
        <View style={{ width: SIDEBAR_WIDTH }}>{panel}</View>
      ) : (
        <View style={styles.zWrap}>
          {/* Top bar */}
          <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.headerBorder }]}>
            <IconButton
              icon="menu"
              iconSize={24}
              onPress={() => setDrawerOpen(true)}
              iconColor={colors.headerText}
              style={{ backgroundColor: 'transparent' }}
            />
            <Image source={logoSource} style={styles.topBarLogo} resizeMode="contain" />
          </View>

          {/* Slide-over drawer — a Modal so it reliably covers the whole screen
              and receives touches on native (absolute children are clipped to
              parent bounds for hit-testing on iOS/Android) */}
          <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
            <View style={styles.drawerLayer}>
              <View style={styles.drawerPanel}>{panel}</View>
              <Pressable style={[styles.drawerDim, { backgroundColor: colors.overlay }]} onPress={() => setDrawerOpen(false)} />
            </View>
          </Modal>
        </View>
      )}

      <UploadExtractPopup
        visible={uploadVisible}
        userId={userId ?? ''}
        onClose={() => setUploadVisible(false)}
        onSuccess={() => router.push('/(tabs)/maintenance' as any)}
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, onPress,
}: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.navItem, { backgroundColor: active ? colors.headerActiveBg : 'transparent' }]}
    >
      <MaterialIcons name={icon} size={18} color={active ? colors.headerAccent : colors.headerTextMuted} />
      <Text style={[styles.navItemText, {
        color: active ? colors.headerAccent : colors.headerTextMuted,
        fontWeight: active ? '600' : '500',
      }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  logoBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoImage: {
    width: 140,
    height: 40,
  },
  badge: {
    alignSelf: 'flex-start',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  nav: {
    flex: 1,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  navItemText: {
    fontSize: fontSize.md,
  },
  footer: {
    borderTopWidth: 1,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  userEmail: {
    fontSize: fontSize.xs,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  signOutText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  zWrap: {
    zIndex: 300,
  },
  topBar: {
    height: TOPBAR_HEIGHT,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  topBarLogo: {
    width: 110,
    height: 28,
  },
  drawerLayer: {
    flex: 1,
    flexDirection: 'row',
  },
  drawerPanel: {
    width: 280,
    height: '100%',
  },
  drawerDim: {
    flex: 1,
  },
});
