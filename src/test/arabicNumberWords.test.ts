import { describe, it, expect } from 'vitest';
import { integerToArabicWords, amountToIraqiDinarWords, formatAmountDigits } from '@/lib/arabicNumberWords';

describe('تفقيط المبالغ بالعربية', () => {
  it('أعداد صغيرة', () => {
    expect(integerToArabicWords(0)).toBe('صفر');
    expect(integerToArabicWords(7)).toBe('سبعة');
    expect(integerToArabicWords(15)).toBe('خمسة عشر');
    expect(integerToArabicWords(21)).toBe('واحد وعشرون');
    expect(integerToArabicWords(100)).toBe('مائة');
    expect(integerToArabicWords(540)).toBe('خمسمائة وأربعون');
  });

  it('آلاف وملايين ومليارات', () => {
    expect(integerToArabicWords(1000)).toBe('ألف');
    expect(integerToArabicWords(2000)).toBe('ألفان');
    expect(integerToArabicWords(3000)).toBe('ثلاثة آلاف');
    expect(integerToArabicWords(38_551_500)).toBe('ثمانية وثلاثون مليوناً وخمسمائة وواحد وخمسون ألفاً وخمسمائة');
    expect(integerToArabicWords(1_500_000_000)).toBe('مليار وخمسمائة مليون');
  });

  it('صيغة المبلغ الكاملة', () => {
    expect(amountToIraqiDinarWords(38_551_500)).toBe('ثمانية وثلاثون مليوناً وخمسمائة وواحد وخمسون ألفاً وخمسمائة ديناراً عراقياً لا غير');
    expect(amountToIraqiDinarWords(1)).toBe('واحد دينار عراقي لا غير');
  });

  it('التنسيق الرقمي', () => {
    expect(formatAmountDigits(38551500)).toBe('38,551,500');
    expect(formatAmountDigits(1234.5)).toBe('1,234.50');
  });
});
