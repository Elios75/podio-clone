import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicForm } from "./public-form";

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const { data: form } = await supabase.rpc("get_webform", { p_slug: slug });
  if (!form) notFound();

  // URL-parameter prefill: match query keys against field external_ids (or raw ids).
  // e.g. /f/my-form?company-name=Acme&deal-size=5000
  const prefill: Record<string, any> = {};
  for (const f of form.fields ?? []) {
    const raw = query[f.external_id] ?? query[f.id];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (v == null || v === "") continue;
    switch (f.type) {
      case "number":
      case "progress":
      case "duration": {
        const n = Number(v);
        if (!Number.isNaN(n)) prefill[f.id] = n;
        break;
      }
      case "money": {
        const n = Number(v);
        if (!Number.isNaN(n)) prefill[f.id] = { amount: n, currency: "USD" };
        break;
      }
      case "date":
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) prefill[f.id] = { start: v };
        break;
      case "category": {
        const opt = (f.config?.options ?? []).find(
          (o: any) => o.id === v || o.label.toLowerCase() === v.toLowerCase()
        );
        if (opt) prefill[f.id] = opt.id;
        break;
      }
      default:
        prefill[f.id] = v;
    }
  }

  const theme = form.theme ?? {};
  const bg = theme.background_color || undefined;
  const accent = theme.accent_color || undefined;

  return (
    <main
      className="min-h-screen p-6 sm:p-10"
      style={bg ? { backgroundColor: bg } : undefined}
    >
      {form.custom_css && <style dangerouslySetInnerHTML={{ __html: form.custom_css }} />}
      <div className="mx-auto max-w-lg">
        <div className="podio-form-card rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold">
            {form.icon} {form.title}
          </h1>
          {form.description && (
            <p className="mt-1 text-sm text-slate-500">{form.description}</p>
          )}
          <div className="mt-6">
            <PublicForm slug={slug} form={form} prefill={prefill} accent={accent} />
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Powered by Podio Clone
        </p>
      </div>
    </main>
  );
}
