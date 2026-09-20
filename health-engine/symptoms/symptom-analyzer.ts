export function summarizeSymptoms(symptoms:{name:string;severity:number}[]){return symptoms.length?`${symptoms.length} symptom${symptoms.length===1?'':'s'} logged`:'No symptoms logged';}
