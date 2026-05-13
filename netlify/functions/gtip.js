exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { q } = event.queryStringParameters || {};
  if (!q || q.trim().length < 2) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'En az 2 karakter girin.' }) };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  const prompt = `Sen Türkiye gümrük tarife uzmanısın. Kullanıcı "${q.trim()}" arıyor.

Türkiye GTİP sistemine göre bu ürünle ilgili en uygun 6-8 GTİP kodunu listele.

SADECE JSON döndür, başka hiçbir şey yazma:
{"results":[{"kod":"3923100000","tanim":"Plastik kutu ve sandıklar","fasil":"39","fasilAdi":"Plastik ve mamulleri","aciklama":"Bu ürünün bu koda neden girdiğini 1-2 cümle Türkçe açıkla","vergi":"6.5"}]}

Kurallar:
- kod: 10 haneli gerçek GTİP kodu (uydurma)
- tanim: resmi tarife cetvelindeki kısa Türkçe tanım
- aciklama: ürünün bu koda neden girdiğine dair kısa açıklama
- vergi: tahmini gümrük vergisi % (bilmiyorsan boş string)
- Türkiye Armonize Sistem + AB Kombine Nomanklatür yapısını kullan`;

  // Önce Gemini dene
  if (GEMINI_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
          }),
        }
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      if (parsed.results?.length) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ results: parsed.results, query: q.trim(), source: 'gemini' }),
        };
      }
    } catch(e) { /* Gemini başarısız, Anthropic'e geç */ }
  }

  // Gemini yoksa veya başarısızsa Anthropic dene
  if (ANTHROPIC_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }]
        }),
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ results: parsed.results || [], query: q.trim(), source: 'anthropic' }),
      };
    } catch(e) {}
  }

  return {
    statusCode: 500, headers,
    body: JSON.stringify({ error: 'API anahtarı bulunamadı. Netlify Environment Variables kontrol edin.' }),
  };
};
