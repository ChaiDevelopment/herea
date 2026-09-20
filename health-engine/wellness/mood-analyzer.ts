export function analyzeMood(mood?:string){return mood?({VERY_LOW:20,LOW:40,NEUTRAL:60,GOOD:80,GREAT:100} as Record<string,number>)[mood]:undefined;}
