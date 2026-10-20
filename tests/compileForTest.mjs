/**
 * Pembantu bersama untuk mengompilasi module TypeScript murni agar bisa diuji dengan
 * `node --test` bawaan — tanpa test runner pihak ketiga.
 *
 * Dua berkas uji (ai_core & conversation_turn) butuh langkah yang sama: kompilasi
 * sumber .ts ke sebuah folder sementara, kompilasi ulang hanya bila sumber berubah.
 * Dulu urutan itu disalin di tiap berkas uji; sekarang hidup di sini sekali saja.
 *
 * Hasil dikompilasi sebagai CommonJS supaya impor relatif tanpa ekstensi (gaya
 * TypeScript) tetap bisa diselesaikan `require` di Node — hal yang tidak bisa
 * dilakukan `import` ESM.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

/**
 * Kompilasi daftar sumber (path relatif terhadap repo) ke `outDir` bila salah satu
 * sumber lebih baru dari hasil sebelumnya. Mengembalikan fungsi `require` yang sudah
 * diarahkan ke folder hasil, siap memuat module yang sudah dikompilasi.
 */
export function compileForTest({ sources, outDir }) {
  const absSources = sources.map((rel) => path.join(REPO, rel));
  const newest = Math.max(...absSources.map((s) => fs.statSync(s).mtimeMs));
  const marker = path.join(outDir, '.stamp');
  const fresh = fs.existsSync(marker) && Number(fs.readFileSync(marker, 'utf8')) >= newest;

  if (!fresh) {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    execFileSync(
      'npx',
      [
        'tsc',
        ...absSources,
        '--ignoreConfig',
        '--rootDir',
        REPO,
        '--outDir',
        outDir,
        '--module',
        'commonjs',
        '--target',
        'es2020',
        '--moduleResolution',
        'node',
        '--ignoreDeprecations',
        '6.0',
        '--skipLibCheck',
      ],
      { cwd: REPO, stdio: 'inherit' },
    );
    fs.writeFileSync(marker, String(Date.now()));
  }

  return createRequire(path.join(outDir, 'x'));
}
