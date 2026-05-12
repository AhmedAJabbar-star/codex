const TIME_SLOTS = [
  { from: '08:30', to: '10:30' },
  { from: '10:30', to: '12:30' },
  { from: '12:30', to: '14:30' },
  { from: '14:30', to: '16:30' },
  { from: '16:30', to: '18:30' },
];

export const TIME_OPTIONS_ARABIC: string[] = (() => {
  const set = new Set<string>();
  TIME_SLOTS.forEach((slot) => {
    set.add(slot.from);
    set.add(slot.to);
  });
  return Array.from(set)
    .sort((a, b) => {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    })
    .map((time) => {
      const [hStr, mStr] = time.split(':');
      let hour = parseInt(hStr, 10);
      const minute = parseInt(mStr, 10);
      const period = hour >= 12 ? 'PM' : 'AM';
      if (hour > 12) hour -= 12;
      if (hour === 0) hour = 12;
      return `${hour}:${minute.toString().padStart(2, '0')}:00 ${period}`;
    });
})();