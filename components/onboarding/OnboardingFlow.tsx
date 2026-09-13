/**
 * First-run onboarding.
 *
 * WHY THIS EXISTS. The first real user — Gabriele's dad — signed up, landed on
 * the dashboard and asked out loud: "how do I upload an inspection report?"
 * Then, when pointed at Upload Report, the button was disabled, because a
 * report needs a home and he had not added one. He had no way of knowing that.
 *
 * The old flow asked the user to work out, unprompted, that they must (1) find
 * My Properties, (2) create a property, (3) find Upload Report, (4) come back.
 * Four steps, none of them signposted, and failing at step 1 makes step 3 look
 * broken rather than blocked.
 *
 * So: two steps, in order, on first login, with the second one impossible to
 * reach before the first is done. Skipping is allowed at every stage — an
 * onboarding you cannot escape is worse than one you can ignore — but the
 * DEFAULT path walks someone straight from signing up to a finished plan.
 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Button from '@/components/Button';
import InfoPopup from '@/components/InfoPopup';
import { LoadingModal } from '@/components/LoadingModal';
import { SingleLineInput } from '@/components/Inputs';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { createProperty } from '@/services/propertyService';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';

type Props = {
  visible: boolean;
  userId: string;
  firstName?: string;
  /** Called once a home exists, so the dashboard can reload. */
  onHomeAdded: () => void;
  /** Called when the whole flow is finished or skipped. */
  onDone: () => void;
};

