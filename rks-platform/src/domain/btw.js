// Btw-regels voor de facturen.
//
// '21'      normaal tarief, 21% btw op de factuur
// 'verlegd' btw verlegd naar de afnemer (onderaanneming of inlening in de bouw);
//           op de factuur staan "Btw verlegd" en het btw-id van de afnemer
// 'geen'    geen btw, bijvoorbeeld een zzp'er die de kleineondernemersregeling (KOR) gebruikt
//
// Of de verleggingsregeling geldt, bepaal je per opdracht. Laat dit bij twijfel
// toetsen door de boekhouder.

export const BTW_TARIEF = 21;

export const REGELINGEN = {
  '21': 'Btw 21%',
  verlegd: 'Btw verlegd',
  geen: 'Geen btw (KOR)',
};

export function btwBedrag(subtotaalCents, regeling) {
  return regeling === '21' ? Math.round((subtotaalCents * BTW_TARIEF) / 100) : 0;
}

// Welke regeling geldt voor de inkoopfactuur van een zzp'er aan RKS.
export function inkoopRegeling(plaatsing, zzp) {
  if (zzp.btw_regime === 'kor') return 'geen';
  return plaatsing.inkoop_btw;
}

// Teksten die verplicht of gebruikelijk op de factuur staan.
export function factuurVermeldingen({ regeling, afnemerBtwId, selfbilling }) {
  const out = [];
  if (selfbilling) out.push('Factuur uitgereikt door afnemer');
  if (regeling === 'verlegd') out.push(`Btw verlegd${afnemerBtwId ? ` naar ${afnemerBtwId}` : ''}`);
  if (regeling === 'geen') out.push('Vrijgesteld van btw op grond van de kleineondernemersregeling');
  return out;
}
