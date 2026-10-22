import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Heart,
  MapPin,
  RefreshCw,
  Search,
  Sun,
  Wind,
} from 'lucide-react';

const CITIES = [
  { id: 'ha-noi', name: 'Hà Nội', region: 'Miền Bắc', latitude: 21.0285, longitude: 105.8542 },
  { id: 'hai-phong', name: 'Hải Phòng', region: 'Miền Bắc', latitude: 20.8449, longitude: 106.6881 },
  { id: 'hue', name: 'Huế', region: 'Miền Trung', latitude: 16.4637, longitude: 107.5909 },
  { id: 'da-nang', name: 'Đà Nẵng', region: 'Miền Trung', latitude: 16.0544, longitude: 108.2022 },
  { id: 'nha-trang', name: 'Nha Trang', region: 'Miền Trung', latitude: 12.2388, longitude: 109.1967 },
  { id: 'da-lat', name: 'Đà Lạt', region: 'Tây Nguyên', latitude: 11.9404, longitude: 108.4583 },
  { id: 'ho-chi-minh', name: 'TP. Hồ Chí Minh', region: 'Miền Nam', latitude: 10.8231, longitude: 106.6297 },
  { id: 'can-tho', name: 'Cần Thơ', region: 'Miền Nam', latitude: 10.0452, longitude: 105.7469 },
];

const WEATHER_TYPES = [
  { codes: [0], label: 'Trời quang', icon: Sun, tone: 'sunny' },
  { codes: [1, 2, 3], label: 'Có mây', icon: Cloud, tone: 'cloudy' },
  { codes: [45, 48], label: 'Sương mù', icon: CloudFog, tone: 'cloudy' },
  { codes: [51, 53, 55, 56, 57], label: 'Mưa phùn', icon: CloudDrizzle, tone: 'rainy' },
  { codes: [61, 63, 65, 66, 67], label: 'Mưa', icon: CloudRain, tone: 'rainy' },
  { codes: [71, 73, 75, 77], label: 'Tuyết', icon: CloudSnow, tone: 'cloudy' },
  { codes: [80, 81, 82, 85, 86], label: 'Mưa rào', icon: CloudRain, tone: 'rainy' },
  { codes: [95, 96, 99], label: 'Dông', icon: CloudLightning, tone: 'stormy' },
];

function weatherFor(code) {
  return WEATHER_TYPES.find((type) => type.codes.includes(code)) ?? WEATHER_TYPES[1];
}

function normalizeVietnamese(value) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function formatTime(value) {
  const [date, time] = value.split('T');
  if (!date || !time) return value;
  const [year, month, day] = date.split('-');
  return `${time.slice(0, 5)} · ${day}/${month}/${year}`;
}

function formatDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    weekday: new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(date),
    date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
  };
}

