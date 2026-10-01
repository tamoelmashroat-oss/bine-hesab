import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applySchemaExtras,
  applySchemaStructure,
  copyTableChunk,
  inspectSourceDb,
  listSupabaseProjects,
  resetTargetDb,
  type SourceReport,
  type SupabaseProject,
} from "@/lib/supabaseDbMigrate.functions";

export const Route = createFileRoute("/_authenticated/database")({
  head: () => ({
    meta: [
      { title: "نقل قاعدة بيانات Supabase — نسخة مطابقة بين حسابين" },
      {
        name: "description",
        content:
          "انقل قاعدة بيانات Supabase كاملة — الجداول والبيانات وقواعد الحماية — من حساب إلى حساب آخر مختلف تمامًا.",
      },
      { property: "og:title", content: "نقل قاعدة بيانات Supabase بين حسابين" },
      {
        property: "og:description",
        content: "نسخة مطابقة تمامًا: الجداول، الأعمدة، البيانات، الدوال، وقواعد الحماية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DatabasePage,
});

const CHUNK = 200;

type Side = "source" | "target";

function DatabasePage() {
  const [token, setToken] = useState<Record<Side, string>>({ source: "", target: "" });
  const [ref, setRef] = useState<Record<Side, string>>({ source: "", target: "" });
  const [projects, setProjects] = useState<Record<Side, SupabaseProject[]>>({
    source: [],
    target: [],
  });
  const [report, setReport] = useState<SourceReport | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const logBox = useRef<HTMLDivElement>(null);

  const fetchProjects = useServerFn(listSupabaseProjects);
  const inspect = useServerFn(inspectSourceDb);
  const reset = useServerFn(resetTargetDb);
  const structure = useServerFn(applySchemaStructure);
  const extras = useServerFn(applySchemaExtras);
  const copyChunk = useServerFn(copyTableChunk);

  const push = (line: string) =>
    setLog((prev) => {
      const next = [...prev, line];
      requestAnimationFrame(() => {
        if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight;
      });
      return next;
    });

  const loadProjects = useMutation({
    mutationFn: async (side: Side) => {
      const list = await fetchProjects({ data: { token: token[side].trim() } });
      return { side, list };
    },
    onSuccess: ({ side, list }) => {
      setProjects((p) => ({ ...p, [side]: list }));
      setError(null);
      if (list.length === 0) setError("لا توجد مشاريع في هذا الحساب.");
    },
    onError: (e: Error) => setError(e.message),
  });

  const inspectSource = useMutation({
    mutationFn: () => inspect({ data: { token: token.source.trim(), ref: ref.source } }),
    onSuccess: (data) => {
      setReport(data);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const bothPicked = Boolean(ref.source && ref.target && token.source.trim() && token.target.trim());
  const sameProject = Boolean(ref.source) && ref.source === ref.target;
  const canRun = bothPicked && !sameProject && !!report && confirmWipe && !running;

  async function runMigration() {
    setRunning(true);
    setFinished(false);
    setError(null);
    setLog([]);
    setProgress(null);
    const creds = {
      sourceToken: token.source.trim(),
      sourceRef: ref.source,
      targetToken: token.target.trim(),
      targetRef: ref.target,
    };
    try {
      push("① تفريغ المشروع الهدف…");
      await reset({ data: { token: creds.targetToken, ref: creds.targetRef, confirm: true } });
      push("   تم حذف محتوى المخطط public في الهدف.");

      push("② إنشاء الأنواع والدوال والجداول…");
      const s1 = await structure({ data: creds });
      push(`   نُفِّذ ${s1.applied} من ${s1.total} أمرًا.`);
      s1.errors.slice(0, 5).forEach((e) => push(`   ⚠ ${e}`));

      const tables = (report?.tables ?? []).filter((t) => t.rows > 0);
      const totalRows = tables.reduce((sum, t) => sum + t.rows, 0);
      setProgress({ done: 0, total: totalRows });
      push(`③ نسخ البيانات (${totalRows} صفًا في ${tables.length} جدولًا)…`);
      let done = 0;
      for (const table of tables) {
        let offset = 0;
        for (;;) {
          const res = await copyChunk({
            data: { ...creds, table: table.name, offset, limit: CHUNK },
          });
          offset += res.copied;
          done += res.copied;
          setProgress({ done, total: totalRows });
          if (res.done) break;
        }
        push(`   ${table.name}: ${offset} صفًا.`);
      }

      push("④ إضافة العلاقات والفهارس وقواعد الحماية…");
      const s2 = await extras({ data: creds });
      push(`   نُفِّذ ${s2.applied} من ${s2.total} أمرًا.`);
      s2.errors.slice(0, 5).forEach((e) => push(`   ⚠ ${e}`));

      push("✔ تم النقل. المشروع الهدف الآن نسخة مطابقة للمصدر.");
      setFinished(true);
    } catch (e) {
      setError((e as Error).message);
      push(`✕ توقّف النقل: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  function SideCard({ side }: { side: Side }) {
    const isSource = side === "source";
    return (
      <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" />
          {isSource ? "حساب المصدر" : "حساب الهدف"}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground" htmlFor={`token-${side}`}>
            رمز الوصول الشخصي لهذا الحساب
          </label>
          <a
            href="https://supabase.com/dashboard/account/tokens"
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <KeyRound className="h-3 w-3" />
            من أين أجلب الرمز؟ اضغط هنا
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <input
            id={`token-${side}`}
            type="password"
            dir="ltr"
            autoComplete="off"
            value={token[side]}
            onChange={(e) => setToken((t) => ({ ...t, [side]: e.target.value }))}
            placeholder="sbp_..."
            className="mono min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!token[side].trim() || loadProjects.isPending || running}
            onClick={() => loadProjects.mutate(side)}
          >
            {loadProjects.isPending && loadProjects.variables === side ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            المشاريع
          </Button>
        </div>

        <label className="text-xs text-muted-foreground" htmlFor={`ref-${side}`}>
          المشروع
        </label>
        <select
          id={`ref-${side}`}
          value={ref[side]}
          disabled={projects[side].length === 0 || running}
          onChange={(e) => {
            setRef((r) => ({ ...r, [side]: e.target.value }));
            if (isSource) setReport(null);
          }}
          className="min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
        >
          <option value="">
            {projects[side].length === 0 ? "اجلب المشاريع أولًا" : "اختر مشروعًا…"}
          </option>
          {projects[side].map((p) => (
            <option key={p.ref} value={p.ref}>
              {p.name} — {p.ref}
            </option>
          ))}
        </select>

        <p className="text-xs leading-6 text-muted-foreground">
          {isSource
            ? "المشروع الذي ستُنسخ منه قاعدة البيانات — لا يُعدَّل فيه شيء."
            : "المشروع الذي ستُكتب فيه النسخة — سيُحذف محتوى قاعدته أولًا."}
        </p>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen overflow-x-hidden">
      <div className="app-grid-bg min-h-screen">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-12 sm:px-5 sm:pb-16">
          <header className="flex flex-col gap-3 py-6 sm:py-10">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Database className="h-5 w-5" />
                </span>
                <h1 className="truncate text-xl font-bold sm:text-2xl">نقل قاعدة بيانات Supabase</h1>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to="/transfer">
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  المستودعات
                </Link>
              </Button>
            </div>
            <p className="max-w-2xl break-words text-sm leading-6 text-muted-foreground">
              انسخ قاعدة بيانات مشروع Supabase كما هي بالدقة إلى مشروع في حساب آخر مختلف تمامًا:
              الجداول، الأعمدة، البيانات، الدوال، الفهارس، وقواعد الحماية.
            </p>
          </header>

          <main className="flex flex-col gap-5">
            <section className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-4 text-xs leading-6 text-muted-foreground sm:p-5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="mb-1 text-sm font-semibold text-foreground">قبل أن تبدأ — كيف تجلب رمز الوصول؟</p>
                <ol className="mb-2 list-inside list-decimal space-y-0.5">
                  <li>
                    افتح صفحة{" "}
                    <a
                      href="https://supabase.com/dashboard/account/tokens"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      dir="ltr"
                    >
                      Account → Access Tokens
                      <ExternalLink className="h-3 w-3" />
                    </a>{" "}
                    في حساب Supabase (سجّل الدخول أولًا).
                  </li>
                  <li>اضغط «Generate new token» وأعطه أي اسم ثم انسخ الرمز — يظهر مرة واحدة فقط.</li>
                  <li>الصقه في الحقل بالأسفل. كرر الأمر لكل حساب (المصدر والهدف).</li>
                </ol>
                <p>تُستخدم الرموز في هذه الجلسة فقط ولا تُحفظ.</p>
              </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-2">
              <SideCard side="source" />
              <SideCard side="target" />
            </section>

            {sameProject && (
              <p className="text-sm text-destructive">اختر مشروعين مختلفين — المصدر والهدف متطابقان.</p>
            )}

            <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-lg shadow-background/20 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <p className="text-sm text-muted-foreground">
                  افحص المصدر لتعرف ما سيُنقل قبل التنفيذ.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!ref.source || !token.source.trim() || inspectSource.isPending || running}
                  onClick={() => inspectSource.mutate()}
                  className="w-full sm:w-auto"
                >
                  {inspectSource.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  افحص المصدر
                </Button>
              </div>

              {report && (
                <div className="flex flex-col gap-3 border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="جداول" value={report.tables.length} />
                    <Stat label="صفوف" value={report.totalRows} />
                    <Stat label="دوال" value={report.counts.functions} />
                    <Stat label="قواعد حماية" value={report.counts.policies} />
                    <Stat label="أنواع" value={report.counts.enums} />
                    <Stat label="فهارس" value={report.counts.indexes} />
                    <Stat label="مشاهد" value={report.counts.views} />
                    <Stat label="مشغِّلات" value={report.counts.triggers} />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background/60 p-3">
                    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {report.tables.map((t) => (
                        <li key={t.name} className="flex justify-between gap-3">
                          <span className="mono truncate" dir="ltr">
                            {t.name}
                          </span>
                          <span className="shrink-0">{t.rows} صفًا</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-4 text-sm">
                <input
                  type="checkbox"
                  checked={confirmWipe}
                  onChange={(e) => setConfirmWipe(e.target.checked)}
                  disabled={running}
                  className="mt-1 h-4 w-4 accent-[var(--primary)]"
                />
                <span className="min-w-0 break-words text-muted-foreground">
                  أوافق على حذف كل محتوى قاعدة البيانات في المشروع الهدف قبل النسخ (مطابقة تامة).
                </span>
              </label>

              <Button type="button" size="lg" disabled={!canRun} onClick={runMigration} className="w-full sm:w-auto">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                ابدأ النقل
              </Button>

              {progress && progress.total > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (progress.done / progress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {progress.done} / {progress.total} صفًا
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="whitespace-pre-wrap text-sm leading-6 text-destructive" dir="auto">
                    {error}
                  </p>
                </div>
              )}

              {finished && !error && (
                <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <p className="text-sm text-success">تمت المطابقة بنجاح.</p>
                </div>
              )}

              {log.length > 0 && (
                <div
                  ref={logBox}
                  className="mono max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-background/60 p-3 text-xs leading-6 text-muted-foreground"
                  dir="auto"
                >
                  {log.join("\n")}
                </div>
              )}
            </section>

            <section className="min-w-0 rounded-2xl border border-border bg-card/60 p-4 sm:p-6">
              <h2 className="mb-3 text-sm font-semibold">ما يُنقل وما لا يُنقل</h2>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✔ الجداول والأعمدة والقيم الافتراضية والمفاتيح والعلاقات والفهارس.</li>
                <li>✔ كل الصفوف كما هي، ثم ضبط العدّادات التلقائية.</li>
                <li>✔ الدوال والمشغِّلات والمشاهد وتشغيل الحماية وقواعدها والصلاحيات.</li>
                <li>✕ حسابات المستخدمين (تسجيل الدخول) والملفات المخزَّنة والأسرار — غير مشمولة.</li>
              </ul>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background/60 px-3 py-2">
      <p className="mono text-sm font-semibold">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
