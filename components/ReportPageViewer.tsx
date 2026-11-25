/**
 * Shows ONE page of the inspection report inside BENi (BENI-64).
 *
 * "View in report" used to open the PDF in a new tab with #page=N on the end.
 * Chrome's own viewer honours that; Adobe's does not, and Adobe is what a lot
 * of people have set as their PDF handler — so the founder's own clicks landed
 * on page 1 of a 60-page report, which defeats the point of the link. Rendering
 * the page ourselves is the only way to make "page 22" mean page 22 in every
 * browser.
 *
 * pdf.js is loaded from cdnjs the first time someone opens a report, not
 * bundled: it is ~1 MB that nobody needs until that moment.
 *
 * Web only. On a phone app build the old behaviour (hand the file to the OS
 * viewer) is still the right one, so the card falls back to openFileAtPage.
 */
import Button from '@/components/Button';
import { openFileAtPage, signedReportUrl } from '@/services/fileService';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

type PdfJs = {
  getDocument: (src: { url: string }) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
};

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Load pdf.js once per session; later opens reuse it. */
function loadPdfJs(): Promise<PdfJs> {
  const w = window as unknown as { pdfjsLib?: PdfJs };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS_BASE}/pdf.min.js`;
    script.async = true;
    script.onload = () => {
      const lib = (window as unknown as { pdfjsLib?: PdfJs }).pdfjsLib;
      if (!lib) { reject(new Error('PDF viewer failed to load')); return; }
      lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    script.onerror = () => { pdfjsPromise = null; reject(new Error('PDF viewer failed to load')); };
    document.head.appendChild(script);
  });
  return pdfjsPromise;
}

type Props = {
  visible: boolean;
  filePath: string | null;
  page: number | null;
  /** What the homeowner was looking at — shown above the page. */
  taskTitle?: string;
  fileName?: string;
  onClose: () => void;
};

export default function ReportPageViewer({ visible, filePath, page, taskTitle, fileName, onClose }: Props) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const pageWidth = Math.min(width - 32, 860) - spacing.lg * 2;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderRef = useRef<{ cancel: () => void } | null>(null);

  const [current, setCurrent] = useState(page ?? 1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open: fetch a fresh signed link and load the document.
  useEffect(() => {
    if (!visible || !filePath) return;
    let cancelled = false;
    setCurrent(page ?? 1);
    setError(null);
    setLoading(true);
    (async () => {
      try {
        const [lib, url] = await Promise.all([loadPdfJs(), signedReportUrl(filePath)]);
        const doc = await lib.getDocument({ url }).promise;
        if (cancelled) { doc.destroy(); return; }
        docRef.current = doc;
        setTotal(doc.numPages);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Could not open this report');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
      setTotal(0);
    };
  }, [visible, filePath]);

  // Draw the current page whenever it, the document, or the width changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!visible || !doc || !canvas || total === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const n = Math.min(Math.max(current, 1), doc.numPages);
        const p = await doc.getPage(n);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        const base = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({ scale: (pageWidth / base.width) * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${pageWidth}px`;
        canvas.style.height = `${viewport.height / dpr}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not draw the page');
        renderRef.current?.cancel();
        const task = p.render({ canvasContext: ctx, viewport });
        renderRef.current = task;
        await task.promise;
      } catch (err) {
        // A cancelled render throws by design when the user flips pages fast.
        if (!cancelled && (err as Error)?.name !== 'RenderingCancelledException') {
          setError((err as Error).message || 'Could not draw the page');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, current, total, pageWidth]);

  const openWhole = () => {
    if (filePath) openFileAtPage(filePath, current).catch(() => {});
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, maxHeight: height - 32, width: Math.min(width - 32, 860) }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.gold }]}>
                Page {current}{total ? ` of ${total}` : ''}{fileName ? ` · ${fileName}` : ''}
              </Text>
              {taskTitle ? (
                <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>{taskTitle}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <MaterialIcons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {error ? (
              <View style={styles.center}>
                <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
                <Button title="Open the full report instead" variant="outline" size="sm" onPress={openWhole} />
              </View>
            ) : (
              <View style={[styles.pageFrame, { borderColor: colors.border }]}>
                <canvas ref={canvasRef} style={{ display: 'block' }} />
                {loading && (
                  <View style={[styles.loading, { backgroundColor: colors.surface }]}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.borderLight }]}>
            <Button
              title="Previous"
              variant="secondary"
              size="sm"
              disabled={current <= 1 || loading}
              onPress={() => setCurrent((c) => Math.max(1, c - 1))}
              leftIcon={<MaterialIcons name="chevron-left" size={16} color={colors.textPrimary} />}
            />
            <Button
              title="Next"
              variant="secondary"
              size="sm"
              disabled={!total || current >= total || loading}
              onPress={() => setCurrent((c) => Math.min(total || c, c + 1))}
              leftIcon={<MaterialIcons name="chevron-right" size={16} color={colors.textPrimary} />}
            />
            <View style={styles.spacer} />
            <Button
              title="Open full report"
              variant="outline"
              size="sm"
              onPress={openWhole}
              leftIcon={<MaterialIcons name="open-in-new" size={15} color={colors.primary} />}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  sheet: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSize.sm,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xl,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  pageFrame: {
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    minHeight: 240,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  center: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  error: {
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
  },
  spacer: {
    flex: 1,
  },
});
