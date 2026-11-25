import { createClient } from "@supabase/supabase-js";
import { importar, lerDados } from "../../scripts/importar.mjs";
import { chaves, esperar } from "../../scripts/supabase-local.mjs";

export default async function preparar() {
  await esperar();
  const { url, secreta } = chaves();
  await importar(createClient(url, secreta, { auth: { persistSession: false } }), lerDados());
}
