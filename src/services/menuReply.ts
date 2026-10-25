/**
 * Membaca balasan server untuk permintaan menu & resep — MURNI (tanpa jaringan),
 * jadi bisa diuji sebagai tabel.
 *
 * URUTANNYA PENTING: data dibaca DULU, baru dicek apakah balasannya pesan kegagalan
 * server. Pola kegagalan server (`503`, `timed out`, …) juga bisa muncul di dalam
 * data yang sah — mis. kalori "503 kkal" atau langkah "…sampai timer timed out".
 * Dulu pengecekan kegagalan jalan lebih dulu atas SELURUH teks, sehingga resep/menu
 * yang sah dibuang sebagai "Server AI gagal merespons" dan pencarian menu berhenti.
 */
import { extractJson, extractJsonArray } from './ai/json';
import { ServerSideError } from './ai/failures';
import { serverFailureText } from './errors';
import { normalizeRecipeResponse } from './recipeNormalizer';
import { normalizeMenuList } from './menuNormalizer';
import type { MenuItem, Recipe } from '../types';

/** Lempar ServerSideError bila balasan (yang TIDAK berisi data) adalah pesan kegagalan server. */
function throwIfServerFailure(raw: string): void {
  const failure = serverFailureText(raw);
  if (failure) throw new ServerSideError(failure);
}

/**
 * Resep dari balasan server, atau `null` bila tidak terbaca (layak dicoba ulang).
 * Melempar ServerSideError bila balasannya pesan kegagalan model di sisi server.
 */
export function readRecipeReply(raw: string, menuName: string): Recipe | null {
  // Penorma: validasi bentuk + paksa nama resep = nama menu yang diminta (menutup
  // akar masalah "nama resep beda dari nama menu").
  const recipe = normalizeRecipeResponse(extractJson<unknown>(raw), menuName);
  if (recipe) return recipe;
  throwIfServerFailure(raw);
  return null;
}

/**
 * Daftar menu (sudah dirapikan) dari balasan server; kosong bila tidak terbaca.
 * Melempar ServerSideError bila balasannya pesan kegagalan model di sisi server.
 */
export function readMenuReply(raw: string): MenuItem[] {
  if (!raw.trim()) return [];
  const parsed = extractJsonArray<MenuItem>(raw);
  const menus = parsed ? normalizeMenuList(parsed) : [];
  if (menus.length > 0) return menus;
  throwIfServerFailure(raw);
  return [];
}
