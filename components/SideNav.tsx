/**
 * App navigation panel, styled after the concept design's sidebar.
 *
 * - Web / wide screens (>= BREAKPOINT): always-visible left sidebar.
 * - Phone: slim top bar with a hamburger that slides the same panel over the content.
 *
 * Items: Dashboard, My Properties, Documents, Upload Report
 * (Upload Report opens the existing UploadExtractPopup rather than a page).
 * Bottom: user card (→ Profile), Sign Out, theme toggle.
 */
import IconButton from '@/components/IconButton';
import NavIcon, { NavIconName, NavIconPressable } from '@/components/NavIcon';
import MobileNavFan, { FanItem } from '@/components/MobileNavFan';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { supabase } from '@/services/supabase';
import { hasAnyReport } from '@/services/fileService';
import { useTheme } from '@/theme/ThemeContext';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/theme/layout';
import { fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { usePathname, useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

const TOPBAR_HEIGHT = 56;

type IconName = ComponentProps<typeof MaterialIcons>['name'];

// "My Properties" was once dropped from here on the theory that the dashboard's
// property dropdown was enough. It wasn't: renaming and deleting a property live
// ONLY on that screen, so removing the link orphaned the only way to remove a
// property (and its reports) from the account. Keep this entry.
//
// "Maintenance" was removed deliberately: the dashboard already lists every
// task, with filtering the Maintenance screen didn't have. The route at
// /(tabs)/maintenance still exists and still works if you navigate to it
// directly — it is just no longer a top-level destination.
const NAV_ITEMS: { label: string; icon: NavIconName; path: string }[] = [
  { label: 'Dashboard', icon: 'dashboard', path: '/(tabs)/dashboard' },
  { label: 'My Properties', icon: 'properties', path: '/(tabs)/properties' },
  { label: 'Documents', icon: 'documents', path: '/(tabs)/documents' },
];

export default function SideNav() {
  const { width } = useWindowDimensions();
  const isWide = width >= SIDEBAR_BREAKPOINT;
  const router = useRouter();
  const pathname = usePathname();
  const { colors, isDark, toggleTheme } = useTheme();

  const [drawerOpen, setDrawerOpen] = useState(false);
  // Bumping a counter replays that icon's animation; keyed by path so each
  // nav row animates independently.
  const [replays, setReplays] = useState<Record<string, number>>({});
  const replay = (key: string) => setReplays((r) => ({ ...r, [key]: (r[key] ?? 0) + 1 }));
  const [uploadVisible, setUploadVisible] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  /**
   * Until a report exists, Upload Report is the only thing the user should be
   * doing — so it says so, instead of sitting there looking like any other
   * menu item. Adding a home and then being left on an empty dashboard was
   * exactly where the first real user got stuck.
   */
  const [needsReport, setNeedsReport] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setEmail(data.user?.email ?? '');
      if (id) {
        hasAnyReport(id)
          .then((has) => setNeedsReport(!has))
          .catch(() => setNeedsReport(false));
      }
    });
  }, [pathname]);

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

  /**
   * The phone menu. Same destinations as the sidebar plus the two things that
   * only lived in the sidebar footer — Profile and Sign Out — because on a
   * phone there is no footer to put them in.
   */
  const mobileItems: FanItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'space-dashboard', onPress: () => navigate('/(tabs)/dashboard') },
    { key: 'properties', label: 'My Properties', icon: 'home-work', onPress: () => navigate('/(tabs)/properties') },
    { key: 'documents', label: 'Documents', icon: 'description', onPress: () => navigate('/(tabs)/documents') },
    { key: 'upload', label: 'Upload Report', icon: 'upload', highlight: needsReport,
      onPress: () => { setUploadVisible(true); setDrawerOpen(false); } },
    { key: 'profile', label: 'Profile', icon: 'person', onPress: () => navigate('/(tabs)/profile') },
    { key: 'signout', label: 'Sign Out', icon: 'logout', onPress: handleSignOut },
  ];

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
            trigger={replays[item.path] ?? 0}
            onReplay={() => replay(item.path)}
            onPress={() => navigate(item.path)}
          />
        ))}
        <NavItem
          icon="upload"
          label="Upload Report"
          active={false}
          highlight={needsReport}
          trigger={replays.upload ?? 0}
          onReplay={() => replay('upload')}
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
          {/* Top bar keeps the brand, but no longer carries navigation — that
              moved to a thumb-reachable button in the bottom right. */}
          <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.headerBorder }]}>
            <TouchableOpacity
              onPress={() => navigate('/(tabs)/dashboard')}
              accessibilityLabel="Go to dashboard"
              style={styles.topBarLogoWrap}
            >
              <Image source={logoSource} style={styles.topBarLogo} resizeMode="contain" />
            </TouchableOpacity>
          </View>

          <MobileNavFan
            open={drawerOpen}
            onToggle={setDrawerOpen}
            items={mobileItems}
          />
        </View>
      )}

      <UploadExtractPopup
        visible={uploadVisible}
        userId={userId ?? ''}
        onClose={() => setUploadVisible(false)}
        onSuccess={() => router.push('/(tabs)/dashboard' as any)}
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, onPress, trigger, onReplay, highlight,
}: {
  icon: NavIconName; label: string; active: boolean; onPress: () => void;
  trigger: number; onReplay: () => void; highlight?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <NavIconPressable
      onPress={onPress}
      onReplay={onReplay}
      style={[
        styles.navItem,
        { backgroundColor: active ? colors.headerActiveBg : 'transparent' },
        highlight && { backgroundColor: colors.gold, borderWidth: 0 },
      ]}
    >
      <NavIcon
        name={icon}
        size={18}
        trigger={trigger}
        active={active}
        color={highlight ? colors.headerBg : active ? colors.headerAccent : colors.headerTextMuted}
      />
      <Text style={[styles.navItemText, {
        color: highlight ? colors.headerBg : active ? colors.headerAccent : colors.headerTextMuted,
        fontWeight: highlight || active ? '700' : '500',
      }]}>
        {label}
      </Text>
      {highlight && (
        <View style={[styles.navDot, { backgroundColor: colors.headerBg }]} />
      )}
    </NavIconPressable>
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
  navDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
  topBarLogoWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
