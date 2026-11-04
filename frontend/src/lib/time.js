// Waktu selalu WIB (Asia/Jakarta), tidak tergantung zona waktu HP petugas
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function parts(d = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export const nowWibDate = () => parts().date;
export const nowWibTime = () => parts().time;
export const pad = n => String(n).padStart(2, '0');

export function splitTime(t) {
  const [h, m] = (t || nowWibTime()).split(':').map(Number);
  return { h, m };
}

export function longDate(date) {
  return new Date(`${date}T12:00:00+07:00`).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return parts(d).date;
}
