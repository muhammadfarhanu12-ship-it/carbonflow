// @ts-check

const ApiError = require("../utils/ApiError");
const {
  SHIPMENT_EMISSIONS_CONFIG,
  getEmissionFactor,
  getLowestEmissionMode,
  normalizeEmissionFactorSource,
  normalizeTransportMode,
} = require("../config/shipmentEmissionFactors");
const {
  buildRouteLabel,
  convertKgToTonnes,
  isUuid,
  roundTo,
  toDate,
  toFiniteNumber,
  toTrimmedString,
} = require("../utils/shipmentEmissions");

/** @typedef {import("../models/shipment-emissions.types").Shipment} Shipment */
/** @typedef {import("../models/shipment-emissions.types").EmissionResult} EmissionResult */
/** @typedef {import("../models/shipment-emissions.types").ScenarioComparison} ScenarioComparison */
/** @typedef {import("../models/shipment-emissions.types").ShipmentEmissionsResponseData} ShipmentEmissionsResponseData */

function createValidationIssue(shipmentIndex, field, code, message, value, shipmentId) {
  const issue = {
    shipmentIndex,
    field,
    code,
    message,
  };

  if (shipmentId) {
    issue.shipmentId = shipmentId;
  }

  if (value !== undefined) {
    issue.value = value;
  }

  return issue;
}

function throwValidationError(issues) {
  throw new ApiError(422, "Shipment validation failed", issues);
}

function ensureShipmentsArray(shipments) {
  if (!Array.isArray(shipments)) {
    throw new ApiError(400, "Request body must be an array of shipments");
  }

  if (shipments.length === 0) {
    throwValidationError([
      createValidationIssue(-1, "body", "EMPTY_ARRAY", "At least one shipment is required"),
    ]);
  }
}

function collectDuplicateIssues(shipments) {
  const seenIds = new Map();
  const issues = [];

  shipments.forEach((shipment, shipmentIndex) => {
    if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
      return;
    }

    const shipmentId = toTrimmedString(shipment.id);
    if (!shipmentId) {
      return;
    }

    if (seenIds.has(shipmentId)) {
      issues.push(
        createValidationIssue(
          shipmentIndex,
          "id",
          "DUPLICATE_SHIPMENT",
          `Duplicate shipment id "${shipmentId}" found in request payload`,
          shipmentId,
          shipmentId,
        ),
      );
      return;
    }

    seenIds.set(shipmentId, shipmentIndex);
  });

  return issues;
}

function resolveDistanceKm(distanceKmInput) {
  if (distanceKmInput === undefined || distanceKmInput === null || distanceKmInput === "") {
    return {
      distanceKm: SHIPMENT_EMISSIONS_CONFIG.distance.fallbackKm,
      usedFallbackDistance: true,
    };
  }

  const distanceKm = toFiniteNumber(distanceKmInput);

  return {
    distanceKm,
    usedFallbackDistance: false,
  };
}