function App() {
  const [selectedCityId, setSelectedCityId] = useState(null);
  const [unit, setUnit] = useState('C');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('weather-favorites') ?? '[]');
      return Array.isArray(stored) ? stored.filter((id) => CITIES.some((city) => city.id === id)) : [];
    } catch {
      return [];
    }
  });
  const [weatherByCity, setWeatherByCity] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const cacheRef = useRef({});
  const requestRef = useRef(0);

  const selectedCity = CITIES.find((city) => city.id === selectedCityId) ?? null;
  const weather = selectedCityId ? weatherByCity[selectedCityId] : null;
  const visibleCities = useMemo(() => {
    const normalizedQuery = normalizeVietnamese(query.trim());
    return CITIES.filter((city) => normalizeVietnamese(city.name).includes(normalizedQuery));
  }, [query]);

  useEffect(() => {
    try {
      localStorage.setItem('weather-favorites', JSON.stringify(favorites));
    } catch {
      // Favorites remain available for the current session when storage is unavailable.
    }
  }, [favorites]);

  const loadWeather = async (city, forceRefresh = false) => {
    const requestId = ++requestRef.current;
    setSelectedCityId(city.id);
    setError('');

    if (!forceRefresh && cacheRef.current[city.id]) {
      setLoading(false);
      setWeatherByCity((current) => ({ ...current, [city.id]: cacheRef.current[city.id] }));
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      latitude: city.latitude,
      longitude: city.longitude,
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Ho_Chi_Minh',
      forecast_days: '7',
    });

    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Không thể tải dữ liệu (mã ${response.status}).`);

      const data = await response.json();
      if (
        !data.current ||
        typeof data.current.time !== 'string' ||
        !Number.isFinite(data.current.temperature_2m) ||
        !Number.isFinite(data.current.relative_humidity_2m) ||
        !Number.isFinite(data.current.wind_speed_10m) ||
        !Number.isFinite(data.current.weather_code) ||
        !data.daily ||
        !Array.isArray(data.daily.time) ||
        data.daily.time.length !== 7 ||
        !Array.isArray(data.daily.weather_code) ||
        data.daily.weather_code.length !== 7 ||
        !Array.isArray(data.daily.temperature_2m_max) ||
        data.daily.temperature_2m_max.length !== 7 ||
        !Array.isArray(data.daily.temperature_2m_min) ||
        data.daily.temperature_2m_min.length !== 7
      ) {
        throw new Error('Dữ liệu thời tiết trả về không hợp lệ.');
      }

      if (requestId !== requestRef.current) return;
      cacheRef.current[city.id] = data;
      setWeatherByCity((current) => ({ ...current, [city.id]: data }));
    } catch (fetchError) {
      if (requestId !== requestRef.current) return;
      setError(fetchError instanceof Error ? fetchError.message : 'Đã có lỗi xảy ra khi tải thời tiết.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  };

  const toggleFavorite = (cityId) => {
    setFavorites((current) =>
      current.includes(cityId) ? current.filter((id) => id !== cityId) : [...current, cityId],
    );
  };

  const toDisplayTemperature = (temperature) =>
    Math.round(unit === 'C' ? temperature : (temperature * 9) / 5 + 32);

  const condition = weather ? weatherFor(weather.current.weather_code) : null;
  const CurrentIcon = condition?.icon;

  return (
    <div className={`app-shell${condition ? ` theme-${condition.tone}` : ''}`}>
      <header className="topbar">
        <span className="topbar-title">Thời tiết Việt Nam</span>
        <div className="topbar-right">
          <div className="unit-switch" role="group" aria-label="Đơn vị nhiệt độ">
            <button className={unit === 'C' ? 'active' : ''} onClick={() => setUnit('C')} aria-pressed={unit === 'C'}>
              °C
            </button>
            <button className={unit === 'F' ? 'active' : ''} onClick={() => setUnit('F')} aria-pressed={unit === 'F'}>
              °F
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">DỰ BÁO THỜI TIẾT</p>
            <h1>Thời tiết <span>khắp Việt Nam</span></h1>
            <p className="intro-copy">Cập nhật điều kiện thời tiết và dự báo 7 ngày tại các thành phố.</p>
          </div>
          <div className="live-badge"><span className="live-dot" /> DỮ LIỆU TRỰC TIẾP</div>
        </section>

        <div className="dashboard">
          <aside className="city-panel">
            <div className="panel-heading">
              <div>
                <h2>Thành phố</h2>
                <p>Chọn một địa điểm để xem dự báo</p>
              </div>
              <span className="city-count">{visibleCities.length.toString().padStart(2, '0')}</span>
            </div>

            <label className="search-box">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                placeholder="Tìm thành phố..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Tìm thành phố"
              />
              {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Xóa tìm kiếm">×</button>}
            </label>

            <div className="city-list" aria-label="Danh sách thành phố">
              {visibleCities.map((city) => {
                const isSelected = city.id === selectedCityId;
                const isFavorite = favorites.includes(city.id);
                const cityWeather = weatherByCity[city.id];
                const CityIcon = cityWeather ? weatherFor(cityWeather.current.weather_code).icon : MapPin;
                return (
                  <div className={`city-row${isSelected ? ' selected' : ''}`} key={city.id}>
                    <button className="city-select" onClick={() => loadWeather(city)} aria-pressed={isSelected}>
                      <span className="city-icon"><CityIcon size={18} /></span>
                      <span className="city-name-group">
                        <span className="city-name">{city.name}</span>
                        <span className="city-region">{city.region}</span>
                      </span>
                      {cityWeather && <span className="city-temperature">{toDisplayTemperature(cityWeather.current.temperature_2m)}°</span>}
                    </button>
                    <button
                      className={`favorite-button${isFavorite ? ' favorited' : ''}`}
                      onClick={() => toggleFavorite(city.id)}
                      aria-label={`${isFavorite ? 'Bỏ yêu thích' : 'Thêm yêu thích'} ${city.name}`}
                      aria-pressed={isFavorite}
                    >
                      <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              })}
              {visibleCities.length === 0 && <p className="empty-search">Không tìm thấy thành phố phù hợp.</p>}
            </div>
            <div className="sidebar-footer">
              <span className="source-mark"><span>O</span></span>
              <span>Dữ liệu bởi <strong>Open-Meteo</strong></span>
            </div>
          </aside>

          <section className="weather-content" aria-live="polite">
            {!selectedCity && (
              <div className="empty-state">
                <div className="empty-illustration"><Sun size={46} strokeWidth={1.35} /><Cloud size={34} strokeWidth={1.4} /></div>
                <p className="eyebrow">SẴN SÀNG KHÁM PHÁ</p>
                <h2>Chọn thành phố của bạn</h2>
                <p>Thời tiết hiện tại và dự báo 7 ngày sẽ xuất hiện tại đây.</p>
                <button className="suggested-city" onClick={() => loadWeather(CITIES[0])}>
                  <MapPin size={15} /> Xem thời tiết Hà Nội
                </button>
              </div>
            )}

            {selectedCity && loading && (
              <div className="status-card">
                <div className="spinner" />
                <h2>Đang cập nhật thời tiết</h2>
                <p>Đang lấy dữ liệu mới nhất cho {selectedCity.name}...</p>
              </div>
            )}

            {selectedCity && !loading && error && (
              <div className="status-card error-card" role="alert">
                <div className="error-symbol">!</div>
                <p className="eyebrow">ĐÃ CÓ LỖI XẢY RA</p>
                <h2>Không thể tải dữ liệu</h2>
                <p>{error}</p>
                <button className="retry-button" onClick={() => loadWeather(selectedCity, true)}>
                  <RefreshCw size={15} /> Thử lại
                </button>
              </div>
            )}

            {selectedCity && !loading && !error && weather && condition && CurrentIcon && (
              <>
                <section className={`current-card ${condition.tone}`}>
                  <div className="current-topline">
                    <div className="location-label"><MapPin size={15} /> {selectedCity.name}, Việt Nam</div>
                    <button className="refresh-button" onClick={() => loadWeather(selectedCity, true)} aria-label="Cập nhật thời tiết">
                      <RefreshCw size={16} />
                    </button>
                  </div>
                  <div className="current-main">
                    <div className="current-condition">
                      <div className="weather-icon-wrap"><CurrentIcon size={62} strokeWidth={1.45} /></div>
                      <p>{condition.label}</p>
                    </div>
                    <div className="temperature-block">
                      <div className="temperature">{toDisplayTemperature(weather.current.temperature_2m)}<span>°{unit}</span></div>
                      <p>Nhiệt độ không khí</p>
                    </div>
                  </div>
                  <div className="current-footer">
                    <span><span className="live-dot" /> Cập nhật lúc {formatTime(weather.current.time)}</span>
                    <span className="timezone-label">Giờ Việt Nam (GMT+7)</span>
                  </div>
                </section>

                <section className="details-grid" aria-label="Thông tin thời tiết hiện tại">
                  <div className="detail-card">
                    <span className="detail-icon humidity-icon"><span>％</span></span>
                    <div><p>Độ ẩm</p><strong>{weather.current.relative_humidity_2m}<span>%</span></strong></div>
                    <span className="detail-caption">Không khí</span>
                  </div>
                  <div className="detail-card">
                    <span className="detail-icon wind-icon"><Wind size={19} /></span>
                    <div><p>Tốc độ gió</p><strong>{Math.round(weather.current.wind_speed_10m)}<span> km/h</span></strong></div>
                    <span className="detail-caption">Gió mặt đất</span>
                  </div>
                </section>

                <section className="forecast-section">
                  <div className="section-title">
                    <div><p className="eyebrow">NHÌN TRƯỚC MỖI NGÀY</p><h2>Dự báo 7 ngày</h2></div>
                    <span className="forecast-location"><MapPin size={14} /> {selectedCity.name}</span>
                  </div>
                  <div className="forecast-list">
                    {weather.daily.time.map((day, index) => {
                      const dailyCondition = weatherFor(weather.daily.weather_code[index]);
                      const DailyIcon = dailyCondition.icon;
                      const formatted = formatDay(day);
                      return (
                        <div className="forecast-day" key={day}>
                          <div className="forecast-date"><strong>{index === 0 ? 'Hôm nay' : formatted.weekday}</strong><span>{formatted.date}</span></div>
                          <DailyIcon className={`forecast-weather ${dailyCondition.tone}`} size={21} strokeWidth={1.7} aria-label={dailyCondition.label} />
                          <span className="forecast-label">{dailyCondition.label}</span>
                          <div className="forecast-temperatures">
                            <strong>{toDisplayTemperature(weather.daily.temperature_2m_max[index])}°</strong>
                            <span>{toDisplayTemperature(weather.daily.temperature_2m_min[index])}°</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </section>
        </div>

        <footer className="page-footer">
          <span>Được tạo để bạn luôn bắt nhịp với thời tiết.</span>
          <span>© 2026 Mây Weather <span className="footer-separator">·</span> Dữ liệu thời tiết bởi Open-Meteo</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
