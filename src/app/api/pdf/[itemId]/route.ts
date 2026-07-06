import { createClient } from "@/lib/supabase/server";
import { tableSummary } from "@/lib/fields";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// GET /api/pdf/:itemId — renders the item as a simple PDF document.
// Auth: session cookie; RLS decides whether the caller can see the item.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("items")
    .select("id, app_id, item_number, title, created_at, updated_at")
    .eq("id", itemId).eq("is_deleted", false)
    .maybeSingle();
  if (!item) return new Response("Not found", { status: 404 });

  const { data: app } = await supabase
    .from("apps").select("name, icon, item_name").eq("id", item.app_id).single();
  const { data: fields } = await supabase
    .from("app_fields")
    .select("id, label, type, config")
    .eq("app_id", item.app_id).eq("status", "active")
    .order("position");
  const { data: values } = await supabase
    .from("item_field_values")
    .select("field_id, value, value_text, value_number, value_date")
    .eq("item_id", itemId);

  const byField = new Map((values ?? []).map((v: any) => [v.field_id, v]));

  function fieldText(f: any): string {
    const v = byField.get(f.id);
    if (!v) return "—";
    switch (f.type) {
      case "category": {
        const opt = (f.config?.options ?? []).find((o: any) => o.id === v.value_text);
        return opt?.label ?? "—";
      }
      case "date":
        return v.value_date ? new Date(v.value_date).toISOString().slice(0, 10) : "—";
      case "money":
        return v.value_number != null
          ? `${v.value_number} ${(v.value as any)?.currency ?? ""}`.trim() : "—";
      case "number":
      case "progress":
        return v.value_number != null ? String(v.value_number) : "—";
      case "table":
        return tableSummary(v.value, f.config);
      default:
        return v.value_text ?? "—";
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); // A4
  const margin = 56;
  let y = 842 - margin;

  const sanitize = (s: string) => s.replace(/[^\x20-\x7E]/g, "").trim() || " ";
  const wrap = (text: string, size: number, fnt: any, width: number): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const probe = line ? `${line} ${w}` : w;
      if (fnt.widthOfTextAtSize(probe, size) > width && line) {
        lines.push(line);
        line = w;
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const drawLine = (text: string, size: number, fnt: any, color = rgb(0.1, 0.1, 0.15)) => {
    for (const ln of wrap(text, size, fnt, 595 - margin * 2)) {
      if (y < margin + size) {
        page = pdf.addPage([595, 842]);
        y = 842 - margin;
      }
      page.drawText(ln, { x: margin, y, size, font: fnt, color });
      y -= size * 1.5;
    }
  };

  drawLine(`${app?.name ?? "App"} — ${app?.item_name ?? "Item"} #${item.item_number}`, 10, font, rgb(0.45, 0.5, 0.55));
  y -= 4;
  drawLine(item.title ?? `#${item.item_number}`, 20, bold);
  y -= 8;

  for (const f of fields ?? []) {
    if (["separator", "image", "file"].includes(f.type)) continue;
    drawLine(f.label.toUpperCase(), 8, bold, rgb(0.45, 0.5, 0.55));
    y += 2;
    drawLine(fieldText(f), 11, font);
    y -= 4;
  }

  y -= 8;
  drawLine(
    `Created ${new Date(item.created_at).toISOString().slice(0, 10)} · Updated ${new Date(item.updated_at).toISOString().slice(0, 10)} · Exported ${new Date().toISOString().slice(0, 10)}`,
    8, font, rgb(0.6, 0.63, 0.66)
  );

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="item-${item.item_number}.pdf"`,
    },
  });
}