function validateAndNormalizeShipment(shipment, shipmentIndex) {
  const issues = [];

  if (!shipment || typeof shipment !== "object" || Array.isArray(shipment)) {
    return {
      issues: [
        createValidationIssue(
          shipmentIndex,
          "shipment",
          "INVALID_OBJECT",
          "Each shipment entry must be an object",
          shipment,
        ),
      ],
    };
  }

  const shipmentId = toTrimmedString(shipment.id);
  if (!shipmentId) {
    issues.push(createValidationIssue(shipmentIndex, "id", "REQUIRED", "id is required"));
  } else if (!isUuid(shipmentId)) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "id",
        "INVALID_UUID",
        "id must be a valid UUID",
        shipment.id,
        shipmentId,
      ),
    );
  }

  const origin = toTrimmedString(shipment.origin);
  if (!origin) {
    issues.push(createValidationIssue(shipmentIndex, "origin", "REQUIRED", "origin is required"));
  }

  const destination = toTrimmedString(shipment.destination);
  if (!destination) {
    issues.push(
      createValidationIssue(shipmentIndex, "destination", "REQUIRED", "destination is required"),
    );
  }

  const transportMode = normalizeTransportMode(shipment.transportMode);
  if (!transportMode) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "transportMode",
        "INVALID_ENUM",
        `transportMode must be one of: ${SHIPMENT_EMISSIONS_CONFIG.transportModes.join(", ")}`,
        shipment.transportMode,
        shipmentId || undefined,
      ),
    );
  }

  const emissionFactorSource = normalizeEmissionFactorSource(
    shipment.emissionFactorSource || SHIPMENT_EMISSIONS_CONFIG.defaultEmissionFactorSource,
  );
  if (!emissionFactorSource) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "emissionFactorSource",
        "INVALID_ENUM",
        `emissionFactorSource must be one of: ${SHIPMENT_EMISSIONS_CONFIG.emissionFactorSources.join(", ")}`,
        shipment.emissionFactorSource,
        shipmentId || undefined,
      ),
    );
  }

  const weightKg = toFiniteNumber(shipment.weightKg);
  if (weightKg === null) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "weightKg",
        "REQUIRED",
        "weightKg is required and must be numeric",
        shipment.weightKg,
        shipmentId || undefined,
      ),
    );
  } else if (weightKg <= 0) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "weightKg",
        "INVALID_RANGE",
        "weightKg must be greater than 0",
        shipment.weightKg,
        shipmentId || undefined,
      ),
    );
  }

  const fuelType = toTrimmedString(shipment.fuelType);
  if (!fuelType) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "fuelType",
        "REQUIRED",
        "fuelType is required",
        shipment.fuelType,
        shipmentId || undefined,
      ),
    );
  }

  const { distanceKm, usedFallbackDistance } = resolveDistanceKm(shipment.distanceKm);
  if (distanceKm === null) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "distanceKm",
        "INVALID_NUMBER",
        "distanceKm must be numeric when provided",
        shipment.distanceKm,
        shipmentId || undefined,
      ),
    );
  } else if (!usedFallbackDistance && distanceKm <= 0) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "distanceKm",
        "INVALID_RANGE",
        "distanceKm must be greater than 0 when provided",
        shipment.distanceKm,
        shipmentId || undefined,
      ),
    );
  }

  const createdAt = toDate(shipment.createdAt);
  if (!createdAt) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "createdAt",
        "INVALID_DATE",
        "createdAt must be a valid date",
        shipment.createdAt,
        shipmentId || undefined,
      ),
    );
  }

  const updatedAt = toDate(shipment.updatedAt);
  if (!updatedAt) {
    issues.push(
      createValidationIssue(
        shipmentIndex,
        "updatedAt",
        "INVALID_DATE",
        "updatedAt must be a valid date",
        shipment.updatedAt,
        shipmentId || undefined,
      ),
    );
  }

  const cargoType = toTrimmedString(shipment.cargoType) || null;

  if (issues.length > 0) {
    return { issues };
  }

  return {
    issues: [],
    value: {
      id: shipmentId,
      origin,
      destination,
      distanceKm,
      usedFallbackDistance,
      weightKg,
      transportMode,
      fuelType,
      emissionFactorSource,
      cargoType,
      createdAt,
      updatedAt,
    },
  };
}

function calculateTonKm(distanceKm, weightTonnes) {
  return roundTo(
    Number(distanceKm) * Number(weightTonnes),
    SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
  );
}

function calculateEmissionsForFactor(distanceKm, weightTonnes, emissionFactor) {
  const tonKm = calculateTonKm(distanceKm, weightTonnes);
  const emissions = roundTo(
    (tonKm * Number(emissionFactor)) / 1000,
    SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
  );

  return {
    tonKm,
    emissions,
    intensity: tonKm > 0
      ? roundTo(
        emissions / tonKm,
        SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
      )
      : 0,
  };
}

function buildScenarioComparison(shipment, weightTonnes, baselineEmissions) {
  const baselineMode = shipment.transportMode;
  const baselineSource = shipment.emissionFactorSource;
  const preferredAlternativeMode = baselineMode === "Air"
    ? SHIPMENT_EMISSIONS_CONFIG.scenarioComparison.preferredAirAlternativeMode
    : getLowestEmissionMode(baselineSource);
  const alternativeMode = preferredAlternativeMode || baselineMode;
  const alternativeFactor = getEmissionFactor(baselineSource, alternativeMode) || 0;
  const alternativeMetrics = calculateEmissionsForFactor(
    shipment.distanceKm,
    weightTonnes,
    alternativeFactor,
  );
  const emissionsSaved = roundTo(
    Math.max(baselineEmissions - alternativeMetrics.emissions, 0),
    SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
  );
  const percentageReduction = baselineEmissions > 0
    ? roundTo(
      (emissionsSaved / baselineEmissions) * 100,
      SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
    )
    : 0;

  /** @type {ScenarioComparison} */
  const scenarioComparison = {
    baselineMode,
    alternativeMode,
    baselineEmissions: roundTo(
      baselineEmissions,
      SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
    ),
    alternativeEmissions: roundTo(
      alternativeMetrics.emissions,
      SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
    ),
    emissionsSaved,
    percentageReduction,
  };

  return scenarioComparison;
}

