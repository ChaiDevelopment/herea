export function analyzeSleep(minutes?:number){if(minutes==null)return undefined;return Math.min(100,Math.max(0,100-Math.abs(minutes/60-8)*16));}