export default function OnboardingFlow({
  visible, userId, firstName, onHomeAdded, onDone,
}: Props) {
  const { colors } = useTheme();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [year, setYear] = useState('');
  const [lastInspection, setLastInspection] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const thisYear = new Date().getFullYear();

  const handleAddHome = async () => {
    // The address is the natural label for a home, so fall back to it rather
    // than forcing someone to invent a nickname for the house they live in.
    const label = name.trim() || address.trim();
    if (!label) { setError('Give your home a name or an address so we can label it.'); return; }

    const parsedYear = year.trim() ? Number(year.trim()) : null;
    if (parsedYear !== null && (Number.isNaN(parsedYear) || parsedYear < 1800 || parsedYear > thisYear)) {
      setError(`Year built should be between 1800 and ${thisYear}.`);
      return;
    }

    setSaving(true);
    try {
      const id = await createProperty(label, {
        address: address.trim() || null,
        yearBuilt: parsedYear,
        lastInspectionDate: /^\d{4}-\d{2}-\d{2}$/.test(lastInspection.trim())
          ? lastInspection.trim()
          : null,
      });
      setPropertyId(id);
      onHomeAdded();
    } catch (err) {
      setError((err as Error).message ?? 'Could not add your home.');
    } finally {
      setSaving(false);
    }
  };

  const step = propertyId ? 2 : 1;

  return (
    <>
      <Modal transparent visible={visible} animationType="fade">
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={[styles.box, { backgroundColor: colors.surface }]}>

              <View style={styles.steps}>
                <StepDot n={1} active={step === 1} done={step > 1} colors={colors} label="Your home" />
                <View style={[styles.stepLine, { backgroundColor: step > 1 ? colors.primary : colors.borderLight }]} />
                <StepDot n={2} active={step === 2} done={false} colors={colors} label="Your report" />
              </View>

              {step === 1 ? (
                <>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    {firstName ? `Welcome, ${firstName}` : 'Welcome to BENi'}
                  </Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    Let's start with your home. Everything in BENi hangs off it — your
                    report, your maintenance plan, your documents. Only the first line
                    is required.
                  </Text>

                  <SingleLineInput
                    placeholderText="Address (e.g. 22 Sandstone Crescent SE)"
                    value={address}
                    onChangeText={setAddress}
                  />
                  <SingleLineInput
                    placeholderText="Call it something (optional — e.g. Home)"
                    value={name}
                    onChangeText={setName}
                  />
                  <SingleLineInput
                    placeholderText={`Year built (optional — e.g. 1998)`}
                    value={year}
                    onChangeText={setYear}
                    keyboardType="number-pad"
                  />
                  <SingleLineInput
                    placeholderText="Last inspection, YYYY-MM-DD (optional)"
                    value={lastInspection}
                    onChangeText={setLastInspection}
                  />

                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    The year helps BENi judge how much life is left in the furnace, roof
                    and water heater.
                  </Text>

                  <Button
                    title="Add my home"
                    variant="primary"
                    fullWidth
                    disabled={saving}
                    onPress={handleAddHome}
                    style={{ marginTop: spacing.md }}
                  />
                  <Pressable onPress={onDone} style={styles.skip}>
                    <Text style={[styles.skipText, { color: colors.textMuted }]}>I'll do this later</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.tickRow}>
                    <MaterialIcons name="check-circle" size={20} color={colors.success} />
                    <Text style={[styles.tickText, { color: colors.success }]}>Home added</Text>
                  </View>

                  <Text style={[styles.title, { color: colors.textPrimary }]}>
                    Now add your inspection report
                  </Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>
                    BENi reads it and builds your maintenance plan — every recommendation
                    becomes a dated task with a Calgary cost range, linked back to the page
                    it came from. Takes about half a minute.
                  </Text>

                  <Button
                    title="Upload my inspection report"
                    variant="primary"
                    fullWidth
                    onPress={() => setShowUpload(true)}
                    leftIcon={<MaterialIcons name="upload-file" size={16} color={colors.textInverse} />}
                  />

                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    Haven't had an inspection? That's fine — BENi will still build you a
                    seasonal maintenance plan from your home's details.
                  </Text>

                  <Pressable onPress={onDone} style={styles.skip}>
                    <Text style={[styles.skipText, { color: colors.textMuted }]}>
                      Skip — I don't have a report
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* The real upload flow, reused rather than reimplemented, so onboarding
          can never drift out of step with the Upload Report button. */}
      <UploadExtractPopup
        visible={showUpload}
        userId={userId}
        initialPropertyId={propertyId ?? undefined}
        onClose={() => setShowUpload(false)}
        onSuccess={() => { setShowUpload(false); onDone(); }}
      />

      <LoadingModal visible={saving} message="Adding your home…" />
      <InfoPopup
        visible={!!error}
        type="error"
        message={error ?? ''}
        onClose={() => setError(null)}
      />
    </>
  );
}

function StepDot({
  n, active, done, colors, label,
}: { n: number; active: boolean; done: boolean; colors: any; label: string }) {
  const bg = done ? colors.success : active ? colors.primary : colors.borderLight;
  return (
    <View style={styles.stepWrap}>
      <View style={[styles.stepDot, { backgroundColor: bg }]}>
        {done
          ? <MaterialIcons name="check" size={13} color="#fff" />
          : <Text style={styles.stepNum}>{n}</Text>}
      </View>
      <Text style={[styles.stepLabel, { color: active || done ? colors.textPrimary : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  box: { width: 460, maxWidth: '100%', borderRadius: radius.xl, padding: spacing.xl },
  steps: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  stepWrap: { alignItems: 'center', gap: 4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, marginHorizontal: spacing.sm, marginBottom: 16 },
  title: { fontFamily: fonts.heading, fontSize: fontSize.h3, fontWeight: 'bold', marginBottom: 6 },
  body: { fontSize: fontSize.md, lineHeight: 20, marginBottom: spacing.lg },
  hint: { fontSize: fontSize.sm, lineHeight: 18, marginTop: spacing.md },
  skip: { alignSelf: 'center', paddingVertical: spacing.md },
  skipText: { fontSize: fontSize.sm, textDecorationLine: 'underline' },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  tickText: { fontSize: fontSize.sm, fontWeight: '700' },
});
