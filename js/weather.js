// Wetter zum Tagebuchdatum über Open-Meteo (kostenlos, ohne Schlüssel). Der Ort wird in den Einstellungen gewählt.
const WMO = [
  [[0], 'Sonnig', 'sunny'], [[1, 2], 'Heiter', 'partly_cloudy_day'], [[3], 'Bewölkt', 'cloud'], [[45, 48], 'Nebel', 'foggy'],
  [[51, 53, 55, 56, 57], 'Nieselregen', 'rainy'], [[61, 63, 65, 66, 67, 80, 81, 82], 'Regen', 'rainy'],
  [[71, 73, 75, 77, 85, 86], 'Schnee', 'weather_snowy'], [[95, 96, 99], 'Gewitter', 'thunderstorm'],
];
export const describe = (code) => { const w = WMO.find(([c]) => c.includes(code)); return w ? { text: w[1], icon: w[2] } : { text: 'Wetter', icon: 'cloud' }; };
export const summary = (w) => w ? `${describe(w.code).text} · ${Math.round(w.tmax)}° / ${Math.round(w.tmin)}°${w.rain >= 0.1 ? ` · ${w.rain.toFixed(1).replace('.', ',')} mm` : ''}${w.wind >= 30 ? ` · Wind ${Math.round(w.wind)} km/h` : ''}` : '';

export async function searchPlaces(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`);
  if (!r.ok) throw new Error('Ortssuche nicht erreichbar');
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: [x.name, x.admin1, x.country_code].filter(Boolean).join(', '), lat: x.latitude, lon: x.longitude }));
}

export async function fetchWeather(loc, date) {
  const daysAgo = (Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000;
  if (daysAgo < -14) throw new Error('Für dieses Datum liegt noch kein Wetter vor.');
  const host = daysAgo > 85 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
  const url = `${host}?latitude=${loc.lat}&longitude=${loc.lon}&start_date=${date}&end_date=${date}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Wetterdienst nicht erreichbar');
  const d = (await r.json()).daily;
  if (!d || d.weather_code?.[0] == null) throw new Error('Kein Wetter für dieses Datum gefunden.');
  return { code: d.weather_code[0], tmax: d.temperature_2m_max[0], tmin: d.temperature_2m_min[0], rain: d.precipitation_sum[0] ?? 0, wind: d.wind_speed_10m_max[0] ?? 0, at: date };
}
