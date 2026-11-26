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
  Util: { transform: (a: number[], b: number[]) => number[] };
};
type TextItem = { str?: string; transform: number[]; width: number };
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => void };
type Viewport = { width: number; height: number; scale: number; transform: number[] };
type PdfPage = {
  getViewport: (o: { scale: number }) => Viewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
  getTextContent: () => Promise<{ items: TextItem[] }>;
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);

/**
 * Where in the page's words does the quote sit? Exact sequence first; then the
 * longest run of its opening (or closing) words, so a line break or a
 * hyphenated word in the PDF doesn't lose the whole highlight.
 */
function findQuote(pageWords: string[], quote: string[]): [number, number] | null {
  const at = (needle: string[]) => {
    outer: for (let i = 0; i + needle.length <= pageWords.length; i++) {
      for (let k = 0; k < needle.length; k++) if (pageWords[i + k] !== needle[k]) continue outer;
      return i;
    }
    return -1;
  };
  for (let len = quote.length; len >= 5; len--) {
    const head = at(quote.slice(0, len));
    if (head >= 0) return [head, head + len - 1];
    const tail = at(quote.slice(quote.length - len));
    if (tail >= 0) return [tail, tail + len - 1];
  }
  return null;
}

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
  /** The inspector's sentence to highlight on the page (BENI-69). */
  highlight?: string | null;
  fileName?: string;
  onClose: () => void;
};

export default function ReportPageViewer({ visible, filePath, page, taskTitle, fileName, highlight, onClose }: Props) {
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
  const [highlighted, setHighlighted] = useState(false);
  // Only go looking on other pages once per open, so flipping pages by hand
  // never gets yanked back.
  const searchedRef = useRef(false);
  const libRef = useRef<PdfJs | null>(null);

  // Open: fetch a fresh signed link and load the document.
  useEffect(() => {
    if (!visible || !filePath) return;
    let cancelled = false;
    setCurrent(page ?? 1);
    setError(null);
    setLoading(true);
    searchedRef.current = false;
    (async () => {
      try {
        const [lib, url] = await Promise.all([loadPdfJs(), signedReportUrl(filePath)]);
        libRef.current = lib;
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
        if (cancelled) return;

        // Highlighter: paint over the inspector's sentence so the homeowner
        // can see, not just be told, where it says this.
        setHighlighted(false);
        const quote = highlight ? words(highlight) : [];
        if (quote.length >= 5 && libRef.current) {
          const { items } = await p.getTextContent();
          const pageWords: string[] = [];
          const owner: number[] = [];
          items.forEach((it, idx) => words(it.str ?? '').forEach((w) => { pageWords.push(w); owner.push(idx); }));
          const hit = findQuote(pageWords, quote);
          if (hit) {
            const hitItems = new Set(owner.slice(hit[0], hit[1] + 1));
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgba(255, 213, 0, 0.55)';
            hitItems.forEach((idx) => {
              const it = items[idx];
              const tx = libRef.current!.Util.transform(viewport.transform, it.transform);
              const h = Math.hypot(tx[2], tx[3]);
              ctx.fillRect(tx[4], tx[5] - h, it.width * viewport.scale, h * 1.15);
            });
            ctx.restore();
            setHighlighted(true);
          } else if (!searchedRef.current) {
            // Not on this page? Look through the report once and go there.
            searchedRef.current = true;
            for (let q = 1; q <= doc.numPages; q++) {
              if (q === n) continue;
              const other = await doc.getPage(q);
              const tc = await other.getTextContent();
              const otherWords: string[] = [];
              tc.items.forEach((it) => otherWords.push(...words(it.str ?? '')));
              if (findQuote(otherWords, quote)) { if (!cancelled) setCurrent(q); break; }
            }
          }
        }
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
  }, [visible, current, total, pageWidth, highlight]);

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
                {highlighted ? ' · inspector’s note highlighted' : ''}
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
