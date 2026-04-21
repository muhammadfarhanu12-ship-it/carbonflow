class CalculationService {

  static carbonIntensity(totalEmissions, revenue) {
    if (!revenue) return 0;
    return totalEmissions / revenue;
  }

}

module.exports = CalculationService;