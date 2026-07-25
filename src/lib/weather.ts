// Live weather + AQI for Bhavnagar from free, no-key APIs.
// Weather: Open-Meteo. AQI: Open-Meteo Air Quality API.

import { BHAVNAGAR_CENTER } from './geo';

export interface WeatherData {
  temperature: number; // C
  windSpeed: number; // km/h
  windDir: number; // degrees
  precipitation: number; // mm
  humidity: number; // %
  weatherCode: number; // WMO code
  isDay: boolean;
  cloudCover: number; // %
  time: string;
}

export interface AqiData {
  pm10: number;
  pm25: number;
  europeanAqi: number;
  usAqi: number;
  time: string;
}

export async function fetchWeather(): Promise<WeatherData> {
  const { lat, lng } = BHAVNAGAR_CENTER;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation,relative_humidity_2m,weather_code,is_day,cloud_cover&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
  const json = await res.json();
  const c = json.current;
  return {
    temperature: c.temperature_2m,
    windSpeed: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    precipitation: c.precipitation,
    humidity: c.relative_humidity_2m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
    cloudCover: c.cloud_cover,
    time: c.time,
  };
}

export async function fetchAqi(): Promise<AqiData> {
  const { lat, lng } = BHAVNAGAR_CENTER;
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,european_aqi,us_aqi&timezone=Asia%2FKolkata`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AQI API failed: ${res.status}`);
  const json = await res.json();
  const c = json.current;
  return {
    pm10: c.pm10 ?? 0,
    pm25: c.pm2_5 ?? 0,
    europeanAqi: c.european_aqi ?? 0,
    usAqi: c.us_aqi ?? 0,
    time: c.time,
  };
}

export function weatherCodeToText(code: number): { label: string; icon: string } {
  const map: Record<number, { label: string; icon: string }> = {
    0: { label: 'Clear sky', icon: 'sun' },
    1: { label: 'Mainly clear', icon: 'sun' },
    2: { label: 'Partly cloudy', icon: 'cloud-sun' },
    3: { label: 'Overcast', icon: 'cloud' },
    45: { label: 'Fog', icon: 'fog' },
    48: { label: 'Rime fog', icon: 'fog' },
    51: { label: 'Light drizzle', icon: 'cloud-drizzle' },
    53: { label: 'Drizzle', icon: 'cloud-drizzle' },
    55: { label: 'Heavy drizzle', icon: 'cloud-drizzle' },
    61: { label: 'Light rain', icon: 'cloud-rain' },
    63: { label: 'Rain', icon: 'cloud-rain' },
    65: { label: 'Heavy rain', icon: 'cloud-rain' },
    71: { label: 'Light snow', icon: 'snowflake' },
    73: { label: 'Snow', icon: 'snowflake' },
    75: { label: 'Heavy snow', icon: 'snowflake' },
    80: { label: 'Rain showers', icon: 'cloud-rain' },
    81: { label: 'Rain showers', icon: 'cloud-rain' },
    82: { label: 'Violent rain', icon: 'cloud-rain' },
    95: { label: 'Thunderstorm', icon: 'cloud-lightning' },
    96: { label: 'Thunderstorm', icon: 'cloud-lightning' },
    99: { label: 'Thunderstorm', icon: 'cloud-lightning' },
  };
  return map[code] || { label: 'Unknown', icon: 'cloud' };
}

export function aqiCategory(usAqi: number): { label: string; color: string } {
  if (usAqi <= 50) return { label: 'Good', color: '#22c55e' };
  if (usAqi <= 100) return { label: 'Moderate', color: '#eab308' };
  if (usAqi <= 150) return { label: 'Unhealthy (Sensitive)', color: '#f97316' };
  if (usAqi <= 200) return { label: 'Unhealthy', color: '#ef4444' };
  if (usAqi <= 300) return { label: 'Very Unhealthy', color: '#a855f7' };
  return { label: 'Hazardous', color: '#7f1d1d' };
}
