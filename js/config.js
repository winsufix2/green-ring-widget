// Configuration and Geometry for Moscow Green Ring (Зеленое кольцо Москвы)
export const MAP_CONFIG = {
  // Original image dimensions
  imageWidth: 1513,
  imageHeight: 1116,

  // Geometry of the green ring circular route
  circleCenter: {
    x: 762.69,
    y: 570.96
  },
  circleRadius: 326.46,

  // Outer border of the diagram on map.png (used for circular mask/clipping)
  outerBorderRadius: 522.5,

  // Center of Moscow in GPS coordinates (Kremlin)
  moscowCenterGPS: {
    lat: 55.7522,
    lon: 37.6156
  },

  // Total route length of Moscow Green Ring
  totalRouteLengthKm: 160
};

// 24 calibrated park waypoints around the Moscow Green Ring in clockwise order from top
export const GREEN_RING_PARKS = [
  {
    id: 1,
    name: 'Ботанический сад',
    shortName: 'Бот. сад',
    sector: 'СВАО',
    lat: 55.8450,
    lon: 37.6350,
    angleDeg: -91.4,
    x: 754.5,
    y: 245.5,
    kmMark: 0
  },
  {
    id: 2,
    name: 'Парк «Сад будущего»',
    shortName: 'Сад будущего',
    sector: 'СВАО',
    lat: 55.8500,
    lon: 37.6520,
    angleDeg: -78.3,
    x: 828.5,
    y: 252.5,
    kmMark: 4.5
  },
  {
    id: 3,
    name: 'Парк спорта «Яуза»',
    shortName: 'Парк Яуза',
    sector: 'СВАО',
    lat: 55.8580,
    lon: 37.6720,
    angleDeg: -71.5,
    x: 865.5,
    y: 263.5,
    kmMark: 8.2
  },
  {
    id: 4,
    name: 'Парк «Акведук»',
    shortName: 'Акведук',
    sector: 'СВАО',
    lat: 55.8290,
    lon: 37.6620,
    angleDeg: -64.9,
    x: 900.5,
    y: 276.5,
    kmMark: 12.0
  },
  {
    id: 5,
    name: 'Лосиный Остров',
    shortName: 'Лосиный Остров',
    sector: 'ВАО',
    lat: 55.8280,
    lon: 37.7350,
    angleDeg: -52.7,
    x: 960.5,
    y: 311.5,
    kmMark: 18.5
  },
  {
    id: 6,
    name: 'Гольяновский парк',
    shortName: 'Гольяново',
    sector: 'ВАО',
    lat: 55.8210,
    lon: 37.8180,
    angleDeg: -37.9,
    x: 1018.5,
    y: 371.5,
    kmMark: 25.0
  },
  {
    id: 7,
    name: 'Парк «Измайлово»',
    shortName: 'Измайлово',
    sector: 'ВАО',
    lat: 55.7820,
    lon: 37.7850,
    angleDeg: -18.9,
    x: 1070.5,
    y: 465.5,
    kmMark: 33.0
  },
  {
    id: 8,
    name: 'Кусковский лесопарк',
    shortName: 'Кусково',
    sector: 'ВАО',
    lat: 55.7340,
    lon: 37.8080,
    angleDeg: 8.6,
    x: 1084.5,
    y: 619.5,
    kmMark: 43.5
  },
  {
    id: 9,
    name: 'Музей-заповедник «Кузьминки-Люблино»',
    shortName: 'Кузьминки',
    sector: 'ЮВАО',
    lat: 55.6900,
    lon: 37.7780,
    angleDeg: 24.2,
    x: 1059.5,
    y: 704.5,
    kmMark: 53.0
  },
  {
    id: 10,
    name: 'Парк 850-летия Москвы',
    shortName: 'Парк 850-летия',
    sector: 'ЮВАО',
    lat: 55.6480,
    lon: 37.7450,
    angleDeg: 43.5,
    x: 998.5,
    y: 794.5,
    kmMark: 64.0
  },
  {
    id: 11,
    name: 'Парк «Братеевская пойма»',
    shortName: 'Братеево',
    sector: 'ЮВАО',
    lat: 55.6320,
    lon: 37.7800,
    angleDeg: 56.2,
    x: 943.5,
    y: 841.5,
    kmMark: 71.5
  },
  {
    id: 12,
    name: 'Пойма реки Городни',
    shortName: 'Пойма Городни',
    sector: 'ЮАО',
    lat: 55.6300,
    lon: 37.7400,
    angleDeg: 66.0,
    x: 895.5,
    y: 869.5,
    kmMark: 77.0
  },
  {
    id: 13,
    name: 'Парк «Борисовские пруды»',
    shortName: 'Борисовские пруды',
    sector: 'ЮАО',
    lat: 55.6320,
    lon: 37.7000,
    angleDeg: 75.5,
    x: 844.5,
    y: 887.5,
    kmMark: 83.0
  },
  {
    id: 14,
    name: 'Аршиновский парк',
    shortName: 'Аршиновский парк',
    sector: 'ЮАО',
    lat: 55.6260,
    lon: 37.6530,
    angleDeg: 89.2,
    x: 767.5,
    y: 898.5,
    kmMark: 88.5
  },
  {
    id: 15,
    name: 'Битцевский лес',
    shortName: 'Битцевский лес',
    sector: 'ЮЗАО',
    lat: 55.6180,
    lon: 37.5680,
    angleDeg: 102.0,
    x: 694.5,
    y: 891.5,
    kmMark: 96.0
  },
  {
    id: 16,
    name: 'Долина реки Сетунь',
    shortName: 'Река Сетунь',
    sector: 'ЗАО',
    lat: 55.7080,
    lon: 37.4700,
    angleDeg: 142.1,
    x: 503.5,
    y: 772.5,
    kmMark: 110.0
  },
  {
    id: 17,
    name: 'Парк Победы',
    shortName: 'Парк Победы',
    sector: 'ЗАО',
    lat: 55.7310,
    lon: 37.5050,
    angleDeg: 160.8,
    x: 453.5,
    y: 678.5,
    kmMark: 118.0
  },
  {
    id: 18,
    name: 'Парк «Фили»',
    shortName: 'Фили',
    sector: 'ЗАО',
    lat: 55.7500,
    lon: 37.4750,
    angleDeg: 170.8,
    x: 438.5,
    y: 623.5,
    kmMark: 124.0
  },
  {
    id: 19,
    name: 'Парк Звёзд',
    shortName: 'Парк Звёзд',
    sector: 'ЗАО',
    lat: 55.7600,
    lon: 37.4350,
    angleDeg: -178.0,
    x: 432.5,
    y: 559.5,
    kmMark: 128.5
  },
  {
    id: 20,
    name: 'Набережная Троице-Лыково',
    shortName: 'Троице-Лыково',
    sector: 'СЗАО',
    lat: 55.7900,
    lon: 37.4000,
    angleDeg: -163.2,
    x: 449.5,
    y: 476.5,
    kmMark: 135.0
  },
  {
    id: 21,
    name: 'Набережная Строгинского затона',
    shortName: 'Строгино',
    sector: 'СЗАО',
    lat: 55.8050,
    lon: 37.4200,
    angleDeg: -150.8,
    x: 477.5,
    y: 411.5,
    kmMark: 139.5
  },
  {
    id: 22,
    name: 'Парк «Покровское-Стрешнево»',
    shortName: 'Покровское-Стрешнево',
    sector: 'СЗАО',
    lat: 55.8150,
    lon: 37.4850,
    angleDeg: -137.8,
    x: 519.5,
    y: 350.5,
    kmMark: 145.0
  },
  {
    id: 23,
    name: 'Тимирязевский парк',
    shortName: 'Тимирязевский парк',
    sector: 'САО',
    lat: 55.8280,
    lon: 37.5450,
    angleDeg: -120.7,
    x: 595.5,
    y: 289.5,
    kmMark: 151.5
  },
  {
    id: 24,
    name: 'ВДНХ / Останкино',
    shortName: 'ВДНХ',
    sector: 'СВАО',
    lat: 55.8300,
    lon: 37.6250,
    angleDeg: -99.0,
    x: 711.5,
    y: 248.5,
    kmMark: 157.0
  }
];
