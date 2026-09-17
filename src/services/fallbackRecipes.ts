import type { MenuItem, Recipe } from '../types';

export const FALLBACK_MENUS: MenuItem[] = [
  {
    name: 'Bubur Sorgum Ayam',
    description: 'Bubur hangat bertekstur lembut dengan ayam dan wortel.',
    nutrition: { notes: 'Sumber karbohidrat, protein, dan serat.' },
    strengths: ['Tekstur mudah disesuaikan', 'Bahan mudah ditemukan'],
    weaknesses: ['Sesuaikan garam dan topping dengan kebutuhan keluarga'],
    category: 'soup',
  },
  {
    name: 'Nasi Sorgum Sayur',
    description: 'Sorgum matang dengan sayuran warna-warni untuk menu keluarga.',
    nutrition: { notes: 'Mengandung serat dari sorgum dan sayuran.' },
    strengths: ['Mudah dipadukan dengan lauk', 'Cocok untuk makan siang'],
    weaknesses: ['Sorgum perlu direndam sebelum dimasak'],
    category: 'main_course',
  },
  {
    name: 'Puding Sorgum Pisang',
    description: 'Kudapan lembut berbahan sorgum dan pisang matang.',
    nutrition: { notes: 'Rasa manis terutama berasal dari pisang.' },
    strengths: ['Tekstur lembut', 'Sedikit gula tambahan'],
    weaknesses: ['Perhatikan bahan tambahan bila ada alergi'],
    category: 'dessert',
  },
];

const FALLBACK_RECIPES: Record<string, Recipe> = {
  'Bubur Sorgum Ayam': {
    name: 'Bubur Sorgum Ayam',
    servings: 4,
    ingredients: [
      '200 g sorgum sosoh',
      '1 liter air',
      '150 g ayam matang, suwir',
      '1 wortel kecil, potong halus',
      'Bawang putih dan garam secukupnya',
    ],
    steps: [
      {
        order: 1,
        title: 'Rendam sorgum',
        instruction: 'Cuci, lalu rendam sorgum minimal 4 jam.',
        durationMinutes: 240,
      },
      {
        order: 2,
        title: 'Rebus',
        instruction: 'Tiriskan. Rebus dengan air hingga mulai lunak.',
        durationMinutes: 35,
      },
      {
        order: 3,
        title: 'Masukkan isi',
        instruction: 'Tambahkan ayam, wortel, dan bawang putih. Aduk berkala.',
        durationMinutes: 15,
      },
      {
        order: 4,
        title: 'Sesuaikan tekstur',
        instruction: 'Tambahkan air bila perlu, lalu bumbui ringan.',
        durationMinutes: 10,
      },
    ],
    totalMinutes: 60,
  },
  'Nasi Sorgum Sayur': {
    name: 'Nasi Sorgum Sayur',
    servings: 4,
    ingredients: [
      '250 g sorgum sosoh',
      '750 ml air',
      '1 wortel',
      '100 g buncis',
      'Bawang putih dan garam secukupnya',
    ],
    steps: [
      {
        order: 1,
        title: 'Rendam sorgum',
        instruction: 'Cuci dan rendam sorgum minimal 4 jam.',
        durationMinutes: 240,
      },
      {
        order: 2,
        title: 'Masak sorgum',
        instruction: 'Rebus sorgum sampai empuk dan air terserap.',
        durationMinutes: 40,
      },
      {
        order: 3,
        title: 'Tumis sayuran',
        instruction: 'Tumis bawang putih, wortel, dan buncis hingga matang.',
        durationMinutes: 8,
      },
      {
        order: 4,
        title: 'Campurkan',
        instruction: 'Campurkan sayuran dengan sorgum, lalu bumbui.',
        durationMinutes: 5,
      },
    ],
    totalMinutes: 55,
  },
  'Puding Sorgum Pisang': {
    name: 'Puding Sorgum Pisang',
    servings: 4,
    ingredients: [
      '100 g sorgum matang',
      '2 pisang matang',
      '500 ml susu atau santan',
      '1 bungkus agar-agar tanpa rasa',
    ],
    steps: [
      {
        order: 1,
        title: 'Haluskan pisang',
        instruction: 'Lumatkan pisang sampai halus.',
        durationMinutes: null,
      },
      {
        order: 2,
        title: 'Campurkan',
        instruction: 'Campur semua bahan di dalam panci.',
        durationMinutes: 3,
      },
      {
        order: 3,
        title: 'Masak',
        instruction: 'Masak sambil diaduk sampai mendidih.',
        durationMinutes: 8,
      },
      {
        order: 4,
        title: 'Dinginkan',
        instruction: 'Tuang ke cetakan dan dinginkan sampai set.',
        durationMinutes: 45,
      },
    ],
    totalMinutes: 60,
  },
};

export function getFallbackRecipe(menuName: string): Recipe {
  const known = FALLBACK_RECIPES[menuName];
  if (known) return known;
  return {
    name: menuName,
    servings: 1,
    ingredients: [],
    steps: [
      {
        order: 1,
        title: 'Resep belum tersedia',
        instruction:
          'Detail resep ini belum tersimpan di perangkat. Coba lagi saat layanan resep kembali tersedia.',
        durationMinutes: null,
      },
    ],
    totalMinutes: 0,
  };
}
