export const TRANSPORT_MODES = ["Air", "Sea", "Road", "Rail"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];

export const EMISSION_FACTOR_SOURCES = ["GLEC", "DEFRA", "EPA"] as const;
export type EmissionFactorSource = (typeof EMISSION_FACTOR_SOURCES)[number];

export interface Shipment {
  id: string;
  origin: string;
  destination: string;
  distanceKm?: number;
  weightKg: number;
  transportMode: TransportMode;
  fuelType: string;
  emissionFactorSource: EmissionFactorSource;
  cargoType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScenarioComparison {
  baselineMode: TransportMode;
  alternativeMode: TransportMode;
  baselineEmissions: number;
  alternativeEmissions: number;
  emissionsSaved: number;
  percentageReduction: number;
}

export interface EmissionResult {
  shipmentId: string;
  routeLabel: string;
  origin: string;
  destination: string;
  distanceKm: number;
  usedFallbackDistance: boolean;
  weightKg: number;
  weightTonnes: number;
  tonKm: number;
  transportMode: TransportMode;
  fuelType: string;
  emissionFactorSource: EmissionFactorSource;
  emissionFactorKgCo2ePerTonKm: number;
  emissions: number;
  intensity: number;
  cargoType?: string | null;
  createdAt: Date;
  updatedAt: Date;
  scenarioComparison: ScenarioComparison;
}

export interface ShipmentEmissionsSummary {
  totalEmissions: number;
  avgIntensity: number;
}

export interface ChartDataset {
  label: string;
  data: number[];
}

export interface ShipmentEmissionsChartData {
  labels: string[];
  datasets: [ChartDataset, ChartDataset];
}

export interface ShipmentEmissionsResponseData {
  summary: ShipmentEmissionsSummary;
  shipments: EmissionResult[];
  chartData: ShipmentEmissionsChartData;
}
