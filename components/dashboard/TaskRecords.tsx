/**
 * The paper trail on a completed task: the receipts, invoices and photos kept
 * when it was done, each opened with a tap, plus a way to add one later (the
 * invoice often arrives a week after the work).
 */
import Button from '@/components/Button';
import { SingleLineInput } from '@/components/Inputs';
import { fetchTaskRecords, openFileAtPage, PendingRecord, TaskRecord, uploadTaskDocument } from '@/services/fileService';
import { supabase } from '@/services/supabase';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif)$/i;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function TaskRecords({ taskId, propertyId }: { taskId: string; propertyId: string | null }) {
  const { colors } = useTheme();
  const [records, setRecords] = useState<TaskRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const load = () =>
    fetchTaskRecords(taskId)
      .then((r) => { setRecords(r); setError(null); })
      .catch((err) => { console.error(err); setRecords([]); setError('Could not load the records for this task.'); });

  useEffect(() => { load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const f = result.assets[0];
    setPending({ uri: f.uri, name: f.name, title: '' });
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('Please sign in again.');
      await uploadTaskDocument(data.user.id, taskId, propertyId, pending.uri, pending.name, pending.title);
      setPending(null);
      await load();
    } catch (err) {
      console.error(err);
      setError('That file didn’t save. Try again, or try a smaller file.');
    } finally {
      setSaving(false);
    }
  };

  const open = async (r: TaskRecord) => {
    setOpening(r.id);
    try {
      await openFileAtPage(r.file_path);
    } catch (err) {
      console.error(err);
      setError('Could not open that file.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={styles.wrap}>
      {records === null ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start' }} />
      ) : records.length === 0 && !pending ? (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          Nothing attached. Add the receipt, invoice or a photo so the work is on file.
        </Text>
      ) : (
        records.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => open(r)}
            style={({ pressed }) => [
              styles.record,
              { borderColor: colors.borderLight, backgroundColor: pressed ? colors.surfaceSecondary : colors.surface },
            ]}
          >
            <MaterialIcons
              name={IMAGE.test(r.file_name) ? 'image' : 'picture-as-pdf'}
              size={18}
              color={colors.primary}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.recordName, { color: colors.textPrimary }]} numberOfLines={1}>
                {r.file_name.replace(/\.[a-z0-9]{2,5}$/i, '')}
              </Text>
              <Text style={[styles.recordMeta, { color: colors.textMuted }]}>Added {shortDate(r.created_at)}</Text>
            </View>
            {opening === r.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.openText, { color: colors.primary }]}>Open</Text>
            )}
          </Pressable>
        ))
      )}

      {pending && (
        <View style={[styles.pending, { borderColor: colors.borderLight }]}>
          <View style={styles.pendingRow}>
            <MaterialIcons name="attach-file" size={16} color={colors.textMuted} />
            <Text style={[styles.recordMeta, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
              {pending.name}
            </Text>
          </View>
          <SingleLineInput
            placeholderText="What is this? e.g. Plumber’s invoice"
            value={pending.title ?? ''}
            onChangeText={(t) => setPending((p) => (p ? { ...p, title: t } : p))}
            maxLength={80}
            style={{ marginBottom: 0 }}
          />
          <View style={styles.pendingActions}>
            <Button title="Cancel" variant="secondary" size="sm" onPress={() => setPending(null)} disabled={saving} />
            <Button title="Save record" variant="primary" size="sm" onPress={save} loading={saving} />
          </View>
        </View>
      )}

      {!!error && <Text style={[styles.recordMeta, { color: colors.danger }]}>{error}</Text>}

      {!pending && (
        <Button
          title="Add a record"
          variant="outline"
          size="sm"
          onPress={pick}
          leftIcon={<MaterialIcons name="note-add" size={15} color={colors.primary} />}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: spacing.sm,
  },
  empty: {
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  record: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  recordName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  recordMeta: {
    fontSize: fontSize.xs,
  },
  openText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  pending: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pendingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
