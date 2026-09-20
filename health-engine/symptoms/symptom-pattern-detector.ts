export function recurringPattern(values:number[], minimumOccurrences=3){return values.length>=minimumOccurrences && new Set(values).size===1;}