/**
 * @param {Shipment[]} shipments
 * @returns {EmissionResult[]}
 */
function calculateShipmentEmissions(shipments) {
  ensureShipmentsArray(shipments);

  const duplicateIssues = collectDuplicateIssues(shipments);
  if (duplicateIssues.length > 0) {
    throwValidationError(duplicateIssues);
  }

  const normalizedShipments = [];
  const validationIssues = [];

  shipments.forEach((shipment, shipmentIndex) => {
    const normalizedShipment = validateAndNormalizeShipment(shipment, shipmentIndex);

    if (normalizedShipment.issues.length > 0) {
      validationIssues.push(...normalizedShipment.issues);
      return;
    }

    normalizedShipments.push(normalizedShipment.value);
  });

  if (validationIssues.length > 0) {
    throwValidationError(validationIssues);
  }

  return normalizedShipments.map((shipment) => {
    const emissionFactor = getEmissionFactor(
      shipment.emissionFactorSource,
      shipment.transportMode,
    );

    if (emissionFactor === null) {
      throw new ApiError(500, "Emission factor configuration is incomplete for the requested shipment");
    }

    const rawWeightTonnes = Number(shipment.weightKg) / 1000;
    const weightTonnes = convertKgToTonnes(
      shipment.weightKg,
      SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
    );
    const metrics = calculateEmissionsForFactor(
      shipment.distanceKm,
      rawWeightTonnes,
      emissionFactor,
    );

    /** @type {EmissionResult} */
    const result = {
      shipmentId: shipment.id,
      routeLabel: buildRouteLabel(shipment.origin, shipment.destination),
      origin: shipment.origin,
      destination: shipment.destination,
      distanceKm: roundTo(
        shipment.distanceKm,
        SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
      ),
      usedFallbackDistance: shipment.usedFallbackDistance,
      weightKg: roundTo(
        shipment.weightKg,
        SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
      ),
      weightTonnes,
      tonKm: metrics.tonKm,
      transportMode: shipment.transportMode,
      fuelType: shipment.fuelType,
      emissionFactorSource: shipment.emissionFactorSource,
      emissionFactorKgCo2ePerTonKm: roundTo(
        emissionFactor,
        SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
      ),
      emissions: metrics.emissions,
      intensity: metrics.intensity,
      cargoType: shipment.cargoType,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
      scenarioComparison: buildScenarioComparison(
        shipment,
        rawWeightTonnes,
        metrics.emissions,
      ),
    };

    return result;
  });
}

function buildSummary(results) {
  const totalEmissions = roundTo(
    results.reduce((sum, item) => sum + Number(item.emissions || 0), 0),
    SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
  );
  const totalTonKm = results.reduce((sum, item) => sum + Number(item.tonKm || 0), 0);
  const avgIntensity = totalTonKm > 0
    ? roundTo(
      totalEmissions / totalTonKm,
      SHIPMENT_EMISSIONS_CONFIG.calculationPrecision,
    )
    : 0;

  return {
    totalEmissions,
    avgIntensity,
  };
}

function buildChartData(results) {
  return {
    labels: results.map((item) => item.routeLabel),
    datasets: [
      {
        label: "Emissions",
        data: results.map((item) => item.emissions),
      },
      {
        label: "Savings Potential",
        data: results.map((item) => item.scenarioComparison.emissionsSaved),
      },
    ],
  };
}

/**
 * @param {Shipment[]} shipments
 * @returns {Promise<ShipmentEmissionsResponseData>}
 */
async function buildShipmentEmissionsReport(shipments) {
  const results = calculateShipmentEmissions(shipments);

  return {
    summary: buildSummary(results),
    shipments: results,
    chartData: buildChartData(results),
  };
}

module.exports = {
  buildShipmentEmissionsReport,
  calculateShipmentEmissions,
};
