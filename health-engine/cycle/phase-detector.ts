export type Phase = 'Menstrual'|'Follicular'|'Likely ovulatory window'|'Luteal'|'Unknown';
export function detectPhase(day?:number, length=28): Phase { if(!day) return 'Unknown'; if(day<=5)return 'Menstrual'; if(day < length-16)return 'Follicular'; if(day<=length-12)return 'Likely ovulatory window'; return 'Luteal'; }
