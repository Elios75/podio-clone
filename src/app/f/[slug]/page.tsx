import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicForm } from "./public-form";

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: form } = await supabase.rpc("get_webform", { p_slug: slug });
  if (!form) notFound();

  return (
    <main className="mx-auto max-w-lg p-6 sm:p-10">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold">
          {form.icon} {form.title}
        </h1>
        {form.description && (
          <p className="mt-1 text-sm text-slate-500">{form.description}</p>
        )}
        <div className="mt-6">
          <PublicForm slug={slug} form={form} />
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-400">
        Powered by Podio Clone
      </p>
    </main>
  );
}
