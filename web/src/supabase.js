import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  // Sem isto, uma leitura sem rede fica uns 7 s em "Carregando…" antes de avisar.
  { db: { retry: false } },
);

export async function conferir(pedido) {
  const { data, error } = await pedido;
  if (error) throw error;
  return data;
}
