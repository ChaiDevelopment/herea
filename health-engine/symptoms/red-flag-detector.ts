// Daftar konservatif. Nama dicocokkan tanpa memperhatikan huruf besar/kecil.
// Gejala berikut selalu dianggap perlu perhatian, berapa pun tingkat keparahannya.
const ALWAYS = new Set(['chest pain', 'difficulty breathing', 'fainting', 'sudden neurological symptoms']);
// Perlu perhatian bila keparahan >= 4 (skala 1–5).
const SEVERE_FROM_4 = new Set(['severe pain', 'heavy bleeding', 'severe dizziness', 'dizziness']);
// Nyeri pada skor tertinggi (5) untuk gejala nyeri yang ada di daftar gejala aplikasi.
const SEVERE_AT_5 = new Set(['cramps', 'back pain', 'headache']);

export function detectRedFlags(symptoms: { name: string; severity: number }[]) {
  return symptoms.filter((s) => {
    const name = s.name.toLowerCase();
    return ALWAYS.has(name) || (SEVERE_FROM_4.has(name) && s.severity >= 4) || (SEVERE_AT_5.has(name) && s.severity >= 5);
  });
}
