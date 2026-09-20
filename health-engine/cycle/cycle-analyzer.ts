export function averageCycleLength(starts: Date[]) { if(starts.length<2)return undefined; const sorted=[...starts].sort((a,b)=>+a-+b); const gaps=sorted.slice(1).map((d,i)=>(+d-+sorted[i])/86400000); return Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length); }
export function cycleDay(start?:Date, today=new Date()) { return start ? Math.floor((+today-+start)/86400000)+1 : undefined; }

/** A cautious, informational summary of a user's recorded cycle history. */
export function analyzeCycleHistory(starts: Date[], typicalLength?: number, today=new Date()) {
  const sorted=[...starts].sort((a,b)=>+a-+b);
  const average=averageCycleLength(sorted) ?? typicalLength;
  const lastStart=sorted.at(-1);
  const nextPeriod=lastStart&&average ? new Date(+lastStart + average*86400000) : undefined;
  const delayDays=nextPeriod?Math.max(0,Math.floor((+today-+nextPeriod)/86400000)):0;
  const gaps=sorted.slice(1).map((date,index)=>(+date-+sorted[index])/86400000);
  const irregular=gaps.length>=2 && Math.max(...gaps)-Math.min(...gaps)>=8;
  const status:'LATE'|'ON_TRACK'|'NEED_HISTORY'=average&&lastStart?(delayDays>=7?'LATE':'ON_TRACK'):'NEED_HISTORY';
  const message=status==='NEED_HISTORY'
    ? 'Tambahkan setidaknya dua tanggal mulai haid agar pola siklus dapat diperkirakan.'
    : status==='LATE' ? `Haid diperkirakan terlambat sekitar ${delayDays} hari dibanding pola yang tercatat.`
    : `Perkiraan berikutnya didasarkan pada pola siklus ${average} hari.`;
  const guidance=status==='LATE'
    ? 'Keterlambatan dapat dipengaruhi stres, perubahan berat badan, aktivitas, obat, atau kehamilan. Bila ada kemungkinan hamil, pertimbangkan tes kehamilan sesuai petunjuk kemasan. Konsultasikan tenaga kesehatan bila terlambat berulang, lebih dari 90 hari tidak haid, atau Anda khawatir.'
    : irregular ? 'Panjang siklus yang tercatat cukup bervariasi. Teruskan pencatatan; konsultasikan tenaga kesehatan bila pola ini baru terjadi, mengganggu, atau disertai keluhan lain.'
    : 'Ini adalah perkiraan untuk membantu Anda mengenali pola, bukan diagnosis atau alat kontrasepsi.';
  return {averageLength:average,lastStart,nextPeriod,delayDays,irregular,status,message,guidance};
}
