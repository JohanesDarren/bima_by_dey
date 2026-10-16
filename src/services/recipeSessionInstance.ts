import { createRecipeSession } from './recipeSession';
import { getRecipe } from './menu';

/**
 * Sesi resep untuk seluruh aplikasi — satu instance, hidup selama app berjalan.
 *
 * Kenapa terpisah dari module murninya (`services/recipeSession`): module itu sengaja
 * tak tahu apa-apa soal jaringan (pengambil resep disuntikkan), jadi bisa diuji tanpa
 * server. Di SINI-lah pengambil aslinya (`getRecipe`) disuntikkan. Karena itu pula file
 * ini terpisah dari hook `hooks/useRecipeSession`: layar yang cuma perlu memanggil aksi
 * (mis. riwayat membuka snapshot) tak perlu mengimpor module ber-React.
 */
export const recipeSession = createRecipeSession(getRecipe);
